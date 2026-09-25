package zen

import (
	"cline-go-proxy/internal/pool"
	"cline-go-proxy/internal/reqlog"
	"cline-go-proxy/internal/types"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
)

// TestMain 把池文件与请求日志重定向到临时目录：
// 单元测试绝不读写用户真实的 .cline-accounts.json。
func TestMain(m *testing.M) {
	tmp, err := os.MkdirTemp("", "cline-proxy-test-*")
	if err != nil {
		panic(err)
	}
	oldPoolPath := pool.Path
	pool.Path = filepath.Join(tmp, ".cline-accounts.json")
	restoreLogsPath := reqlog.SetPathForTest(filepath.Join(tmp, ".cline-request-logs.json"))

	pool.Mu.Lock()
	pool.State = nil // 强制从临时路径重新加载
	pool.Mu.Unlock()

	code := m.Run()

	pool.Path = oldPoolPath
	restoreLogsPath()
	os.RemoveAll(tmp)
	os.Exit(code)
}

// resetZenTestState 恢复与 zen 相关的全局可变状态，避免测试间相互污染。
func resetZenTestState(t *testing.T) {
	t.Helper()
	remoteZenEnabledMu.Lock()
	oldZenEnabled := remoteZenEnabled
	remoteZenEnabled = false
	remoteZenEnabledMu.Unlock()

	zenConfigMu.Lock()
	oldCfg := zenConfig
	zenConfig = nil
	zenConfigMu.Unlock()

	zenStateMu.Lock()
	oldCount, oldUntil := zenFailCount, zenFailUntil
	zenFailCount, zenFailUntil = 0, time.Time{}
	zenStateMu.Unlock()

	compactStatesMu.Lock()
	oldStates := compactStates
	compactStates = make(map[string]*compactState)
	compactStatesMu.Unlock()

	t.Cleanup(func() {
		remoteZenEnabledMu.Lock()
		remoteZenEnabled = oldZenEnabled
		remoteZenEnabledMu.Unlock()
		zenConfigMu.Lock()
		zenConfig = oldCfg
		zenConfigMu.Unlock()
		zenStateMu.Lock()
		zenFailCount, zenFailUntil = oldCount, oldUntil
		zenStateMu.Unlock()
		compactStatesMu.Lock()
		compactStates = oldStates
		compactStatesMu.Unlock()
	})
}

// ============ RouteModel / ResolveZenInfo 测试 ============

// CurrentZenModels / ResolveZenInfo 把 "zen" 与 "seed" 都视为 zen 来源
func withZenPool(t *testing.T, models []types.Model) {
	t.Helper()
	resetZenTestState(t)
	p := pool.Load()
	oldModels := p.Models
	p.Models = models
	pool.Save()
	t.Cleanup(func() {
		q := pool.Load()
		q.Models = oldModels
		pool.Save()
	})
}

func TestRouteModelZenFree(t *testing.T) {
	withZenPool(t, append([]types.Model{}, BuiltinZenModels()...))
	// 未同步过 → 种子表生效
	if got := RouteModel("deepseek-v4-flash-free"); got != "zen" {
		t.Errorf("RouteModel(free seed model) = %q, want zen", got)
	}
	if got := RouteModel("opencode/deepseek-v4-flash-free"); got != "zen" {
		t.Errorf("RouteModel(prefixed free seed model) = %q, want zen", got)
	}
	if got := RouteModel("opencode/mimo-v2.5-free"); got != "zen" {
		t.Errorf("RouteModel(opencode/ prefix) = %q, want zen", got)
	}
	// 别名
	if got := RouteModel("deepseek-v4-flash"); got != "zen" {
		t.Errorf("RouteModel(free model alias) = %q, want zen", got)
	}
	if got := RouteModel("deepseek-v4"); got != "zen" {
		t.Errorf("RouteModel(alias) = %q, want zen", got)
	}
}

