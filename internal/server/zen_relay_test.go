package server

// zen 上游相关的 relay 集成测试（responses/proxy 转换层）。

import (
	"cline-go-proxy/internal/chatmsg"
	"cline-go-proxy/internal/types"
	"encoding/json"
	"testing"
)

func TestAnthropicThinkingMapping(t *testing.T) {
	cases := []struct {
		name     string
		thinking string
		want     any // expected reasoning_effort in translated request
	}{
		{"disabled→none", `{"type":"disabled"}`, "none"},
		{"enabled→high", `{"type":"enabled","budget_tokens":8000}`, "high"},
		{"adaptive→high", `{"type":"adaptive"}`, "high"},
		{"absent→unset", "", nil},
	}
	for _, c := range cases {
		req := anthropicReq{
			Model:     "m1",
			MaxTokens: 100,
			Messages:  []anthropicMsg{{Role: "user", Content: "hi"}},
		}
		if c.thinking != "" {
			req.Thinking = json.RawMessage(c.thinking)
		}
		out := anthropicToOpenAI(req)
		got, ok := out["reasoning_effort"]
		if c.want == nil {
			if ok {
				t.Errorf("[%s] reasoning_effort should be absent, got %v", c.name, got)
			}
			continue
		}
		if got != c.want {
			t.Errorf("[%s] reasoning_effort = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestBuildUpstreamBodyNoneDropsReasoningEffort(t *testing.T) {
	body := buildUpstreamBody(map[string]any{
		"model":            "m1",
		"reasoning_effort": "none",
	}, false)
	if _, ok := body["reasoning_effort"]; ok {
		t.Errorf("reasoning_effort=none must be dropped, got %v", body["reasoning_effort"])
	}

	// 默认仍然下发 high
	body2 := buildUpstreamBody(map[string]any{"model": "m1"}, false)
	if body2["reasoning_effort"] != defaultReasoningEffort {
		t.Errorf("default reasoning_effort = %v, want %v", body2["reasoning_effort"], defaultReasoningEffort)
	}
}

// TestBuildUpstreamBodyClampsMaxTokens 上游（OpenRouter/Meta）要求输出 token >= 16：
// 0 视为未设置、1~15 兜到默认值，>=16 原样透传。背景：ZCode 等客户端的后台
// 小任务会发很小的 max_tokens，触发 muse-spark 400 且错误被回退链吞掉。
func TestBuildUpstreamBodyClampsMaxTokens(t *testing.T) {
	cases := []struct {
		name   string
		params map[string]any
		want   int
	}{
		{"absent", map[string]any{"model": "m1"}, chatmsg.DefaultMaxTokens},
		{"zero", map[string]any{"model": "m1", "max_tokens": float64(0)}, chatmsg.DefaultMaxTokens},
		{"tiny", map[string]any{"model": "m1", "max_tokens": float64(8)}, chatmsg.DefaultMaxTokens},
		{"completion-tiny", map[string]any{"model": "m1", "max_completion_tokens": float64(8)}, chatmsg.DefaultMaxTokens},
		{"boundary-16", map[string]any{"model": "m1", "max_tokens": float64(16)}, 16},
		{"normal", map[string]any{"model": "m1", "max_tokens": float64(1024)}, 1024},
	}
	for _, tc := range cases {
		body := buildUpstreamBody(tc.params, false)
		if got, _ := body["max_tokens"].(int); got != tc.want {
			t.Errorf("%s: max_tokens = %d, want %d", tc.name, got, tc.want)
		}
	}
}

func TestOpenAIToAnthropicThinkingBlock(t *testing.T) {
	out := openAIToAnthropic(map[string]any{
		"model": "m1",
		"choices": []any{map[string]any{
			"finish_reason": "stop",
			"message": map[string]any{
				"role":              "assistant",
				"content":           "answer",
				"reasoning_content": "thinking hard",
			},
		}},
	})
	blocks, ok := out["content"].([]any)
	if !ok || len(blocks) != 2 {
		t.Fatalf("want thinking+text blocks, got %v", out["content"])
	}
	first, _ := blocks[0].(map[string]any)
	if first["type"] != "thinking" || first["thinking"] != "thinking hard" {
		t.Errorf("first block should be thinking, got %v", first)
	}
	second, _ := blocks[1].(map[string]any)
	if second["type"] != "text" || second["text"] != "answer" {
		t.Errorf("second block should be text, got %v", second)
	}

	// 无 reasoning_content 时保持单 text 块
	out2 := openAIToAnthropic(map[string]any{
		"model": "m1",
		"choices": []any{map[string]any{
			"finish_reason": "stop",
			"message":       map[string]any{"role": "assistant", "content": "plain"},
		}},
	})
	blocks2, _ := out2["content"].([]any)
	if len(blocks2) != 1 {
		t.Fatalf("want single text block, got %v", blocks2)
	}
	if b, _ := blocks2[0].(map[string]any); b["type"] != "text" {
		t.Errorf("block type = %v, want text", b["type"])
	}
}
func TestResponsesToChatStringInput(t *testing.T) {
	out := responsesToChat(map[string]any{
		"model":             "m1",
		"input":             "hello",
		"instructions":      "be brief",
		"max_output_tokens": 500.0,
	})
	msgs := out["messages"].([]any)
	if len(msgs) != 2 {
		t.Fatalf("want system+user, got %d", len(msgs))
	}
	if msgs[0].(map[string]any)["role"] != "system" {
		t.Error("instructions should become first system message")
	}
	if out["max_tokens"] != 500 {
		t.Errorf("max_output_tokens mapping: %v", out["max_tokens"])
	}
}

func TestResponsesToChatToolRoundTrip(t *testing.T) {
	body := map[string]any{
		"model": "m1",
		"input": []any{
			map[string]any{"type": "message", "role": "user", "content": "run it"},
			map[string]any{"type": "function_call", "call_id": "fc1", "name": "shell", "arguments": map[string]any{"cmd": "ls"}},
			map[string]any{"type": "function_call_output", "call_id": "fc1", "output": "file.txt"},
		},
		"tools": []any{map[string]any{
			"type": "function", "name": "shell", "description": "run command",
			"parameters": map[string]any{"type": "object"},
		}},
	}
	out := responsesToChat(body)
	msgs := out["messages"].([]any)
	if len(msgs) != 3 {
		t.Fatalf("want user+assistant(tool_call)+tool, got %d msgs", len(msgs))
	}
	tc := msgs[1].(map[string]any)["tool_calls"].([]any)[0].(map[string]any)
	if tc["id"] != "fc1" {
		t.Errorf("call_id propagation: %v", tc["id"])
	}
	var argsObj map[string]any
	json.Unmarshal([]byte(tc["function"].(map[string]any)["arguments"].(string)), &argsObj)
	if argsObj["cmd"] != "ls" {
		t.Errorf("object arguments marshaled: %v", argsObj)
	}
	if msgs[2].(map[string]any)["role"] != "tool" {
		t.Error("function_call_output -> role tool")
	}
	tools := out["tools"].([]any)[0].(map[string]any)
	fn := tools["function"].(map[string]any)
	if tools["type"] != "function" || fn["name"] != "shell" {
		t.Errorf("flat tool conversion broken: %v", tools)
	}
}

func TestChatToResponsesUsageMapping(t *testing.T) {
	chat := map[string]any{
		"model": "mm",
		"choices": []any{map[string]any{
			"message": map[string]any{"content": "answer text", "tool_calls": []any{
				map[string]any{"id": "c9", "type": "function",
					"function": map[string]any{"name": "f1", "arguments": "{}"}},
			}},
		}},
		"usage": map[string]any{
			"prompt_tokens": float64(11), "completion_tokens": float64(7), "total_tokens": float64(18),
			"prompt_tokens_details": map[string]any{"cached_tokens": float64(3)},
		},
	}
	resp := chatToResponses(chat)
	if resp["object"] != "response" || resp["status"] != "completed" {
		t.Errorf("response envelope: %v/%v", resp["object"], resp["status"])
	}
	outputs := resp["output"].([]any)
	if outputs[0].(map[string]any)["type"] != "message" {
		t.Errorf("first item type: %v", outputs[0])
	}
	if outputs[1].(map[string]any)["call_id"] != "c9" {
		t.Errorf("function_call call_id: %v", outputs[1])
	}
	u := resp["usage"].(map[string]any)
	if u["input_tokens"] != float64(11) || u["output_tokens"] != float64(7) {
		t.Errorf("usage mapping: %v", u)
	}
	if u["input_tokens_details"].(map[string]any)["cached_tokens"] != float64(3) {
		t.Errorf("cached tokens mapping: %v", u)
	}
	if resp["output_text"] != "answer text" {
		t.Errorf("output_text: %v", resp["output_text"])
	}
}

func TestUnwrapDataEnvelope(t *testing.T) {
	in := map[string]any{"data": map[string]any{"choices": []any{}, "id": "abc"}}
	if unwrapDataEnvelope(in)["id"] != "abc" {
		t.Error("envelope should be unwrapped when data has choices/id")
	}
	if unwrapDataEnvelope(map[string]any{"other": 1}) == nil {
		t.Error("non-envelope passthrough")
	}
}

func TestUsageToResponses(t *testing.T) {
	u := usageToResponses(types.TokenUsage{Prompt: 10, Completion: 5, Cached: 2})
	if u["input_tokens"] != int64(10) || u["output_tokens"] != int64(5) || u["total_tokens"] != int64(15) {
		t.Errorf("aggregate usage: %v", u)
	}
	if u["input_tokens_details"].(map[string]any)["cached_tokens"] != int64(2) {
		t.Errorf("cached detail: %v", u)
	}
}

// ============ 匿名免费层 agent 形态伪装测试 ============
