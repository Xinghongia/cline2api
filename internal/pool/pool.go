package pool

import (
	"cline-go-proxy/internal/apphome"
	"cline-go-proxy/internal/proxyconfig"
	"cline-go-proxy/internal/types"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

var (
	State *types.AccountPool
	Mu    sync.Mutex
	Path  string
)

func init() {
	Path = apphome.ResolveDataPath(".cline-accounts.json")
}
func Load() *types.AccountPool {
	Mu.Lock()
	defer Mu.Unlock()

	if State != nil {
		return State
	}

	data, err := os.ReadFile(Path)
	if err != nil {
		State = &types.AccountPool{Accounts: []*types.Account{}, Keys: []string{}, Models: []types.Model{}}
		return State
	}

	var p types.AccountPool
	if err := json.Unmarshal(data, &p); err != nil {
		State = &types.AccountPool{Accounts: []*types.Account{}, Keys: []string{}, Models: []types.Model{}}
		return State
	}

	if p.Accounts == nil {
		p.Accounts = []*types.Account{}
	}
	if p.Keys == nil {
		p.Keys = []string{}
	}
	if p.Models == nil {
		p.Models = []types.Model{}
	}
	State = &p
	return State
}

func Save() {
	data, _ := json.MarshalIndent(State, "", "  ")
	if err := os.WriteFile(Path, data, 0600); err != nil {
		log.Printf("Failed to save accounts: %v", err)
	}
}

func Add(acc *types.Account) {
	p := Load()
	Mu.Lock()
	p.Accounts = append(p.Accounts, acc)
	Mu.Unlock()
	Save()
}

// FindByRefreshToken 按 refreshToken 查找已有账号（不存在返回 nil）。
// 用于导入时的去重：同一个 refreshToken 只应存在一个账号。
func FindByRefreshToken(refreshToken string) *types.Account {
	refreshToken = strings.TrimSpace(refreshToken)
	if refreshToken == "" {
		return nil
	}
	p := Load()
	Mu.Lock()
	defer Mu.Unlock()

	for _, a := range p.Accounts {
		if strings.TrimSpace(a.RefreshToken) == refreshToken {
			return a
		}
	}
	return nil
}

// AccountExists 判断该 refreshToken 是否已在账号池中。
func AccountExists(refreshToken string) bool {
	return FindByRefreshToken(refreshToken) != nil
}

// IsDuplicateImportToken 判断待导入的 refreshToken 是否应跳过（导入去重）：
// 账号池中已存在同一 refreshToken，或本批次内已处理过（seen）。
// seen 由调用方维护、在此更新，用于同一批次内的去重。
func IsDuplicateImportToken(refreshToken string, seen map[string]bool) bool {
	if seen[refreshToken] || AccountExists(refreshToken) {
		return true
	}
	seen[refreshToken] = true
	return false
}

func Remove(accountID string) bool {
	p := Load()
	Mu.Lock()
	defer Mu.Unlock()

	for i, a := range p.Accounts {
		if a.AccountID == accountID {
			p.Accounts = append(p.Accounts[:i], p.Accounts[i+1:]...)
			Save()
			return true
		}
	}
	return false
}

func GetByID(accountID string) *types.Account {
	p := Load()
	Mu.Lock()
	defer Mu.Unlock()

	for _, a := range p.Accounts {
		if a.AccountID == accountID {
			return a
		}
	}
	return nil
}

func RefreshAccountToken(acc *types.Account) error {
	resp, err := RefreshClineToken(acc.RefreshToken)
	if err != nil {
		acc.Status = "expired"
		Save()
		return fmt.Errorf("token refresh failed: %w", err)
	}

	acc.AccessToken = "workos:" + resp.Data.AccessToken
	if resp.Data.RefreshToken != "" {
		acc.RefreshToken = resp.Data.RefreshToken
	}
	acc.ExpiresAt = ParseExpiry(resp.Data.ExpiresAt) - 60000
	acc.Status = "active"
	Save()
	return nil
}

func Pick() *types.Account {
	p := Load()
	Mu.Lock()
	defer Mu.Unlock()
	return pickAccountLocked(p)
}

// PickForModel 按轮询/策略挑选一个「该模型未处于模型级冷却」的账号；
// 所有 active 账号对该模型都冷却时回退到普通 Pick（请求会得到模型级 429 提示）。
// 空模型名等同于 Pick。
func PickForModel(model string) *types.Account {
	return PickForModelWithFallback(model, true)
}

func PickForModelStrict(model string) *types.Account {
	return PickForModelWithFallback(model, false)
}

func PickForModelWithFallback(model string, fallbackToActive bool) *types.Account {
	if model == "" {
		return Pick()
	}

	p := Load()
	Mu.Lock()
	defer Mu.Unlock()

	active := make([]*types.Account, 0)
	for _, a := range p.Accounts {
		if a.Status == "active" {
			active = append(active, a)
		}
	}
	if len(active) == 0 {
		return nil
	}

	// 该模型未冷却的账号列表
	eligible := make([]*types.Account, 0, len(active))
	for _, a := range active {
		until, cool := a.ModelCooldowns[model]
		if !cool || time.Now().After(until) {
			if cool {
				delete(a.ModelCooldowns, model)
			}
			eligible = append(eligible, a)
		}
	}

	if len(eligible) == 0 {
		if fallbackToActive {
			return pickAccountLocked(p)
		}
		return nil
	}

	cfg := proxyconfig.Get()
	var acc *types.Account
	switch cfg.Strategy {
	case "fill":
		acc = eligible[0]
	case "random":
		n := time.Now().UnixNano() % int64(len(eligible))
		acc = eligible[n]
	default: // round_robin
		if p.CurrentIdx >= len(eligible) {
			p.CurrentIdx = 0
		}
		acc = eligible[p.CurrentIdx]
		p.CurrentIdx = (p.CurrentIdx + 1) % len(eligible)
	}
	Save()
	return acc
}

// PickForModelLeastUsed 在所有「模型未冷却」的 active 账号中，选择该模型
// 历史用量最少的账号（并清掉已过期的冷却记录）。等量时按轮询索引取，保持原有
// 公平性；全部不可用返回 nil。供回退链上的非首选模型使用：流量应摊到较少
// 使用的账号上，而不是每次都砸在第一个可用账号。
func PickForModelLeastUsed(model string) *types.Account {
	if model == "" {
		return Pick()
	}

	p := Load()
	Mu.Lock()
	defer Mu.Unlock()

	var best *types.Account
	var bestCount int64
	for _, a := range p.Accounts {
		if a.Status != "active" {
			continue
		}
		if until, cool := a.ModelCooldowns[model]; cool {
			if time.Now().After(until) {
				delete(a.ModelCooldowns, model)
			} else {
				continue // 该账号此模型冷却中
			}
		}
		var cnt int64
		if st, ok := a.ModelStats[model]; ok {
			cnt = st.UsageCount
		}
		if best == nil || cnt < bestCount {
			best, bestCount = a, cnt
		}
	}
	if best == nil {
		return nil
	}
	Save()
	return best
}

// SortModelsByAvailability 将回退链按「可用性优先」重排：
//  1. 有未冷却账号的模型在前；
//  2. 同组内按该模型的账号总用量升序——把流量摊到用得少的模型上，
//     避免每次都选第一个可用模型、把它的额度打到冷却。
//  3. 稳定排序：可用性与用量相同时保持管理员配置的优先级顺序。
func SortModelsByAvailability(chain []string) []string {
	p := Load()
	Mu.Lock()
	defer Mu.Unlock()

	now := time.Now()
	type cand struct {
		model     string
		avail     bool
		minUsage  int64
		origOrder int
	}
	cs := make([]cand, 0, len(chain))
	for i, m := range chain {
		avail := false
		minUsage := int64(-1)
		for _, a := range p.Accounts {
			if a.Status != "active" {
				continue
			}
			if until, cool := a.ModelCooldowns[m]; cool {
				if now.After(until) {
					delete(a.ModelCooldowns, m)
				} else {
					continue
				}
			}
			avail = true
			var cnt int64
			if st, ok := a.ModelStats[m]; ok {
				cnt = st.UsageCount
			}
			if minUsage < 0 || cnt < minUsage {
				minUsage = cnt
			}
		}
		cs = append(cs, cand{model: m, avail: avail, minUsage: minUsage, origOrder: i})
	}
	sort.SliceStable(cs, func(x, y int) bool {
		if cs[x].avail != cs[y].avail {
			return cs[x].avail
		}
		if cs[x].avail && cs[x].minUsage != cs[y].minUsage {
			return cs[x].minUsage < cs[y].minUsage
		}
		return cs[x].origOrder < cs[y].origOrder
	})
	out := make([]string, len(cs))
	for i, c := range cs {
		out[i] = c.model
	}
	Save()
	return out
}

// pickAccountLocked 在已持有 Mu 的前提下执行普通轮询挑选（供 PickForModel 回退用）。
func pickAccountLocked(p *types.AccountPool) *types.Account {
	active := make([]*types.Account, 0)
	for _, a := range p.Accounts {
		if a.Status == "active" {
			active = append(active, a)
		}
	}
	if len(active) == 0 {
		return nil
	}
	cfg := proxyconfig.Get()
	var acc *types.Account
	switch cfg.Strategy {
	case "fill":
		acc = active[0]
	case "random":
		n := time.Now().UnixNano() % int64(len(active))
		acc = active[n]
	default:
		if p.CurrentIdx >= len(active) {
			p.CurrentIdx = 0
		}
		acc = active[p.CurrentIdx]
		p.CurrentIdx = (p.CurrentIdx + 1) % len(active)
	}
	Save()
	return acc
}

func EnsureToken(acc *types.Account) (string, error) {
	if acc.AccessToken != "" && time.Now().UnixMilli() < acc.ExpiresAt {
		return acc.AccessToken, nil
	}

	if err := RefreshAccountToken(acc); err != nil {
		return "", err
	}

	return acc.AccessToken, nil
}

func ListAccounts() []*types.Account {
	p := Load()
	Mu.Lock()
	defer Mu.Unlock()

	result := make([]*types.Account, len(p.Accounts))
	for i, a := range p.Accounts {
		// Don't expose tokens
		cp := &types.Account{
			AccountID:        a.AccountID,
			Email:            a.Email,
			Status:           a.Status,
			CooldownUntil:    a.CooldownUntil,
			LastUsed:         a.LastUsed,
			UsageCount:       a.UsageCount,
			PromptTokens:     a.PromptTokens,
			CompletionTokens: a.CompletionTokens,
			TotalTokens:      a.TotalTokens,
			CachedTokens:     a.CachedTokens,
			CreatedAt:        a.CreatedAt,
		}
		// 按模型细分统计（脱敏拷贝）
		if len(a.ModelStats) > 0 {
			cp.ModelStats = make(map[string]*types.ModelStat, len(a.ModelStats))
			for mid, st := range a.ModelStats {
				sc := *st
				cp.ModelStats[mid] = &sc
			}
		}
		// 模型级冷却（脱敏拷贝）
		if len(a.ModelCooldowns) > 0 {
			cp.ModelCooldowns = make(map[string]time.Time, len(a.ModelCooldowns))
			for mid, until := range a.ModelCooldowns {
				cp.ModelCooldowns[mid] = until
			}
		}
		result[i] = cp
	}
	return result
}
