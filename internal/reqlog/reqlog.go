package reqlog

import (
	"cline-go-proxy/internal/apphome"
	"cline-go-proxy/internal/strutil"
	"cline-go-proxy/internal/types"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"sync"
	"time"
)

const (
	requestLogMaxEntries = 5000
	requestLogMaxAge     = 30 * 24 * time.Hour
	DefaultLimit         = 50
	MaxLimit             = 100
)

var (
	requestLogs     []types.RequestLog
	requestLogsMu   sync.Mutex
	requestLogsPath string
)

func init() {
	requestLogsPath = apphome.ResolveDataPath(".cline-request-logs.json")
}

func LoadRequestLogs() {
	data, err := os.ReadFile(requestLogsPath)
	if err != nil {
		return
	}
	var entries []types.RequestLog
	if err := json.Unmarshal(data, &entries); err != nil {
		return
	}
	requestLogsMu.Lock()
	requestLogs = pruneRequestLogsLocked(entries)
	requestLogsMu.Unlock()
}

func pruneRequestLogsLocked(entries []types.RequestLog) []types.RequestLog {
	if len(entries) == 0 {
		return entries
	}
	sort.Slice(entries, func(i, j int) bool {
		if !entries[i].StartedAt.Equal(entries[j].StartedAt) {
			return entries[i].StartedAt.After(entries[j].StartedAt)
		}
		return entries[i].ID > entries[j].ID
	})

	cutoff := time.Now().Add(-requestLogMaxAge)
	pruned := entries[:0]
	for _, e := range entries {
		if e.StartedAt.Before(cutoff) {
			continue
		}
		pruned = append(pruned, e)
	}
	if len(pruned) > requestLogMaxEntries {
		pruned = pruned[:requestLogMaxEntries]
	}
	return pruned
}

func saveRequestLogsLocked() {
	data, err := json.MarshalIndent(requestLogs, "", "  ")
	if err != nil {
		return
	}
	tmp := requestLogsPath + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return
	}
	_ = os.Rename(tmp, requestLogsPath)
}

func AppendRequestLog(entry types.RequestLog) {
	if entry.ID == "" {
		entry.ID = fmt.Sprintf("req_%d", entry.StartedAt.UnixNano())
	}
	requestLogsMu.Lock()
	requestLogs = append(requestLogs, entry)
	requestLogs = pruneRequestLogsLocked(requestLogs)
	saveRequestLogsLocked()
	requestLogsMu.Unlock()
}

type RequestLogPage struct {
	Items      []types.RequestLog `json:"items"`
	NextCursor string             `json:"nextCursor"`
	HasMore    bool               `json:"hasMore"`
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

func ListRequestLogs(limit int, cursor string) (RequestLogPage, error) {
	if limit <= 0 {
		limit = DefaultLimit
	}
	if limit > MaxLimit {
		limit = MaxLimit
	}

	var afterTime time.Time
	var afterID string
	if cursor != "" {
		t, id, err := decodeCursor(cursor)
		if err != nil {
			return RequestLogPage{}, err
		}
		afterTime = t
		afterID = id
	}

	requestLogsMu.Lock()
	defer requestLogsMu.Unlock()

	result := make([]types.RequestLog, 0, limit)
	var lastEntry types.RequestLog
	for _, e := range requestLogs {
		if cursor != "" {
			if e.StartedAt.After(afterTime) {
				continue
			}
			if e.StartedAt.Equal(afterTime) && e.ID >= afterID {
				continue
			}
		}
		result = append(result, e)
		lastEntry = e
		if len(result) >= limit {
			break
		}
	}

	page := RequestLogPage{Items: result}
	if len(result) == limit {
		page.NextCursor = encodeCursor(lastEntry)
		page.HasMore = true
	}
	return page, nil
}

func FinalizeRequestLog(entry *types.RequestLog, usage types.TokenUsage, firstOutputAt time.Time, startedAt time.Time, completed bool, errMsg string) {
	entry.FinishedAt = time.Now()
	entry.DurationMs = entry.FinishedAt.Sub(startedAt).Milliseconds()
	entry.Completed = completed
	entry.Error = strutil.Truncate(errMsg, 200)

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

// Filter 返回满足谓词的日志副本，调用方无需触碰内部锁与切片。
func Filter(pred func(types.RequestLog) bool) []types.RequestLog {
	requestLogsMu.Lock()
	defer requestLogsMu.Unlock()
	var out []types.RequestLog
	for _, e := range requestLogs {
		if pred(e) {
			out = append(out, e)
		}
	}
	return out
}

// SwapForTest 替换整个日志存储并返回恢复函数（仅测试隔离使用）。
func SwapForTest(entries []types.RequestLog) (restore func()) {
	requestLogsMu.Lock()
	old := requestLogs
	requestLogs = entries
	requestLogsMu.Unlock()
	return func() {
		requestLogsMu.Lock()
		requestLogs = old
		requestLogsMu.Unlock()
	}
}

// Len 返回当前日志条数。
func Len() int {
	requestLogsMu.Lock()
	defer requestLogsMu.Unlock()
	return len(requestLogs)
}

// At 返回第 i 条日志（测试断言用，越界返回零值）。
func At(i int) types.RequestLog {
	requestLogsMu.Lock()
	defer requestLogsMu.Unlock()
	if i < 0 || i >= len(requestLogs) {
		return types.RequestLog{}
	}
	return requestLogs[i]
}

// Path 返回日志文件路径（测试备份用）。
func Path() string {
	requestLogsMu.Lock()
	defer requestLogsMu.Unlock()
	return requestLogsPath
}

// SetPathForTest 重定向日志文件路径并返回恢复函数（测试隔离用）。
func SetPathForTest(p string) (restore func()) {
	requestLogsMu.Lock()
	old := requestLogsPath
	requestLogsPath = p
	requestLogsMu.Unlock()
	return func() {
		requestLogsMu.Lock()
		requestLogsPath = old
		requestLogsMu.Unlock()
	}
}
