package server

// Anthropic 协议上游适配层：内部规范形态是 OpenAI chat 参数/响应，
// 当自定义 provider 声明 protocol=anthropic 时，在 callProvider 边界做双向转换，
// 使三种客户端协议（chat/completions、messages、responses）都能打到 Anthropic 格式上游。

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"
)

// openAIParamsToAnthropicBody 把 OpenAI chat 参数转为 Anthropic Messages 请求体。
// 处理：system 消息上提为顶层字段、tool 角色转 tool_result 块、assistant tool_calls
// 转 tool_use 块、tools 定义转 input_schema；max_tokens 为 Anthropic 必填。
func openAIParamsToAnthropicBody(body map[string]any) map[string]any {
	out := map[string]any{}
	out["model"] = body["model"]

	maxTokens := 8192.0
	if v, ok := body["max_tokens"].(float64); ok && v > 0 {
		maxTokens = v
	} else if v, ok := body["max_completion_tokens"].(float64); ok && v > 0 {
		maxTokens = v
	}
	out["max_tokens"] = maxTokens

	if v, ok := body["temperature"]; ok {
		out["temperature"] = v
	}
	if v, ok := body["top_p"]; ok {
		out["top_p"] = v
	}
	if v, ok := body["stream"].(bool); ok {
		out["stream"] = v
	}

	var systemParts []string
	messages := []any{}
	msgs, _ := body["messages"].([]any)
	for _, m := range msgs {
		mm, ok := m.(map[string]any)
		if !ok {
			continue
		}
		role, _ := mm["role"].(string)
		switch role {
		case "system", "developer":
			if c := flattenContent(mm["content"]); c != "" {
				systemParts = append(systemParts, c)
			}
		case "user":
			messages = append(messages, map[string]any{"role": "user", "content": mm["content"]})
		case "assistant":
			blocks := []any{}
			if txt := flattenContent(mm["content"]); txt != "" {
				blocks = append(blocks, map[string]any{"type": "text", "text": txt})
			}
			if tcs, ok := mm["tool_calls"].([]any); ok {
				for _, tc := range tcs {
					tcMap, ok := tc.(map[string]any)
					if !ok {
						continue
					}
					fn, _ := tcMap["function"].(map[string]any)
					name, _ := fn["name"].(string)
					id, _ := tcMap["id"].(string)
					var input any = map[string]any{}
					if raw, ok := fn["arguments"].(string); ok && strings.TrimSpace(raw) != "" {
						_ = json.Unmarshal([]byte(raw), &input)
					}
					blocks = append(blocks, map[string]any{"type": "tool_use", "id": id, "name": name, "input": input})
				}
			}
			if len(blocks) > 0 {
				messages = append(messages, map[string]any{"role": "assistant", "content": blocks})
			}
		case "tool":
			toolCallID, _ := mm["tool_call_id"].(string)
			messages = append(messages, map[string]any{
				"role": "user",
				"content": []any{map[string]any{
					"type":        "tool_result",
					"tool_use_id": toolCallID,
					"content":     mm["content"],
				}},
			})
		}
	}
	if len(systemParts) > 0 {
		out["system"] = strings.Join(systemParts, "\n\n")
	}
	out["messages"] = messages

	if tools, ok := body["tools"].([]any); ok && len(tools) > 0 {
		aTools := []any{}
		for _, t := range tools {
			tm, ok := t.(map[string]any)
			if !ok {
				continue
			}
			fn, _ := tm["function"].(map[string]any)
			if fn == nil {
				continue
			}
			name, _ := fn["name"].(string)
			desc, _ := fn["description"].(string)
			schema, ok := fn["parameters"]
			if !ok || schema == nil {
				schema = map[string]any{"type": "object"}
			}
			aTools = append(aTools, map[string]any{"name": name, "description": desc, "input_schema": schema})
		}
		if len(aTools) > 0 {
			out["tools"] = aTools
		}
	}
	return out
}

