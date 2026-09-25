package pool

import (
	"cline-go-proxy/internal/types"
	"testing"
	"time"
)

// withEmptyAccounts 清空账号池并在测试结束后恢复，避免测试间相互污染。
func withEmptyAccounts(t *testing.T) {
	t.Helper()
	p := Load()
	old := p.Accounts
	p.Accounts = []*types.Account{}
	Save()
	t.Cleanup(func() {
		q := Load()
		q.Accounts = old
		Save()
	})
}

func TestFindAccountByRefreshToken(t *testing.T) {
	withEmptyAccounts(t)

	tok := "refresh-token-abc"
	if got := FindByRefreshToken(tok); got != nil {
		t.Fatalf("unknown token should not match, got %+v", got)
	}
	if AccountExists(tok) {
		t.Fatal("AccountExists should be false for unknown token")
	}

	Add(&types.Account{
		AccountID:    "acc_test_1",
		Email:        "a@example.com",
		RefreshToken: tok,
		Status:       "active",
		CreatedAt:    time.Now(),
	})

	if got := FindByRefreshToken(tok); got == nil || got.AccountID != "acc_test_1" {
		t.Fatalf("FindByRefreshToken(%q) = %+v, want acc_test_1", tok, got)
	}
	// 前后空白应被忽略
	if got := FindByRefreshToken("  " + tok + "\t"); got == nil || got.AccountID != "acc_test_1" {
		t.Fatalf("lookup should trim whitespace, got %+v", got)
	}
	// 空 token 永远不应命中
	if AccountExists("") || AccountExists("   ") {
		t.Fatal("empty token must never match an account")
	}
}

func TestIsDuplicateImportToken(t *testing.T) {
	withEmptyAccounts(t)

	Add(&types.Account{
		AccountID:    "acc_existing",
		Email:        "b@example.com",
		RefreshToken: "existing-token",
		Status:       "active",
		CreatedAt:    time.Now(),
	})

	seen := make(map[string]bool)

	// 账号池中已存在 → 重复
	if !IsDuplicateImportToken("existing-token", seen) {
		t.Fatal("token already in pool should be a duplicate")
	}
	// 首次出现 → 不重复，但记入 seen
	if IsDuplicateImportToken("new-token", seen) {
		t.Fatal("first occurrence in batch should not be a duplicate")
	}
	// 同批次第二次出现 → 重复
	if !IsDuplicateImportToken("new-token", seen) {
		t.Fatal("second occurrence within the same batch should be a duplicate")
	}
	// 未见过的新 token → 不重复
	if IsDuplicateImportToken("another-token", seen) {
		t.Fatal("unseen new token should not be a duplicate")
	}
}
