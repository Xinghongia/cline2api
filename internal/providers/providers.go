package providers

import (
	"cline-go-proxy/internal/apphome"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sort"
	"sync"
	"time"
)

// ============================================================================
// 自定义 OpenAI 兼容 Provider
// 用户可接入任意 OpenAI 兼容上游（OpenRouter / Groq / Cerebras / Gemini 兼容层 /
// Mistral / 自建 vLLM 等）。每个 provider 声明 baseURL、apiKey、自定义请求头、
// 模型列表；请求按模型归属路由，失败后按 回退链 → 自动兜底 降级。
// ============================================================================

// CustomProvider 一个 OpenAI 兼容上游。
type CustomProvider struct {
	ID         string            `json:"id"`                // 稳定 ID（生成）
	Name       string            `json:"name"`              // 显示名
	BaseURL    string            `json:"baseURL"`           // 如 https://openrouter.ai/api/v1
	APIKey     string            `json:"apiKey"`            // Bearer token
	ModelIDs   []string          `json:"modelIds"`          // 该上游暴露的模型 ID（如 "z-ai/glm-5.3-flash"）
	Headers    map[string]string `json:"headers,omitempty"` // 自定义请求头（如 OpenRouter 的 HTTP-Referer）
	Enabled    bool              `json:"enabled"`
	Priority   int               `json:"priority"`             // 越小越优先（同模型多上游时）
	TimeoutSec int               `json:"timeoutSec,omitempty"` // 默认 300
	Free       bool              `json:"free"`                 // 标记免费来源（供统计/兜底）
	CreatedAt  time.Time         `json:"createdAt"`
}

// providerRegistry 内存态 + 落盘（.cline-providers.json）。
var (
	providersMu       sync.Mutex
	customProviders   []*CustomProvider
	providersLoaded   bool
	providersFilePath string
	// modelCooldownsPerProvider providerID:model → 冷却截止
	providerCooldowns = map[string]time.Time{}
)

func init() {
	providersFilePath = apphome.ResolveDataPath(".cline-providers.json")
}

func loadProviders() {
	providersMu.Lock()
	defer providersMu.Unlock()
	if providersLoaded {
		return
	}
	providersLoaded = true
	data, err := os.ReadFile(providersFilePath)
	if err != nil {
		return
	}
	var list []*CustomProvider
	if err := json.Unmarshal(data, &list); err != nil {
		log.Printf("providers parse failed: %v", err)
		return
	}
	customProviders = list
}

func saveProvidersLocked() {
	data, err := json.MarshalIndent(customProviders, "", "  ")
	if err != nil {
		return
	}
	if err := os.WriteFile(providersFilePath, data, 0600); err != nil {
		log.Printf("providers save failed: %v", err)
	}
}

// ListProviders 返回副本列表（按 Priority, CreatedAt 排序）。
func ListProviders() []CustomProvider {
	loadProviders()
	providersMu.Lock()
	defer providersMu.Unlock()
	out := make([]CustomProvider, 0, len(customProviders))
	for _, p := range customProviders {
		out = append(out, *p)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Priority != out[j].Priority {
			return out[i].Priority < out[j].Priority
		}
		return out[i].CreatedAt.Before(out[j].CreatedAt)
	})
	return out
}

func GenProviderID() string {
	return "prov_" + fmt.Sprintf("%x", time.Now().UnixNano())
}

// UpsertProvider 新增或更新（按 ID）。返回最终 provider。
func UpsertProvider(p *CustomProvider) CustomProvider {
	loadProviders()
	providersMu.Lock()
	defer providersMu.Unlock()
	if p.ID == "" {
		p.ID = GenProviderID()
		p.CreatedAt = time.Now()
		found := false
		for _, e := range customProviders {
			if e.ID == p.ID {
				*e = *p
				found = true
				break
			}
		}
		if !found {
			customProviders = append(customProviders, p)
		}
	} else {
		found := false
		for _, e := range customProviders {
			if e.ID == p.ID {
				*e = *p
				found = true
				break
			}
		}
		if !found {
			p.CreatedAt = time.Now()
			customProviders = append(customProviders, p)
		}
	}
	saveProvidersLocked()
	return *p
}

func DeleteProvider(id string) bool {
	loadProviders()
	providersMu.Lock()
	defer providersMu.Unlock()
	for i, p := range customProviders {
		if p.ID == id {
			customProviders = append(customProviders[:i], customProviders[i+1:]...)
			saveProvidersLocked()
			return true
		}
	}
	return false
}