// flattenContent 把 OpenAI content（字符串或分块数组）压成纯文本。
func flattenContent(content any) string {
	switch c := content.(type) {
	case string:
		return c
	case []any:
		parts := []string{}
		for _, b := range c {
			if bm, ok := b.(map[string]any); ok {
				if bm["type"] == "text" {
					if t, ok := bm["text"].(string); ok {
						parts = append(parts, t)
					}
				}
			} else if t, ok := b.(string); ok {
				parts = append(parts, t)
			}
		}
		return strings.Join(parts, "")
	default:
		if c != nil {
			return fmt.Sprintf("%v", c)
		}
		return ""
	}
}

// anthropicMessageToOpenAI 把 Anthropic Messages 非流式响应转为 OpenAI chat.completion。
func anthropicMessageToOpenAI(resp map[string]any) map[string]any {
	id, _ := resp["id"].(string)
	if id == "" {
		id = fmt.Sprintf("chatcmpl_%d", time.Now().UnixNano())
	}
	model, _ := resp["model"].(string)

	var textParts []string
	toolCalls := []any{}
	content, _ := resp["content"].([]any)
	for _, b := range content {
		bm, ok := b.(map[string]any)
		if !ok {
			continue
		}
		switch bm["type"] {
		case "text":
			if t, ok := bm["text"].(string); ok && t != "" {
				textParts = append(textParts, t)
			}
		case "tool_use":
			name, _ := bm["name"].(string)
			tid, _ := bm["id"].(string)
			args, _ := json.Marshal(bm["input"])
			toolCalls = append(toolCalls, map[string]any{
				"id":   tid,
				"type": "function",
				"function": map[string]any{
					"name":      name,
					"arguments": string(args),
				},
			})
		}
	}

	message := map[string]any{"role": "assistant"}
	message["content"] = strings.Join(textParts, "")
	if len(toolCalls) > 0 {
		message["tool_calls"] = toolCalls
	}

	stopReason, _ := resp["stop_reason"].(string)
	usageIn, usageOut := anthropicUsage(resp)
	return map[string]any{
		"id":      id,
		"object":  "chat.completion",
		"created": time.Now().Unix(),
		"model":   model,
		"choices": []any{map[string]any{
			"index":         0,
			"message":       message,
			"finish_reason": anthropicStopToOpenAI(stopReason, len(toolCalls) > 0),
		}},
		"usage": map[string]any{
			"prompt_tokens":     usageIn,
			"completion_tokens": usageOut,
			"total_tokens":      usageIn + usageOut,
		},
	}
}

func anthropicUsage(resp map[string]any) (int64, int64) {
	u, _ := resp["usage"].(map[string]any)
	var in, out int64
	if v, ok := u["input_tokens"].(float64); ok {
		in = int64(v)
	}
	if v, ok := u["output_tokens"].(float64); ok {
		out = int64(v)
	}
	return in, out
}

func anthropicStopToOpenAI(stopReason string, hasToolCalls bool) string {
	switch stopReason {
	case "max_tokens":
		return "length"
	case "tool_use":
		return "tool_calls"
	case "end_turn", "stop_sequence":
		return "stop"
	default:
		if hasToolCalls {
			return "tool_calls"
		}
		return "stop"
	}
}

// chunkEmitter 按 OpenAI chunk 形态输出 SSE 行。
type chunkEmitter struct {
	w       io.Writer
	id      string
	model   string
	created int64
}

func (e *chunkEmitter) emit(delta map[string]any, finishReason any, usage map[string]any) error {
	choice := map[string]any{"index": 0, "delta": delta, "finish_reason": finishReason}
	chunk := map[string]any{
		"id":      e.id,
		"object":  "chat.completion.chunk",
		"created": e.created,
		"model":   e.model,
		"choices": []any{choice},
	}
	if usage != nil {
		chunk["usage"] = usage
	}
	b, err := json.Marshal(chunk)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(e.w, "data: %s\n\n", b)
	return err
}