func TestRouteModelRejectPaid(t *testing.T) {
	withZenPool(t, []types.Model{
		{ID: "gpt-5-turbo", Provider: "opencode", Cost: "pass", Status: "active", Source: "zen"},
	})
	if got := RouteModel("gpt-5-turbo"); got != "reject" {
		t.Errorf("RouteModel(paid zen model) = %q, want reject", got)
	}
	if got := RouteModel("opencode/gpt-5-turbo"); got != "reject" {
		t.Errorf("RouteModel(opencode/paid) = %q, want reject", got)
	}
}

func TestRouteModelClinePassthrough(t *testing.T) {
	withZenPool(t, append([]types.Model{}, BuiltinZenModels()...))
	if got := RouteModel("cline-free/glm-5.2"); got != "cline" {
		t.Errorf("RouteModel(cline model) = %q, want cline", got)
	}
	if got := RouteModel(""); got != "cline" {
		t.Errorf("RouteModel(empty) = %q, want cline", got)
	}
}

// 僵尸模型回归：同步成功后（remoteZenEnabled=true），官方已下架的种子模型必须休眠。
func TestDelistedSeedModelGoesDormant(t *testing.T) {
	remoteZenEnabledMu.Lock()
	oldEnabled := remoteZenEnabled
	remoteZenEnabled = true
	remoteZenEnabledMu.Unlock()
	t.Cleanup(func() { restoreRemoteZen(oldEnabled) })

	// 池中只有官方还存在的模型，longcat-2.0-free 已被下架（不在池里）
	withZenPool(t, []types.Model{
		{ID: "deepseek-v4-flash-free", Provider: "opencode", Cost: "free", Source: "zen", Context: 200000},
	})
	if _, ok := ResolveZenInfo("longcat-2.0-free"); ok {
		t.Error("delisted seed model should be dormant after sync (no zombie)")
	}
	if _, ok := ResolveZenInfo("big-pickle"); ok {
		t.Error("delisted seed model big-pickle should be dormant")
	}
	m, ok := ResolveZenInfo("deepseek-v4-flash-free")
	if !ok || m.ID != "deepseek-v4-flash-free" {
		t.Errorf("surviving model should resolve, got %+v ok=%v", m, ok)
	}
}

func restoreRemoteZen(v bool) {
	remoteZenEnabledMu.Lock()
	remoteZenEnabled = v
	remoteZenEnabledMu.Unlock()
}

func TestAliasNotShadowedBySyncedPaidModel(t *testing.T) {
	restoreRemoteZen(false)
	withZenPool(t, append([]types.Model{}, BuiltinZenModels()...))
	// 同步来一个付费模型 ID 恰好等于 free 别名（参考项目的隐患场景）
	withZenPool(t, append(BuiltinZenModels(), types.Model{
		ID: "deepseek-v4-flash", Provider: "opencode", Cost: "pass", Source: "zen",
	}))
	// 别名 deepseek-v4-flash 应解析到免费正式 ID 而非付费条目
	m, ok := ResolveZenInfo("deepseek-v4-flash")
	if !ok {
		t.Fatal("alias should still resolve")
	}
	if m.Cost != "free" || !strings.HasSuffix(m.ID, "-free") {
		t.Errorf("alias resolved to paid model %+v, want free -free model", m)
	}
}

// ============ 故障转移状态机测试 ============

func TestFailoverStateMachine(t *testing.T) {
	// 隔离全局状态
	zenStateMu.Lock()
	oldCount, oldUntil := zenFailCount, zenFailUntil
	zenStateMu.Unlock()
	t.Cleanup(func() {
		zenStateMu.Lock()
		zenFailCount, zenFailUntil = oldCount, oldUntil
		zenStateMu.Unlock()
	})

	zenStateMu.Lock()
	zenFailCount, zenFailUntil = 0, time.Time{}
	zenStateMu.Unlock()

	if ZenFailedNow() {
		t.Fatal("should not be in failover initially")
	}
	for i := 0; i < 3; i++ {
		markZenFail()
	}
	if !ZenFailedNow() {
		t.Error("3 consecutive failures should arm failover")
	}
	markZenSuccess()
	if ZenFailedNow() {
		t.Error("success should reset failover state")
	}
}

