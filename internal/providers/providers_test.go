package providers

import (
	"net/http"
	"testing"
	"time"
)

// 自定义 provider 命中时优先走 provider 上游。
// 优先级：同模型多 provider 时取 priority 最小的可用者。
func TestProviderPrioritySelection(t *testing.T) {
	t.Cleanup(func() {
		_ = DeleteProvider("prov_p1")
		_ = DeleteProvider("prov_p2")
	})
	UpsertProvider(&CustomProvider{ID: "prov_p1", Name: "Low", BaseURL: "http://a/v1", ModelIDs: []string{"m"}, Enabled: true, Priority: 5})
	UpsertProvider(&CustomProvider{ID: "prov_p2", Name: "High", BaseURL: "http://b/v1", ModelIDs: []string{"m"}, Enabled: true, Priority: 1})
	p := ResolveProviderForModel("m")
	if p == nil || p.Name != "High" {
		t.Fatalf("want High (priority 1), got %+v", p)
	}
	// 冷却 High 后选 Low
	SetProviderCooldown("prov_p2", "m", time.Now().Add(time.Minute))
	p = ResolveProviderForModel("m")
	if p == nil || p.Name != "Low" {
		t.Fatalf("after cooldown want Low, got %+v", p)
	}
}

// freeModelRoundTripper 是包内测试用的传输替身（与 relay 测试中的同名类型等价）。
type freeModelRoundTripper func(*http.Request) (*http.Response, error)

func (f freeModelRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