// anthropicStreamToOpenAIStream 把 Anthropic Messages SSE 流实时转写为 OpenAI
// chat.completion.chunk 流：text_delta → delta.content；input_json_delta →
// tool_calls arguments 增量；message_delta 的 usage/stop_reason 归入收尾块。
func anthropicStreamToOpenAIStream(body io.Reader) io.ReadCloser {
	pr, pw := io.Pipe()
	go func() {
		defer pw.Close()

		e := &chunkEmitter{
			w:       pw,
			id:      fmt.Sprintf("chatcmpl_%d", time.Now().UnixNano()),
			created: time.Now().Unix(),
		}
		var inTokens, outTokens int64
		finish := ""
		// tool_use 块的流式聚合：content_block index → (工具调用序号, 工具名)
		toolBlocks := map[int]struct {
			callIndex int
			id        string
			name      string
		}{}
		callCount := 0

		scanner := bufio.NewScanner(body)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if !strings.HasPrefix(line, "data:") {
				continue
			}
			payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if payload == "" || payload == "[DONE]" {
				continue
			}
			var ev map[string]any
			if err := json.Unmarshal([]byte(payload), &ev); err != nil {
				continue
			}
			evType, _ := ev["type"].(string)
			switch evType {
			case "message_start":
				if msg, ok := ev["message"].(map[string]any); ok {
					if v, ok := msg["id"].(string); ok && v != "" {
						e.id = v
					}
					if v, ok := msg["model"].(string); ok && v != "" {
						e.model = v
					}
					inTokens, outTokens = anthropicUsage(msg)
				}
				_ = e.emit(map[string]any{"role": "assistant", "content": ""}, nil, nil)
			case "content_block_start":
				cb, _ := ev["content_block"].(map[string]any)
				idx, _ := ev["index"].(float64)
				if cb != nil && cb["type"] == "tool_use" {
					id, _ := cb["id"].(string)
					name, _ := cb["name"].(string)
					toolBlocks[int(idx)] = struct {
						callIndex int
						id        string
						name      string
					}{callIndex: callCount, id: id, name: name}
					_ = e.emit(map[string]any{"tool_calls": []any{map[string]any{
						"index": callCount,
						"id":    id,
						"type":  "function",
						"function": map[string]any{
							"name":      name,
							"arguments": "",
						},
					}}}, nil, nil)
					callCount++
				}
			case "content_block_delta":
				delta, _ := ev["delta"].(map[string]any)
				if delta == nil {
					continue
				}
				switch delta["type"] {
				case "text_delta":
					if txt, ok := delta["text"].(string); ok && txt != "" {
						_ = e.emit(map[string]any{"content": txt}, nil, nil)
					}
				case "input_json_delta":
					idx, _ := ev["index"].(float64)
					if tb, ok := toolBlocks[int(idx)]; ok {
						pj, _ := delta["partial_json"].(string)
						_ = e.emit(map[string]any{"tool_calls": []any{map[string]any{
							"index":    tb.callIndex,
							"function": map[string]any{"arguments": pj},
						}}}, nil, nil)
					}
				}
			case "message_delta":
				if delta, ok := ev["delta"].(map[string]any); ok {
					if sr, ok := delta["stop_reason"].(string); ok && sr != "" {
						finish = anthropicStopToOpenAI(sr, callCount > 0)
					}
				}
				if u, ok := ev["usage"].(map[string]any); ok {
					if v, ok := u["output_tokens"].(float64); ok {
						outTokens = int64(v)
					}
				}
			case "message_stop":
				usage := map[string]any{
					"prompt_tokens":     inTokens,
					"completion_tokens": outTokens,
					"total_tokens":      inTokens + outTokens,
				}
				_ = e.emit(map[string]any{}, finish, usage)
				fmt.Fprint(pw, "data: [DONE]\n\n")
				return
			}
		}
		// 上游未发送 message_stop 就断流：补一个收尾，避免客户端悬挂
		usage := map[string]any{
			"prompt_tokens":     inTokens,
			"completion_tokens": outTokens,
			"total_tokens":      inTokens + outTokens,
		}
		_ = e.emit(map[string]any{}, finish, usage)
		fmt.Fprint(pw, "data: [DONE]\n\n")
	}()
	return pr
}
