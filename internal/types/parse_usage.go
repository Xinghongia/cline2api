package types

// ParseTokenUsage 从上游响应的 usage 字段解析 token 用量（兼容 OpenAI/Anthropic 多种字段拼写）。
func ParseTokenUsage(value any) TokenUsage {
	usage, ok := value.(map[string]any)
	if !ok {
		return TokenUsage{}
	}
	read := func(keys ...string) int64 {
		for _, key := range keys {
			if value, ok := usage[key].(float64); ok && value >= 0 {
				return int64(value)
			}
		}
		return 0
	}
	readNested := func(parent string, keys ...string) int64 {
		details, ok := usage[parent].(map[string]any)
		if !ok {
			return 0
		}
		for _, key := range keys {
			if value, ok := details[key].(float64); ok && value >= 0 {
				return int64(value)
			}
		}
		return 0
	}
	prompt := read("prompt_tokens", "input_tokens")
	completion := read("completion_tokens", "output_tokens")
	cached := int64(0)
	if nested := readNested("prompt_tokens_details", "cached_tokens"); nested > 0 {
		cached = nested
	} else if nested := readNested("input_tokens_details", "cached_tokens"); nested > 0 {
		cached = nested
	} else if v := read("cache_read_input_tokens") + read("cache_creation_input_tokens"); v > 0 {
		cached = v
	} else {
		cached = read("prompt_cache_hit_tokens", "prompt_cache_creation_tokens", "cached_tokens")
	}
	total := read("total_tokens")
	if total == 0 {
		total = prompt + completion
	}
	_, hasUsage := usage["prompt_tokens"]
	if !hasUsage {
		_, hasUsage = usage["input_tokens"]
		if !hasUsage {
			if _, hasUsage = usage["completion_tokens"]; !hasUsage {
				if _, hasUsage = usage["output_tokens"]; !hasUsage {
					_, hasUsage = usage["total_tokens"]
				}
			}
		}
	}
	if !hasUsage {
		_, hasUsage = usage["cache_read_input_tokens"]
		if !hasUsage {
			_, hasUsage = usage["cache_creation_input_tokens"]
			if !hasUsage {
				_, hasUsage = usage["prompt_tokens_details"]
				if !hasUsage {
					_, hasUsage = usage["input_tokens_details"]
				}
			}
		}
	}
	return TokenUsage{Prompt: prompt, Completion: completion, Total: total, Cached: cached, Valid: hasUsage}
}