// ResolveProviderForModel 找到该模型的首选 provider（启用中、未冷却、优先级最小）。
func ResolveProviderForModel(model string) *CustomProvider {
	loadProviders()
	providersMu.Lock()
	defer providersMu.Unlock()
	var best *CustomProvider
	for _, p := range customProviders {
		if !p.Enabled {
			continue
		}
		for _, m := range p.ModelIDs {
			if m == model {
				if until, cool := providerCooldowns[p.ID+":"+model]; cool && time.Now().Before(until) {
					break // 该 provider 的该模型冷却中
				}
				if best == nil || p.Priority < best.Priority {
					best = p
				}
				break
			}
		}
	}
	return best
}

// providerFallbackModels 该模型的所有 provider 候选按优先级排序的模型链：
// 原模型优先，然后是 modelChain（配置链）中启用了 provider 的模型。
func CustomProviderServes(model string) bool {
	return ResolveProviderForModel(model) != nil
}

// SetProviderCooldown 记录 provider 模型冷却（429/5xx 时）。
func SetProviderCooldown(providerID, model string, until time.Time) {
	providersMu.Lock()
	providerCooldowns[providerID+":"+model] = until
	providersMu.Unlock()
}

// CallProvider 调用自定义 provider 的 /chat/completions。
type ProviderPreset struct {
	Name     string
	BaseURL  string
	Headers  map[string]string
	Notes    string
	FreeTier bool
}

// ProviderPresets 常见 OpenAI 兼容上游预设。Key 为前端展示名。
var ProviderPresets = map[string]ProviderPreset{
	"openrouter": {
		Name:    "OpenRouter",
		BaseURL: "https://openrouter.ai/api/v1",
		Headers: map[string]string{
			"HTTP-Referer": "https://cline.bot",
			"X-Title":      "Cline Proxy",
		},
		Notes:    "300+ models; many :free variants. Key: openrouter.ai/keys",
		FreeTier: true,
	},
	"groq": {
		Name:     "Groq",
		BaseURL:  "https://api.groq.com/openai/v1",
		Notes:    "Fast free tier (Llama/Qwen). Key: console.groq.com/keys",
		FreeTier: true,
	},
	"cerebras": {
		Name:     "Cerebras",
		BaseURL:  "https://api.cerebras.ai/v1",
		Notes:    "Free tier, very high throughput. Key: cloud.cerebras.ai",
		FreeTier: true,
	},
	"gemini": {
		Name:     "Google AI Studio",
		BaseURL:  "https://generativelanguage.googleapis.com/v1beta/openai",
		Notes:    "Gemini free tier via OpenAI-compat layer. Key: aistudio.google.com/apikey",
		FreeTier: true,
	},
	"mistral": {
		Name:     "Mistral (La Plateforme)",
		BaseURL:  "https://api.mistral.ai/v1",
		Notes:    "Free experiment tier. Key: console.mistral.ai",
		FreeTier: true,
	},
	"together": {
		Name:     "Together AI",
		BaseURL:  "https://api.together.xyz/v1",
		Notes:    "Some free models (e.g. Llama Vision free). Key: api.together.ai",
		FreeTier: true,
	},
	"deepseek": {
		Name:    "DeepSeek",
		BaseURL: "https://api.deepseek.com/v1",
		Notes:   "Paid, very cheap. Key: platform.deepseek.com",
	},
	"openai": {
		Name:    "OpenAI",
		BaseURL: "https://api.openai.com/v1",
		Notes:   "Paid. Key: platform.openai.com",
	},
	"vllm-local": {
		Name:     "Local vLLM / Ollama",
		BaseURL:  "http://127.0.0.1:8000/v1",
		Notes:    "Self-hosted OpenAI-compatible server (no key needed usually)",
		FreeTier: true,
	},
}

// ============================================================================
// Fallback 集成：自定义 provider 参与 modelFallbackChain
// ============================================================================

// CallCustomProviderAPI 尝试用自定义 provider 服务请求；成功返回响应。
// 失败返回 error（调用方决定是否降级）。

// GetProviderByID 返回指定 ID 提供商的副本（是否存在由第二个返回值指示）。
func GetProviderByID(id string) (CustomProvider, bool) {
	providersMu.Lock()
	defer providersMu.Unlock()
	for _, p := range customProviders {
		if p.ID == id {
			return *p, true
		}
	}
	return CustomProvider{}, false
}