func TestIsRateLimited(t *testing.T) {
	cases := []struct {
		status int
		body   string
		want   bool
	}{
		{429, `{"error":"x"}`, true},
		{503, "", true},
		{403, `"ResourceExhausted"`, true},
		{502, "rate limit reached", true},
		{400, "rate limit in body only", false}, // 400 不算限流信号
		{500, "", false},
	}
	for _, c := range cases {
		if got := isRateLimited(c.status, c.body); got != c.want {
			t.Errorf("isRateLimited(%d,%q)=%v want %v", c.status, c.body, got, c.want)
		}
	}
}

func TestParseRetryAfter(t *testing.T) {
	if d := ParseRetryAfter("120"); d != 120*time.Second {
		t.Errorf("seconds parse: got %v", d)
	}
	if d := ParseRetryAfter(""); d != 0 {
		t.Errorf("empty: got %v", d)
	}
	future := time.Now().Add(2 * time.Minute).UTC().Format(http.TimeFormat)
	d := ParseRetryAfter(future)
	if d <= 0 || d > 3*time.Minute {
		t.Errorf("http-date parse: got %v", d)
	}
}

// ============ 配置校验测试 ============

func TestValidateProxyList(t *testing.T) {
	if err := ValidateProxyList([]string{"socks5://127.0.0.1:1080", "http://user:pass@p.com:8080"}); err != nil {
		t.Errorf("valid list rejected: %v", err)
	}
	for _, bad := range []string{"ftp://x:1", "http://noport", "not-a-url"} {
		if err := ValidateProxyList([]string{bad}); err == nil {
			t.Errorf("bad proxy %q accepted", bad)
		}
	}
	if err := ValidateProxyList([]string{"", "  "}); err != nil {
		t.Errorf("blank lines should pass: %v", err)
	}
}

// ============ 压缩核心逻辑测试 ============

func TestSelectRecentBudgetSplit(t *testing.T) {
	msgs := []string{
		strings.Repeat("a", 800), // ~200 tokens
		strings.Repeat("b", 800), // ~200 tokens
		strings.Repeat("c", 80),  // ~20 tokens
	}
	sel := selectRecent(msgs, 220)
	if sel == nil {
		t.Fatal("expected selection")
	}
	if sel.split != 1 {
		t.Errorf("split=%d want 1 (last two messages fit)", sel.split)
	}
	recentText := strings.Join(sel.recent, "\n")
	if !strings.Contains(recentText, strings.Repeat("b", 10)) || !strings.Contains(recentText, "cccc") {
		t.Error("recent should contain tail messages/suffix")
	}
	if len(sel.head) == 0 || !strings.HasPrefix(sel.head[0], "aaaa") {
		t.Error("head should contain overflowed prefix")
	}
}

func TestSerializeMsgRoles(t *testing.T) {
	user := map[string]any{"role": "user", "content": "hello"}
	if s := serializeMsg(user); !strings.HasPrefix(s, "[User]: hello") {
		t.Errorf("user serialize: %q", s)
	}
	tool := map[string]any{"role": "tool", "content": strings.Repeat("x", 3000)}
	s := serializeMsg(tool)
	if len(s) > toolOutputMaxChars+50 {
		t.Errorf("tool output not truncated: %d", len(s))
	}
	asst := map[string]any{
		"role":    "assistant",
		"content": "doing it",
		"tool_calls": []any{map[string]any{
			"id": "c1", "type": "function",
			"function": map[string]any{"name": "edit_file", "arguments": `{"path":"a.go"}`},
		}},
	}
	s = serializeMsg(asst)
	if !strings.Contains(s, `[Assistant]: doing it`) || !strings.Contains(s, "[Assistant tool call]: edit_file") {
		t.Errorf("assistant serialize: %q", s)
	}
}

