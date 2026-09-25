package server

// providers 路由集成测试：验证 provider 命中模型时优先于 Cline 账号池。

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"cline-go-proxy/internal/httpx"
	"cline-go-proxy/internal/pool"
	"cline-go-proxy/internal/providers"
	"cline-go-proxy/internal/proxyconfig"
	"cline-go-proxy/internal/types"
)

func TestCustomProviderServesModel(t *testing.T) {
	oldPool := pool.State
	oldConfig := proxyconfig.Get()
	oldTransport := httpx.Client.Transport
	t.Cleanup(func() {
		pool.State = oldPool
		proxyconfig.Set(oldConfig)
		httpx.Client.Transport = oldTransport
		_ = providers.DeleteProvider("prov_test1")
	})

	pool.State = &types.AccountPool{Accounts: []*types.Account{{
		AccountID: "a", Email: "a@x.com", AccessToken: "t",
		ExpiresAt: time.Now().Add(time.Hour).UnixMilli(), Status: "active",
	}}}
	proxyconfig.Set(proxyconfig.Default())

	upstreamModel := ""
	providerCalls := 0
	clineCalls := 0
	httpx.Client.Transport = freeModelRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.URL.Host == "provider.test" {
			providerCalls++
			body, _ := io.ReadAll(req.Body)
			var params map[string]any
			json.Unmarshal(body, &params)
			upstreamModel, _ = params["model"].(string)
			// 校验自定义头
			if req.Header.Get("X-Custom") != "abc" {
				t.Fatalf("custom header missing, got %q", req.Header.Get("X-Custom"))
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(`{"id":"p1","choices":[{"message":{"role":"assistant","content":"from-provider"}}]}`)),
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}
		clineCalls++
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(`{"id":"c1","choices":[{"message":{"role":"assistant","content":"from-cline"}}]}`)),
			Header:     make(http.Header),
			Request:    req,
		}, nil
	})

	providers.UpsertProvider(&providers.CustomProvider{
		ID: "prov_test1", Name: "TestProv", BaseURL: "http://provider.test/v1",
		APIKey: "sk-x", ModelIDs: []string{"custom-model-1"},
		Headers: map[string]string{"X-Custom": "abc"}, Enabled: true, Priority: 10,
	})

	params := map[string]any{"model": "custom-model-1", "max_tokens": 16, "messages": []any{map[string]any{"role": "user", "content": "hi"}}}
	resp, acc, err := callClineAPI(params, false)
	if err != nil {
		t.Fatalf("expected provider success, got %v", err)
	}
	defer resp.Body.Close()
	if acc != nil {
		t.Fatal("provider-served request should not consume a cline account")
	}
	if providerCalls != 1 || clineCalls != 0 {
		t.Fatalf("providerCalls=%d clineCalls=%d, want 1/0", providerCalls, clineCalls)
	}
	if upstreamModel != "custom-model-1" {
		t.Fatalf("upstream model = %q", upstreamModel)
	}
}

// provider 失败（冷却）后自动降级到回退链 → cline 池，客户端无感知。
func TestCustomProviderFailureFallsBackToChain(t *testing.T) {
	oldPool := pool.State
	oldConfig := proxyconfig.Get()
	oldTransport := httpx.Client.Transport
	t.Cleanup(func() {
		pool.State = oldPool
		proxyconfig.Set(oldConfig)
		httpx.Client.Transport = oldTransport
		_ = providers.DeleteProvider("prov_test2")
	})

	pool.State = &types.AccountPool{Accounts: []*types.Account{{
		AccountID: "a", Email: "a@x.com", AccessToken: "t",
		ExpiresAt: time.Now().Add(time.Hour).UnixMilli(), Status: "active",
	}}}
	proxyconfig.Set(proxyconfig.Default())

	httpx.Client.Transport = freeModelRoundTripper(func(req *http.Request) (*http.Response, error) {
		if req.URL.Host == "provider.test" {
			return &http.Response{
				StatusCode: http.StatusInternalServerError,
				Body:       io.NopCloser(strings.NewReader(`{"error":"boom"}`)),
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(`{"id":"c1","choices":[{"message":{"role":"assistant","content":"from-cline"}}]}`)),
			Header:     make(http.Header),
			Request:    req,
		}, nil
	})

	providers.UpsertProvider(&providers.CustomProvider{
		ID: "prov_test2", Name: "BrokenProv", BaseURL: "http://provider.test/v1",
		APIKey: "sk-x", ModelIDs: []string{"z-ai/glm-5.3-flash"},
		Enabled: true, Priority: 10,
	})
	defer providers.SetProviderCooldown("prov_test2", "z-ai/glm-5.3-flash", time.Time{})

	params := map[string]any{"model": "z-ai/glm-5.3-flash", "max_tokens": 16, "messages": []any{map[string]any{"role": "user", "content": "hi"}}}
	resp, _, err := callClineAPI(params, false)
	if err != nil {
		t.Fatalf("expected fallback success, got %v", err)
	}
	defer resp.Body.Close()
}
