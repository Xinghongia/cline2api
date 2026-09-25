package reqlog

import (
	"cline-go-proxy/internal/apphome"
	"cline-go-proxy/internal/strutil"
	"cline-go-proxy/internal/types"
	"database/sql"
	"encoding/base64"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

const (
	// RawLogRetention 原始请求日志保留时长（可按需调整）。
	RawLogRetention = 90 * 24 * time.Hour
	// HourlyRetention 小时聚合桶保留时长。
	HourlyRetention = 365 * 24 * time.Hour
	DefaultLimit    = 50
	MaxLimit        = 100
)

// Store 是基于 SQLite 的用量存储：request_logs（原始记录）+ usage_hourly（小时聚合桶）。
// 单连接 + WAL：个人规模足够，且天然串行化写入，规避 SQLITE_BUSY。
type Store struct {
	db      *sql.DB
	tmpPath string // 非空表示临时文件库，Close 时删除
}

// Close 关闭底层连接；临时库同时删除文件。
func (s *Store) Close() error {
	err := s.db.Close()
	if s.tmpPath != "" {
		os.Remove(s.tmpPath)
	}
	return err
}

var (
	global     *Store
	globalOnce sync.Once
	globalErr  error
	globalMu   sync.Mutex
)

func dsn(path string) string {
	return "file:" + strings.ReplaceAll(path, "\\", "/") +
		"?_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)"
}

// Open 打开（必要时创建）SQLite 用量库并初始化 schema。
func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", dsn(path))
	if err != nil {
		return nil, err
	}
	// 单连接串行化写入；读多写少场景下吞吐足够
	db.SetMaxOpenConns(1)
	s := &Store{db: db}
	if err := s.initSchema(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

// NewMemoryStore 打开一个独立的临时文件库（测试用）。
// 每次调用都是全新隔离的库，Close（SetStoreForTest 的 restore）时自动删除文件。
// 说明：不用 ":memory:"——modernc 驱动下多次打开内存库会出现数据串库。
func NewMemoryStore() (*Store, error) {
	f, err := os.CreateTemp("", "reqlog-*.db")
	if err != nil {
		return nil, err
	}
	_ = f.Close()
	s, err := Open(f.Name())
	if err != nil {
		os.Remove(f.Name())
		return nil, err
	}
	s.tmpPath = f.Name()
	return s, nil
}

func (s *Store) initSchema() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS request_logs (
			id            TEXT PRIMARY KEY,
			started_at    INTEGER NOT NULL,
			finished_at   INTEGER,
			account_id    TEXT,
			account_email TEXT,
			api_key_id    TEXT,
			provider_id   TEXT,
			protocol      TEXT,
			upstream      TEXT,
			model         TEXT,
			stream        INTEGER,
			input_tokens  INTEGER,
			output_tokens INTEGER,
			cached_tokens INTEGER,
			total_tokens  INTEGER,
			usage_available INTEGER,
			duration_ms   INTEGER,
			ttft_ms       INTEGER,
			output_tps    REAL,
			completed     INTEGER,
			error         TEXT,
			error_class   TEXT
		)`,
		`CREATE INDEX IF NOT EXISTS idx_request_logs_started ON request_logs(started_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_request_logs_model ON request_logs(model)`,
		`CREATE INDEX IF NOT EXISTS idx_request_logs_key ON request_logs(api_key_id)`,
		`CREATE TABLE IF NOT EXISTS usage_hourly (
			bucket        INTEGER NOT NULL,
			model         TEXT NOT NULL DEFAULT '',
			upstream      TEXT NOT NULL DEFAULT '',
			api_key_id    TEXT NOT NULL DEFAULT '',
			requests      INTEGER NOT NULL DEFAULT 0,
			input_tokens  INTEGER NOT NULL DEFAULT 0,
			output_tokens INTEGER NOT NULL DEFAULT 0,
			cached_tokens INTEGER NOT NULL DEFAULT 0,
			total_tokens  INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (bucket, model, upstream, api_key_id)
		)`,
	}
	for _, q := range stmts {
		if _, err := s.db.Exec(q); err != nil {
			return err
		}
	}
	return nil
}

// G 返回全局存储（懒初始化；失败时返回 nil 且只记录一次错误）。
func G() *Store {
	globalOnce.Do(func() {
		path := apphome.ResolveDataPath("usage.db")
		s, err := Open(path)
		if err != nil {
			globalErr = err
			log.Printf("usage store open failed: %v", err)
			return
		}
		global = s
		go s.retentionLoop()
	})
	if globalErr != nil {
		return nil
	}
	return global
}

// SetStoreForTest 替换全局存储（测试隔离用）。
func SetStoreForTest(s *Store) (restore func()) {
	globalMu.Lock()
	old := global
	global = s
	globalMu.Unlock()
	return func() {
		globalMu.Lock()
		global = old
		globalMu.Unlock()
		if s != nil {
			s.Close()
		}
	}
}

// SwapForTest 用一个内存库替换全局存储并预填 entries，返回恢复函数。
func SwapForTest(entries []types.RequestLog) (restore func()) {
	ms, err := NewMemoryStore()
	if err != nil {
		log.Printf("memory store open failed: %v", err)
		return func() {}
	}
	for _, e := range entries {
		_ = ms.append(e)
	}
	return SetStoreForTest(ms)
}

func (s *Store) retentionLoop() {
	s.sweep()
	t := time.NewTicker(time.Hour)
	for range t.C {
		s.sweep()
	}
}

func (s *Store) sweep() {
	if s == nil || s.db == nil {
		return
	}
	now := time.Now()
	_, _ = s.db.Exec(`DELETE FROM request_logs WHERE started_at < ?`, now.Add(-RawLogRetention).UnixNano())
	_, _ = s.db.Exec(`DELETE FROM usage_hourly WHERE bucket < ?`, now.Add(-HourlyRetention).Unix())
}

// ---- 写路径 ----

func (s *Store) append(entry types.RequestLog) error {
	if entry.ID == "" {
		entry.ID = fmt.Sprintf("req_%d", entry.StartedAt.UnixNano())
	}
	bucket := entry.StartedAt.Truncate(time.Hour).Unix()
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT OR REPLACE INTO request_logs
		(id, started_at, finished_at, account_id, account_email, api_key_id, provider_id,
		 protocol, upstream, model, stream, input_tokens, output_tokens, cached_tokens,
		 total_tokens, usage_available, duration_ms, ttft_ms, output_tps, completed, error, error_class)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		entry.ID, entry.StartedAt.UnixNano(), entry.FinishedAt.UnixNano(),
		entry.AccountID, entry.AccountEmail, entry.APIKeyID, entry.ProviderID,
		entry.Protocol, entry.Upstream, entry.Model, boolInt(entry.Stream),
		entry.InputTokens, entry.OutputTokens, entry.CachedTokens, entry.TotalTokens,
		boolInt(entry.UsageAvailable), entry.DurationMs, entry.TTFTMs, entry.OutputTPS,
		boolInt(entry.Completed), entry.Error, entry.ErrorClass,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO usage_hourly
		(bucket, model, upstream, api_key_id, requests, input_tokens, output_tokens, cached_tokens, total_tokens)
		VALUES (?,?,?,?,1,?,?,?,?)
		ON CONFLICT(bucket, model, upstream, api_key_id) DO UPDATE SET
			requests = requests + 1,
			input_tokens = input_tokens + excluded.input_tokens,
			output_tokens = output_tokens + excluded.output_tokens,
			cached_tokens = cached_tokens + excluded.cached_tokens,
			total_tokens = total_tokens + excluded.total_tokens`,
		bucket, entry.Model, entry.Upstream, entry.APIKeyID,
		entry.InputTokens, entry.OutputTokens, entry.CachedTokens, entry.TotalTokens,
	); err != nil {
		return err
	}
	return tx.Commit()
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// AppendRequestLog 落一条请求记录并累加小时聚合桶。
func AppendRequestLog(entry types.RequestLog) {
	if s := G(); s != nil {
		if err := s.append(entry); err != nil {
			log.Printf("request log append failed: %v", err)
		}
	}
}

// FinalizeRequestLog 填充收尾字段（耗时/TTFT/TPS/错误分类）并落库。
// ErrorClass 按错误文案做粗分类（rate_limit/auth/timeout/network/upstream/client/other）。
func FinalizeRequestLog(entry *types.RequestLog, usage types.TokenUsage, firstOutputAt time.Time, startedAt time.Time, completed bool, errMsg string) {
	entry.FinishedAt = time.Now()
	entry.DurationMs = entry.FinishedAt.Sub(startedAt).Milliseconds()
	entry.Completed = completed
	entry.Error = strutil.Truncate(errMsg, 200)
	entry.ErrorClass = classifyError(errMsg)

	if usage.Valid {
		entry.UsageAvailable = true
		entry.InputTokens = usage.Prompt
		entry.OutputTokens = usage.Completion
		entry.CachedTokens = usage.Cached
		entry.TotalTokens = usage.Total
	}

	if !firstOutputAt.IsZero() && usage.Valid && usage.Completion > 0 {
		entry.TTFTMs = firstOutputAt.Sub(startedAt).Milliseconds()
		generationMs := entry.FinishedAt.Sub(firstOutputAt).Seconds()
		if generationMs > 0 {
			entry.OutputTPS = float64(usage.Completion) / generationMs
		}
	}

	AppendRequestLog(*entry)
}

func classifyError(msg string) string {
	m := strings.ToLower(msg)
	if m == "" {
		return ""
	}
	switch {
	case strings.Contains(m, "429"), strings.Contains(m, "rate limit"), strings.Contains(m, "too many requests"):
		return "rate_limit"
	case strings.Contains(m, "401"), strings.Contains(m, "403"), strings.Contains(m, "unauthorized"), strings.Contains(m, "forbidden"), strings.Contains(m, "invalid token"):
		return "auth"
	case strings.Contains(m, "timeout"), strings.Contains(m, "deadline"), strings.Contains(m, "handshake"):
		return "timeout"
	case strings.Contains(m, "connection"), strings.Contains(m, "dial"), strings.Contains(m, "refused"), strings.Contains(m, "unreachable"), strings.Contains(m, "eof"):
		return "network"
	case strings.Contains(m, "500"), strings.Contains(m, "502"), strings.Contains(m, "503"), strings.Contains(m, "bad gateway"), strings.Contains(m, "internal"):
		return "upstream"
	case strings.Contains(m, "400"), strings.Contains(m, "invalid"), strings.Contains(m, "bad request"):
		return "client"
	default:
		return "other"
	}
}

// ---- 读路径 ----

// RequestLogPage 是游标分页结果。
type RequestLogPage struct {
	Items      []types.RequestLog `json:"items"`
	NextCursor string             `json:"nextCursor"`
	HasMore    bool               `json:"hasMore"`
}

// LogFilter 是请求日志的筛选条件（空值忽略）。
type LogFilter struct {
	Model    string
	Upstream string
	Key      string
	Status   string // "ok" | "error"
	Q        string // 模糊搜索 model/email/error/key
	From     time.Time
	To       time.Time
}

func (f *LogFilter) where() (string, []any) {
	conds := []string{"1=1"}
	var args []any
	if f != nil {
		if f.Model != "" {
			conds = append(conds, "model = ?")
			args = append(args, f.Model)
		}
		if f.Upstream != "" {
			conds = append(conds, "upstream = ?")
			args = append(args, f.Upstream)
		}
		if f.Key != "" {
			conds = append(conds, "api_key_id = ?")
			args = append(args, f.Key)
		}
		switch f.Status {
		case "ok":
			conds = append(conds, "completed = 1")
		case "error":
			conds = append(conds, "completed = 0")
		}
		if f.Q != "" {
			like := "%" + f.Q + "%"
			conds = append(conds, "(model LIKE ? OR account_email LIKE ? OR error LIKE ? OR api_key_id LIKE ?)")
			args = append(args, like, like, like, like)
		}
		if !f.From.IsZero() {
			conds = append(conds, "started_at >= ?")
			args = append(args, f.From.UnixNano())
		}
		if !f.To.IsZero() {
			conds = append(conds, "started_at <= ?")
			args = append(args, f.To.UnixNano())
		}
	}
	return strings.Join(conds, " AND "), args
}

const selectLogCols = `id, started_at, finished_at, account_id, account_email, api_key_id,
	provider_id, protocol, upstream, model, stream, input_tokens, output_tokens,
	cached_tokens, total_tokens, usage_available, duration_ms, ttft_ms, output_tps,
	completed, error, error_class`

func scanLog(scan func(dest ...any) error) (types.RequestLog, error) {
	var e types.RequestLog
	var started, finished int64
	var stream, usageAvail, completed int
	err := scan(&e.ID, &started, &finished, &e.AccountID, &e.AccountEmail, &e.APIKeyID,
		&e.ProviderID, &e.Protocol, &e.Upstream, &e.Model, &stream, &e.InputTokens,
		&e.OutputTokens, &e.CachedTokens, &e.TotalTokens, &usageAvail, &e.DurationMs,
		&e.TTFTMs, &e.OutputTPS, &completed, &e.Error, &e.ErrorClass)
	if err != nil {
		return e, err
	}
	e.StartedAt = time.Unix(0, started)
	e.FinishedAt = time.Unix(0, finished)
	e.Stream = stream == 1
	e.UsageAvailable = usageAvail == 1
	e.Completed = completed == 1
	return e, nil
}

func encodeCursor(entry types.RequestLog) string {
	key := fmt.Sprintf("%d|%s", entry.StartedAt.UnixNano(), entry.ID)
	return base64.RawURLEncoding.EncodeToString([]byte(key))
}

func decodeCursor(cursor string) (time.Time, string, error) {
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return time.Time{}, "", fmt.Errorf("invalid cursor")
	}
	var ts int64
	var id string
	if _, err := fmt.Sscanf(string(raw), "%d|%s", &ts, &id); err != nil || id == "" {
		return time.Time{}, "", fmt.Errorf("invalid cursor")
	}
	return time.Unix(0, ts), id, nil
}

// ListRequestLogs 按时间倒序返回一页请求日志（keyset 分页 + 筛选）。
func ListRequestLogs(limit int, cursor string, f *LogFilter) (RequestLogPage, error) {
	if limit <= 0 {
		limit = DefaultLimit
	}
	if limit > MaxLimit {
		limit = MaxLimit
	}
	s := G()
	if s == nil {
		return RequestLogPage{}, fmt.Errorf("usage store unavailable")
	}

	where, args := f.where()
	if cursor != "" {
		t, id, err := decodeCursor(cursor)
		if err != nil {
			return RequestLogPage{}, err
		}
		where += " AND (started_at < ? OR (started_at = ? AND id < ?))"
		nano := t.UnixNano()
		args = append(args, nano, nano, id)
	}

	rows, err := s.db.Query(`SELECT `+selectLogCols+` FROM request_logs WHERE `+where+
		` ORDER BY started_at DESC, id DESC LIMIT ?`, append(args, limit+1)...)
	if err != nil {
		return RequestLogPage{}, err
	}
	defer rows.Close()

	page := RequestLogPage{Items: []types.RequestLog{}}
	for rows.Next() {
		e, err := scanLog(rows.Scan)
		if err != nil {
			return page, err
		}
		page.Items = append(page.Items, e)
	}
	if len(page.Items) > limit {
		page.Items = page.Items[:limit]
		page.NextCursor = encodeCursor(page.Items[len(page.Items)-1])
		page.HasMore = true
	}
	return page, nil
}

// ---- 聚合查询 ----

// SeriesPoint 是一个时间桶上的聚合值（t 为该桶起点的 Unix 秒）。
type SeriesPoint struct {
	T            int64 `json:"t"`
	Requests     int64 `json:"r"`
	InputTokens  int64 `json:"in"`
	OutputTokens int64 `json:"out"`
	CachedTokens int64 `json:"cached"`
	TotalTokens  int64 `json:"total"`
}

// SeriesGroup 是按分组维度聚合出的一条时间序列。
type SeriesGroup struct {
	Name   string        `json:"name"`
	Points []SeriesPoint `json:"points"`
}

// SeriesQuery 从小时桶聚合出时间序列。
// group: "total"（单条总量）| "model" | "upstream" | "key"
func SeriesQuery(bucket, group string, from, to time.Time, f *LogFilter) ([]SeriesGroup, error) {
	s := G()
	if s == nil {
		return nil, fmt.Errorf("usage store unavailable")
	}
	if bucket != "day" {
		bucket = "hour"
	}
	var dim string
	switch group {
	case "model":
		dim = "model"
	case "upstream":
		dim = "upstream"
	case "key":
		dim = "api_key_id"
	default:
		dim = "'total'"
		group = "total"
	}
	width := int64(3600)
	if bucket == "day" {
		width = 86400
	}

	where, args := f.where()
	where += " AND bucket >= ? AND bucket < ?"
	args = append(args, from.Unix(), to.Unix())

	rows, err := s.db.Query(`SELECT `+dim+`, (bucket/`+fmt.Sprint(width)+`)*`+fmt.Sprint(width)+` AS b,
			SUM(requests), SUM(input_tokens), SUM(output_tokens), SUM(cached_tokens), SUM(total_tokens)
		FROM usage_hourly WHERE `+where+` GROUP BY `+dim+`, b ORDER BY b`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byName := map[string]*SeriesGroup{}
	var order []string
	for rows.Next() {
		var name string
		var p SeriesPoint
		if err := rows.Scan(&name, &p.T, &p.Requests, &p.InputTokens, &p.OutputTokens, &p.CachedTokens, &p.TotalTokens); err != nil {
			return nil, err
		}
		g, ok := byName[name]
		if !ok {
			g = &SeriesGroup{Name: name, Points: []SeriesPoint{}}
			byName[name] = g
			order = append(order, name)
		}
		g.Points = append(g.Points, p)
	}
	out := make([]SeriesGroup, 0, len(order))
	for _, n := range order {
		out = append(out, *byName[n])
	}
	return out, rows.Err()
}

// Totals 是一段时间的用量汇总。
type Totals struct {
	Requests     int64 `json:"requests"`
	InputTokens  int64 `json:"inputTokens"`
	OutputTokens int64 `json:"outputTokens"`
	CachedTokens int64 `json:"cachedTokens"`
	TotalTokens  int64 `json:"totalTokens"`
}

func (s *Store) sumWhere(where string, args []any) (Totals, error) {
	var t Totals
	row := s.db.QueryRow(`SELECT COALESCE(SUM(requests),0), COALESCE(SUM(input_tokens),0),
		COALESCE(SUM(output_tokens),0), COALESCE(SUM(cached_tokens),0), COALESCE(SUM(total_tokens),0)
		FROM usage_hourly WHERE `+where, args...)
	return t, row.Scan(&t.Requests, &t.InputTokens, &t.OutputTokens, &t.CachedTokens, &t.TotalTokens)
}

// SummaryQuery 返回时间范围内的总量、模型 Top、上游分布与 Key Top。
func SummaryQuery(from, to time.Time, f *LogFilter) (totals Totals, topModels []map[string]any, upstreams []map[string]any, topKeys []map[string]any, err error) {
	s := G()
	if s == nil {
		return totals, nil, nil, nil, fmt.Errorf("usage store unavailable")
	}
	where, args := f.where()
	where += " AND bucket >= ? AND bucket < ?"
	args = append(args, from.Unix(), to.Unix())

	if totals, err = s.sumWhere(where, args); err != nil {
		return
	}
	topModels, err = s.topBy("model", where, args, 5)
	if err != nil {
		return
	}
	upstreams, err = s.topBy("upstream", where, args, 10)
	if err != nil {
		return
	}
	topKeys, err = s.topBy("api_key_id", where, args, 5)
	return
}

func (s *Store) topBy(dim, where string, args []any, limit int) ([]map[string]any, error) {
	rows, err := s.db.Query(`SELECT `+dim+`, SUM(requests), SUM(total_tokens) FROM usage_hourly
		WHERE `+where+` GROUP BY `+dim+` ORDER BY SUM(total_tokens) DESC LIMIT ?`, append(args, limit)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var name string
		var r, t int64
		if err := rows.Scan(&name, &r, &t); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"name": name, "requests": r, "totalTokens": t})
	}
	return out, rows.Err()
}

