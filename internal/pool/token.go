package pool

import (
	"encoding/json"
	"fmt"
	"time"

	"cline-go-proxy/internal/httpx"
	"cline-go-proxy/internal/types"
)

// ClineRefreshResp 是 Cline 令牌刷新接口的响应体。
type ClineRefreshResp struct {
	Data struct {
		AccessToken  string `json:"accessToken"`
		RefreshToken string `json:"refreshToken"`
		ExpiresAt    any    `json:"expiresAt"`
	} `json:"data"`
}

// RefreshClineToken 用 refreshToken 换取新的访问令牌（WorkOS → Cline 注册链路）。
func RefreshClineToken(refreshToken string) (*ClineRefreshResp, error) {
	body := map[string]string{
		"refreshToken": refreshToken,
		"grantType":    "refresh_token",
	}
	resp, err := httpx.PostJSON(types.ClineAPIBase+"/auth/refresh", body)
	if err != nil {
		return nil, fmt.Errorf("cline refresh: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("cline refresh failed: %d", resp.StatusCode)
	}

	var c ClineRefreshResp
	if err := json.NewDecoder(resp.Body).Decode(&c); err != nil {
		return nil, fmt.Errorf("cline refresh decode: %w", err)
	}
	return &c, nil
}

// ParseExpiry 解析上游返回的过期时间（毫秒时间戳 / RFC3339 均兼容）。
func ParseExpiry(exp any) int64 {
	switch v := exp.(type) {
	case float64:
		return int64(v)
	case int64:
		return v
	case int:
		return int64(v)
	case string:
		t, err := time.Parse(time.RFC3339, v)
		if err == nil {
			return t.UnixMilli()
		}
		t, err = time.Parse(time.RFC3339Nano, v)
		if err == nil {
			return t.UnixMilli()
		}
	}
	return 0
}
