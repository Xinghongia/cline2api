package types

import (
	"encoding/json"
	"time"
)

type RequestLog struct {
	ID           string    `json:"id"`
	StartedAt    time.Time `json:"startedAt"`
	FinishedAt   time.Time `json:"finishedAt"`
	AccountID    string    `json:"accountId"`
	AccountEmail string    `json:"accountEmail"`
	Protocol     string    `json:"protocol"`
	// Upstream 标记上游来源："cline"=Cline 账号池，"opencode"=opencode zen 免费模型
	Upstream string `json:"upstream,omitempty"`
	// APIKeyID 记录请求使用的客户端 API Key（未配置鉴权时为空）
	APIKeyID string `json:"apiKeyId,omitempty"`
	// ProviderID 记录请求命中的自定义提供商（未走提供商时为空）
	ProviderID     string  `json:"providerId,omitempty"`
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
	// ErrorClass 是错误的粗分类（rate_limit/auth/timeout/network/upstream/client/other），供统计聚合
	ErrorClass string `json:"errorClass,omitempty"`
}

// TokenUsage 是从上游响应解析出的单次请求 token 用量。
type TokenUsage struct {
	Prompt     int64
	Completion int64
	Total      int64
	Cached     int64
	Valid      bool
}

// APIKey 是带元数据的客户端密钥。
// UnmarshalJSON 兼容两种历史格式：纯字符串（旧版 []string 池文件）与完整对象。
type APIKey struct {
	Key           string    `json:"key"`
	Name          string    `json:"name,omitempty"`
	Enabled       bool      `json:"enabled"`
	CreatedAt     time.Time `json:"createdAt,omitempty"`
	LastUsedAt    time.Time `json:"lastUsedAt,omitempty"`
	TotalRequests int64     `json:"totalRequests,omitempty"`
}

func (k *APIKey) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err == nil {
		k.Key = s
		k.Enabled = true // 旧格式密钥默认启用
		return nil
	}
	type alias APIKey
	return json.Unmarshal(b, (*alias)(k))
}