// SumUpstream 返回 [from,to) 内指定上游的用量汇总（zen 今日卡片用）。
func SumUpstream(from, to time.Time, upstream string) Totals {
	s := G()
	if s == nil {
		return Totals{}
	}
	t, err := s.sumWhere("bucket >= ? AND bucket < ? AND upstream = ?",
		[]any{from.Unix(), to.Unix(), upstream})
	if err != nil {
		return Totals{}
	}
	return t
}

// Len 返回原始日志条数（测试断言用）。
func Len() int {
	s := G()
	if s == nil {
		return 0
	}
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM request_logs`).Scan(&n); err != nil {
		return 0
	}
	return n
}

// At 返回第 i 条日志（测试断言用，按时间倒序；越界返回零值）。
func At(i int) types.RequestLog {
	s := G()
	if s == nil {
		return types.RequestLog{}
	}
	row := s.db.QueryRow(`SELECT `+selectLogCols+` FROM request_logs
		ORDER BY started_at DESC, id DESC LIMIT 1 OFFSET ?`, i)
	e, err := scanLog(row.Scan)
	if err != nil {
		return types.RequestLog{}
	}
	return e
}

// KeyUsage 返回每个客户端 Key 的累计用量（来自小时桶，key → 汇总）。
func KeyUsage() map[string]Totals {
	s := G()
	if s == nil {
		return nil
	}
	rows, err := s.db.Query(`SELECT api_key_id, COALESCE(SUM(requests),0), COALESCE(SUM(input_tokens),0),
		COALESCE(SUM(output_tokens),0), COALESCE(SUM(cached_tokens),0), COALESCE(SUM(total_tokens),0)
		FROM usage_hourly WHERE api_key_id <> '' GROUP BY api_key_id`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := map[string]Totals{}
	for rows.Next() {
		var key string
		var t Totals
		if err := rows.Scan(&key, &t.Requests, &t.InputTokens, &t.OutputTokens, &t.CachedTokens, &t.TotalTokens); err != nil {
			continue
		}
		out[key] = t
	}
	return out
}
