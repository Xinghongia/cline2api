// Package proxyconfig 持有代理行为配置（轮询策略/上游请求头/免费链），
// 持久化到 .cline-config.json，供账号池策略、relay 路由与后台 API 共同读写。
package proxyconfig

import (
	"encoding/json"
	"log"
	"os"
	"sync"

	"cline-go-proxy/internal/apphome"
)

const dataFile = ".cline-config.json"

// Config 是可热更新的代理行为配置。
type Config struct {
	Strategy string            `json:"strategy"`
	Headers  map[string]string `json:"headers"`
	// ModelChain 冷却/降级时的模型回退顺序（管理员可配）。
	// 空 = 使用内置 free 链（glm-5.3-flash → deepseek-v4-flash → longcat-2.0）。
	ModelChain []string `json:"modelChain,omitempty"`
	OnlyFree   bool     `json:"onlyFree"` // 只显示免费模型：开启后 /models、/v1/models 仅返回免费模型
	// ModelPrices 模型单价（USD / 1M tokens），用于成本估算；独立于模型同步避免被覆盖
	ModelPrices map[string]ModelPrice `json:"modelPrices,omitempty"`
}

// ModelPrice 是单个模型的双向单价。
type ModelPrice struct {
	In  float64 `json:"in"`
	Out float64 `json:"out"`
}

var (
	mu      sync.Mutex
	current = loadFromDisk()
)

// Default 返回内置默认配置。
func Default() *Config {
	return &Config{
		Strategy: "round_robin",
		Headers: map[string]string{
			"User-Agent":         "Cline/3.0.47",
			"HTTP-Referer":       "https://cline.bot",
			"X-Title":            "Cline",
			"X-IS-MULTIROOT":     "false",
			"X-CLIENT-TYPE":      "cline-cli",
			"X-CLIENT-VERSION":   "3.0.47",
			"X-PLATFORM":         "terminal",
			"X-PLATFORM-VERSION": "3.0.47",
			"X-CORE-VERSION":     "0.0.66",
		},
	}
}

// loadFromDisk 启动时加载持久化的代理配置，文件不存在或损坏时回退默认值。
func loadFromDisk() *Config {
	cfg := Default()
	if data, err := os.ReadFile(apphome.ResolveDataPath(dataFile)); err == nil {
		if err := json.Unmarshal(data, cfg); err != nil {
			log.Printf("proxy config parse failed: %v", err)
		}
	}
	switch cfg.Strategy {
	case "round_robin", "fill", "random":
	default:
		cfg.Strategy = "round_robin"
	}
	return cfg
}

// saveLocked 落盘当前配置（调用方需持有 mu）。
func saveLocked() {
	data, err := json.MarshalIndent(current, "", "  ")
	if err != nil {
		return
	}
	if err := os.WriteFile(apphome.ResolveDataPath(dataFile), data, 0600); err != nil {
		log.Printf("proxy config save failed: %v", err)
	}
}

// Get 返回当前配置指针（调用方如需修改应配合 Set 落盘）。
func Get() *Config {
	mu.Lock()
	defer mu.Unlock()
	return current
}

// Set 替换并持久化配置。
func Set(c *Config) {
	mu.Lock()
	defer mu.Unlock()
	current = c
	saveLocked()
}

// SetModelPrice 设置模型单价；in/out 同时为 0 时删除该条目。
func SetModelPrice(id string, in, out float64) {
	mu.Lock()
	defer mu.Unlock()
	if current.ModelPrices == nil {
		current.ModelPrices = map[string]ModelPrice{}
	}
	if in == 0 && out == 0 {
		delete(current.ModelPrices, id)
	} else {
		current.ModelPrices[id] = ModelPrice{In: in, Out: out}
	}
	saveLocked()
}

// PricesSnapshot 返回单价表副本（id → 双向单价，单位 USD / 1M tokens）。
func PricesSnapshot() map[string]ModelPrice {
	mu.Lock()
	defer mu.Unlock()
	out := make(map[string]ModelPrice, len(current.ModelPrices))
	for k, v := range current.ModelPrices {
		out[k] = v
	}
	return out
}
