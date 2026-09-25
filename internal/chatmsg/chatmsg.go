package chatmsg

import (
	"fmt"
	"time"
)

// 与上游请求整形相关的共享常量与工具（relay 与 providers 共用）。

const (
	DefaultMaxTokens     = 128000
	MinUpstreamMaxTokens = 16
)

var PassThroughKeys = []string{
	"tools", "tool_choice", "parallel_tool_calls", "functions", "function_call",
	"temperature", "top_p", "top_k", "stop", "presence_penalty", "frequency_penalty",
	"response_format", "user", "n", "logit_bias", "seed", "logprobs", "top_logprobs",
	"stream_options", "metadata",
}

func CleanMessages(messages []any) []any {
	cleaned := make([]any, 0, len(messages))
	for _, m := range messages {
		msg, ok := m.(map[string]any)
		if !ok {
			cleaned = append(cleaned, m)
			continue
		}
		cleaned = append(cleaned, msg)
	}
	return cleaned
}

// SanitizeMessages 修复出站消息历史中的畸形 tool_calls。
// 背景：上游偶发输出 function.name 为空的 tool call（GLM 流式分片丢失 / 工具调用
// 以文本形式泄漏），客户端执行后会把残缺记录回放进下一轮历史，导致上游恒定 400：
// "tool_calls[N].function.name must be a non-empty string"。
// 处理：
//  1. 丢弃 function.name 为空的 tool_call；
//  2. 过滤后 tool_calls 为空则移除该字段；
//  3. 丢弃没有对应合法 assistant tool_call 的孤儿 tool 结果（自愈被污染的会话）。
func SanitizeMessages(messages []any) []any {
	validToolIDs := make(map[string]bool)
	for _, m := range messages {
		msg, ok := m.(map[string]any)
		if !ok || msg["role"] != "assistant" {
			continue
		}
		tcs, ok := msg["tool_calls"].([]any)
		if !ok {
			continue
		}
		for _, tc := range tcs {
			tcMap, ok := tc.(map[string]any)
			if !ok {
				continue
			}
			fn, _ := tcMap["function"].(map[string]any)
			name, _ := fn["name"].(string)
			id, _ := tcMap["id"].(string)
			if name != "" && id != "" {
				validToolIDs[id] = true
			}
		}
	}

	cleaned := make([]any, 0, len(messages))
	for _, m := range messages {
		msg, ok := m.(map[string]any)
		if !ok {
			cleaned = append(cleaned, m)
			continue
		}
		role, _ := msg["role"].(string)

		// 孤儿 tool 结果：找不到对应的 assistant tool_call
		if role == "tool" {
			id, _ := msg["tool_call_id"].(string)
			if !validToolIDs[id] {
				continue
			}
			cleaned = append(cleaned, msg)
			continue
		}

		// assistant 消息：剔除空名 tool_call
		if role == "assistant" {
			if tcs, ok := msg["tool_calls"].([]any); ok {
				kept := make([]any, 0, len(tcs))
				for _, tc := range tcs {
					tcMap, ok := tc.(map[string]any)
					if !ok {
						continue
					}
					fn, _ := tcMap["function"].(map[string]any)
					name, _ := fn["name"].(string)
					if name == "" {
						continue
					}
					kept = append(kept, tcMap)
				}
				if len(kept) == 0 {
					delete(msg, "tool_calls")
				} else {
					msg["tool_calls"] = kept
				}
			}
		}
		cleaned = append(cleaned, msg)
	}
	return cleaned
}

// GenToolUseID 生成 tool_use 块 id（上游未返回 id 时的兜底）。
func GenToolUseID() string {
	return fmt.Sprintf("toolu_%x", time.Now().UnixNano())
}

// HasToolUseBlocks 判断 Anthropic content 块数组中是否含有有效的 tool_use 块。
func HasToolUseBlocks(content any) bool {
	blocks, ok := content.([]any)
	if !ok {
		return false
	}
	for _, b := range blocks {
		if bm, ok := b.(map[string]any); ok && bm["type"] == "tool_use" {
			return true
		}
	}
	return false
}

// MsgCount 返回 params 里的消息条数（日志与遥测用）。
func MsgCount(params map[string]any) int {
	if msgs, ok := params["messages"].([]any); ok {
		return len(msgs)
	}
	return 0
}
