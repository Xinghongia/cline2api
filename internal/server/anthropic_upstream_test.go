package server

import (
	"encoding/json"
	"io"
	"strings"
	"testing"
)

func TestOpenAIParamsToAnthropicBodySystemAndTools(t *testing.T) {
	body := map[string]any{
		"model":      "claude-3-5-sonnet-20241022",
		"max_tokens": float64(1024),
		"stream":     true,
		"messages": []any{
			map[string]any{"role": "system", "content": "be nice"},
			map[string]any{"role": "user", "content": "hello"},
			map[string]any{
				"role":    "assistant",
				"content": "calling tool",
				"tool_calls": []any{map[string]any{
					"id":   "tu_1",
					"type": "function",
					"function": map[string]any{
						"name":      "get_weather",
						"arguments": `{"city":"x"}`,
					},
				}},
			},
			map[string]any{"role": "tool", "tool_call_id": "tu_1", "content": `{"temp":20}`},
		},
		"tools": []any{map[string]any{
			"type": "function",
			"function": map[string]any{
				"name":        "get_weather",
				"description": "get weather",
				"parameters":  map[string]any{"type": "object"},
			},
		}},
	}

	out := openAIParamsToAnthropicBody(body)

	if out["system"] != "be nice" {
		t.Fatalf("system = %v", out["system"])
	}
	if out["max_tokens"] != float64(1024) {
		t.Fatalf("max_tokens = %v", out["max_tokens"])
	}
	msgs, _ := out["messages"].([]any)
	if len(msgs) != 3 {
		t.Fatalf("messages = %d (system上提、tool 转 user), want 3", len(msgs))
	}
	// assistant 消息应含 tool_use 块
	asst, _ := msgs[1].(map[string]any)
	blocks, _ := asst["content"].([]any)
	foundToolUse := false
	for _, b := range blocks {
		bm, _ := b.(map[string]any)
		if bm["type"] == "tool_use" {
			foundToolUse = true
			input, _ := bm["input"].(map[string]any)
			if input["city"] != "x" {
				t.Fatalf("tool_use input = %v", input)
			}
		}
	}
	if !foundToolUse {
		t.Fatal("assistant message missing tool_use block")
	}
	// tool 角色转 user + tool_result
	toolMsg, _ := msgs[2].(map[string]any)
	if toolMsg["role"] != "user" {
		t.Fatalf("tool result message role = %v", toolMsg["role"])
	}
	tools, _ := out["tools"].([]any)
	t0, _ := tools[0].(map[string]any)
	if _, ok := t0["input_schema"]; !ok {
		t.Fatal("tools missing input_schema")
	}
}

func TestAnthropicMessageToOpenAI(t *testing.T) {
	resp := map[string]any{
		"id":    "msg_1",
		"model": "claude-3-5-sonnet-20241022",
		"content": []any{
			map[string]any{"type": "text", "text": "hello "},
			map[string]any{"type": "text", "text": "world"},
			map[string]any{"type": "tool_use", "id": "tu_9", "name": "f", "input": map[string]any{"a": 1}},
		},
		"stop_reason": "tool_use",
		"usage":       map[string]any{"input_tokens": float64(11), "output_tokens": float64(7)},
	}
	out := anthropicMessageToOpenAI(resp)

	if out["object"] != "chat.completion" {
		t.Fatalf("object = %v", out["object"])
	}
	choices, _ := out["choices"].([]any)
	c0, _ := choices[0].(map[string]any)
	msg, _ := c0["message"].(map[string]any)
	if msg["content"] != "hello world" {
		t.Fatalf("content = %v", msg["content"])
	}
	tcs, _ := msg["tool_calls"].([]any)
	if len(tcs) != 1 {
		t.Fatalf("tool_calls = %d", len(tcs))
	}
	if c0["finish_reason"] != "tool_calls" {
		t.Fatalf("finish_reason = %v", c0["finish_reason"])
	}
	usage, _ := out["usage"].(map[string]any)
	if usage["prompt_tokens"] != int64(11) || usage["completion_tokens"] != int64(7) {
		t.Fatalf("usage = %v", usage)
	}
}

func TestAnthropicStreamToOpenAIStream(t *testing.T) {
	sse := strings.Join([]string{
		`event: message_start`,
		`data: {"type":"message_start","message":{"id":"msg_x","model":"claude","usage":{"input_tokens":9,"output_tokens":0}}}`,
		``,
		`data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}`,
		``,
		`data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}`,
		``,
		`data: {"type":"message_stop"}`,
		``,
	}, "\n")

	converted := anthropicStreamToOpenAIStream(strings.NewReader(sse))
	defer converted.Close()
	raw, err := io.ReadAll(converted)
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)

	if !strings.Contains(text, `"role":"assistant"`) {
		t.Fatal("missing role chunk")
	}
	if !strings.Contains(text, `"content":"Hi"`) {
		t.Fatal("missing text delta chunk")
	}
	if !strings.Contains(text, `"finish_reason":"stop"`) {
		t.Fatal("missing finish chunk")
	}
	if !strings.Contains(text, `"prompt_tokens":9`) || !strings.Contains(text, `"completion_tokens":3`) {
		t.Fatal("missing usage in final chunk")
	}
	if !strings.Contains(text, "data: [DONE]") {
		t.Fatal("missing DONE sentinel")
	}
	// 每行都是合法 JSON（data: 前缀之后）
	for _, line := range strings.Split(text, "\n\n") {
		line = strings.TrimSpace(line)
		if line == "" || line == "data: [DONE]" {
			continue
		}
		if !strings.HasPrefix(line, "data: ") {
			t.Fatalf("bad sse line: %q", line)
		}
		var v map[string]any
		if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &v); err != nil {
			t.Fatalf("chunk not json: %v (%q)", err, line)
		}
	}
}
