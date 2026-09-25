package types

import "time"

type RequestLog struct {
	ID           string    `json:"id"`
	StartedAt    time.Time `json:"startedAt"`
	FinishedAt   time.Time `json:"finishedAt"`
	AccountID    string    `json:"accountId"`
	AccountEmail string    `json:"accountEmail"`
	Protocol     string    `json:"protocol"`
	// Upstream 标记上游来源："cline"=Cline 账号池，"opencode"=opencode zen 免费模型
	Upstream       string  `json:"upstream,omitempty"`
	Model          string  `json:"model"`
	Stream         bool    `json:"stream"`
	InputTokens    int64   `json:"inputTokens"`
	OutputTokens   int64   `json:"outputTokens"`
	CachedTokens   int64   `json:"cachedTokens"`
	TotalTokens    int64   `json:"totalTokens"`
	UsageAvailable bool    `json:"usageAvailable"`
	DurationMs     int64   `json:"durationMs"`
	TTFTMs         int64   `json:"ttftMs"`
	OutputTPS      float64 `json:"outputTokensPerSecond"`
	Completed      bool    `json:"completed"`
	Error          string  `json:"error,omitempty"`
}

// TokenUsage 是从上游响应解析出的单次请求 token 用量。
type TokenUsage struct {
	Prompt     int64
	Completion int64
	Total      int64
	Cached     int64
	Valid      bool
}
