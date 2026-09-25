package reqlog

import (
	"testing"
	"time"

	"cline-go-proxy/internal/types"
)

func testEntry(id string, at time.Time, model, upstream string, in, out int64) types.RequestLog {
	return types.RequestLog{
		ID: id, StartedAt: at, FinishedAt: at.Add(time.Second),
		Model: model, Upstream: upstream, Protocol: "openai",
		InputTokens: in, OutputTokens: out, TotalTokens: in + out, UsageAvailable: true,
		Completed: true,
	}
}

func TestAppendAndListRoundtrip(t *testing.T) {
	restore := SwapForTest(nil)
	defer restore()

	now := time.Now()
	AppendRequestLog(testEntry("a", now.Add(-2*time.Second), "m1", "cline", 10, 20))
	AppendRequestLog(testEntry("b", now.Add(-1*time.Second), "m2", "cline", 1, 2))
	AppendRequestLog(testEntry("c", now, "m1", "opencode", 5, 5))

	if Len() != 3 {
		t.Fatalf("Len = %d, want 3", Len())
	}
	page, err := ListRequestLogs(2, "", nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 || !page.HasMore {
		t.Fatalf("page items=%d hasMore=%v, want 2/true", len(page.Items), page.HasMore)
	}
	if page.Items[0].ID != "c" {
		t.Fatalf("newest first expected c, got %s", page.Items[0].ID)
	}

	page2, err := ListRequestLogs(2, page.NextCursor, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(page2.Items) != 1 || page2.Items[0].ID != "a" {
		t.Fatalf("second page = %+v, want only a", page2.Items)
	}
}

func TestListFilters(t *testing.T) {
	restore := SwapForTest(nil)
	defer restore()

	now := time.Now()
	AppendRequestLog(testEntry("ok", now, "m1", "cline", 1, 1))
	failed := testEntry("bad", now, "m2", "opencode", 1, 1)
	failed.Completed = false
	failed.Error = "upstream 500: boom"
	AppendRequestLog(failed)
	AppendRequestLog(testEntry("zkey", now, "m3", "cline", 1, 1))

	page, err := ListRequestLogs(10, "", &LogFilter{Status: "error"})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != "bad" {
		t.Fatalf("status=error filter got %+v", page.Items)
	}

	page, err = ListRequestLogs(10, "", &LogFilter{Upstream: "opencode"})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != "bad" {
		t.Fatalf("upstream filter got %+v", page.Items)
	}

	page, err = ListRequestLogs(10, "", &LogFilter{Q: "m3"})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != "zkey" {
		t.Fatalf("q filter got %+v", page.Items)
	}
}

func TestHourlyAggregationAndSeries(t *testing.T) {
	restore := SwapForTest(nil)
	defer restore()

	now := time.Now().Truncate(time.Hour)
	AppendRequestLog(testEntry("a", now, "m1", "cline", 10, 20))
	AppendRequestLog(testEntry("b", now.Add(time.Minute), "m1", "cline", 5, 5))
	AppendRequestLog(testEntry("c", now.Add(2*time.Minute), "m2", "opencode", 100, 1))

	to := now.Add(2 * time.Hour)
	groups, err := SeriesQuery("hour", "total", now.Add(-time.Minute), to, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 1 || groups[0].Name != "total" || len(groups[0].Points) != 1 {
		t.Fatalf("total series = %+v", groups)
	}
	p := groups[0].Points[0]
	if p.Requests != 3 || p.InputTokens != 115 || p.OutputTokens != 26 || p.TotalTokens != 141 {
		t.Fatalf("aggregated point = %+v", p)
	}

	groups, err = SeriesQuery("hour", "upstream", now.Add(-time.Minute), to, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 2 {
		t.Fatalf("upstream groups = %d, want 2", len(groups))
	}

	groups, err = SeriesQuery("day", "model", now.Add(-time.Minute), to, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 2 {
		t.Fatalf("model groups = %d, want 2", len(groups))
	}
}

func TestSummaryQuery(t *testing.T) {
	restore := SwapForTest(nil)
	defer restore()

	now := time.Now().Truncate(time.Hour)
	AppendRequestLog(testEntry("a", now, "m1", "cline", 10, 20))
	AppendRequestLog(testEntry("b", now, "m2", "opencode", 30, 40))

	totals, models, upstreams, _, err := SummaryQuery(now.Add(-time.Minute), now.Add(time.Hour), nil)
	if err != nil {
		t.Fatal(err)
	}
	if totals.Requests != 2 || totals.TotalTokens != 100 {
		t.Fatalf("totals = %+v", totals)
	}
	if len(models) != 2 || len(upstreams) != 2 {
		t.Fatalf("tops: models=%d upstreams=%d", len(models), len(upstreams))
	}
	// 按总 token 排序，m2(70) 在前
	if models[0]["name"] != "m2" {
		t.Fatalf("top model = %v, want m2", models[0]["name"])
	}
}

func TestSweepRemovesOldEntries(t *testing.T) {
	restore := SwapForTest(nil)
	defer restore()

	now := time.Now()
	s := G()
	AppendRequestLog(testEntry("old", now.Add(-2*RawLogRetention), "m", "cline", 1, 1))
	AppendRequestLog(testEntry("new", now, "m", "cline", 1, 1))
	s.sweep()
	if Len() != 1 {
		t.Fatalf("Len after sweep = %d, want 1", Len())
	}
	if At(0).ID != "new" {
		t.Fatalf("survivor = %s, want new", At(0).ID)
	}
}

func TestFinalizeClassifiesErrors(t *testing.T) {
	restore := SwapForTest(nil)
	defer restore()

	e := types.RequestLog{StartedAt: time.Now()}
	FinalizeRequestLog(&e, types.TokenUsage{}, time.Time{}, e.StartedAt, false, "upstream 429: rate limited")
	if e.ErrorClass != "rate_limit" {
		t.Fatalf("class = %q, want rate_limit", e.ErrorClass)
	}
	if Len() != 1 {
		t.Fatalf("finalize should persist, Len=%d", Len())
	}
}