func TestEstimateJSONAndCompactDisabled(t *testing.T) {
	cfg := GetZenConfig()
	if cfg.Compaction.Buffer <= 0 {
		t.Error("default compaction buffer should be positive")
	}
	params := map[string]any{
		"model":    "m",
		"messages": []any{map[string]any{"role": "user", "content": "hi"}},
	}
	bts, _ := json.Marshal(params)
	if estimateJSON(params) != len(bts)/4 {
		t.Error("estimateJSON should be len/4")
	}
}

// ============ buildZenBody 测试 ============

func TestBuildZenBodyRewritesModelAndStripsReasoning(t *testing.T) {
	params := map[string]any{
		"model":      "deepseek-v4-flash",
		"messages":   []any{map[string]any{"role": "user", "content": "hi"}},
		"max_tokens": 100.0,
		"stream":     true,
		"tools":      []any{},
	}
	body := buildZenBody(params, true, false)
	if body["model"] != "deepseek-v4-flash-free" {
		t.Errorf("model alias rewrite failed: %v", body["model"])
	}
	if body["stream"] != true {
		t.Error("stream flag lost")
	}
	for _, k := range []string{"reasoning_effort", "reasoningEffort"} {
		if _, ok := body[k]; ok {
			t.Errorf("%s should be stripped", k)
		}
	}
	if body["session_id"] != nil {
		t.Error("zen body must not carry cline session_id")
	}
}

// ============ Responses API 转换测试 ============

func TestBuildZenBodyAnonymousInjectsToolsAndStream(t *testing.T) {
	params := map[string]any{
		"model":    "mimo-v2.6-flash-free",
		"messages": []any{map[string]any{"role": "user", "content": "hi"}},
	}
	body := buildZenBody(params, false, true)
	if body["stream"] != true {
		t.Error("anonymous body must force stream=true upstream")
	}
	so, ok := body["stream_options"].(map[string]any)
	if !ok || so["include_usage"] != true {
		t.Error("anonymous body must set stream_options.include_usage")
	}
	tools, ok := body["tools"].([]any)
	if !ok {
		t.Fatal("anonymous body must inject tools")
	}
	names := map[string]bool{}
	for _, item := range tools {
		entry, _ := item.(map[string]any)
		fn, _ := entry["function"].(map[string]any)
		name, _ := fn["name"].(string)
		names[name] = true
	}
	for _, want := range anonymousCoreTools {
		if !names[want] {
			t.Errorf("missing core tool %q", want)
		}
	}

	// 客户端已声明的工具保持原样，缺的才补
	params2 := map[string]any{
		"model":    "mimo-v2.6-flash-free",
		"messages": []any{map[string]any{"role": "user", "content": "hi"}},
		"tools":    []any{map[string]any{"type": "function", "function": map[string]any{"name": "bash", "parameters": map[string]any{}}}},
	}
	body2 := buildZenBody(params2, false, true)
	tools2, _ := body2["tools"].([]any)
	if len(tools2) != len(anonymousCoreTools) {
		t.Fatalf("want %d tools (1 declared + %d injected), got %d", len(anonymousCoreTools), len(anonymousCoreTools)-1, len(tools2))
	}
}

func TestCanonicalZenSessionFormat(t *testing.T) {
	pattern := `^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$`
	re := regexp.MustCompile(pattern)
	// 无信号 → 随机规范形态
	s1 := zenSessionID(map[string]any{})
	if !re.MatchString(s1) {
		t.Errorf("random session %q does not match canonical format", s1)
	}
	// 同一对话 → 稳定派生
	params := map[string]any{
		"messages": []any{map[string]any{"role": "user", "content": "hello world"}},
	}
	s2 := zenSessionID(params)
	s3 := zenSessionID(params)
	if s2 != s3 {
		t.Errorf("same conversation must derive stable session: %q vs %q", s2, s3)
	}
	if !re.MatchString(s2) {
		t.Errorf("derived session %q does not match canonical format", s2)
	}
	// 不同对话 → 不同会话
	params4 := map[string]any{
		"messages": []any{map[string]any{"role": "user", "content": "different"}},
	}
	if zenSessionID(params4) == s2 {
		t.Error("different conversations must derive different sessions")
	}
}

// ============ Anthropic thinking 映射测试 ============
