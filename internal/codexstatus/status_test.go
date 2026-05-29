package codexstatus

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHookEventToStatusMapping(t *testing.T) {
	tests := []struct {
		name string
		in   HookPayload
		want Status
	}{
		{name: "session start is idle", in: HookPayload{HookEventName: "SessionStart"}, want: StatusIdle},
		{name: "user prompt submit is working", in: HookPayload{HookEventName: "UserPromptSubmit"}, want: StatusWorking},
		{name: "pre tool use is working", in: HookPayload{HookEventName: "PreToolUse"}, want: StatusWorking},
		{name: "subagent start is working", in: HookPayload{HookEventName: "SubagentStart"}, want: StatusWorking},
		{name: "permission request waits for confirmation", in: HookPayload{HookEventName: "PermissionRequest"}, want: StatusWaitingConfirmation},
		{name: "stop is idle", in: HookPayload{HookEventName: "Stop"}, want: StatusIdle},
		{name: "subagent stop is idle", in: HookPayload{HookEventName: "SubagentStop"}, want: StatusIdle},
		{name: "explicit error event is error", in: HookPayload{HookEventName: "Error"}, want: StatusError},
		{name: "error like payload is error", in: HookPayload{HookEventName: "PostToolUse", Error: "boom"}, want: StatusError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := NormalizeStatus(tt.in); got != tt.want {
				t.Fatalf("NormalizeStatus() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestAggregatorUsesPriorityAcrossActiveSessions(t *testing.T) {
	now := time.Date(2026, 5, 29, 10, 0, 0, 0, time.UTC)
	agg := NewAggregator(time.Minute)

	agg.Apply(HookPayload{SessionID: "idle", HookEventName: "SessionStart"}, now)
	agg.Apply(HookPayload{SessionID: "working", HookEventName: "PreToolUse"}, now)
	agg.Apply(HookPayload{SessionID: "waiting", HookEventName: "PermissionRequest"}, now)
	event := agg.Apply(HookPayload{SessionID: "error", HookEventName: "PostToolUse", Error: "failed"}, now)

	if event.Status != StatusError {
		t.Fatalf("aggregate status = %q, want %q", event.Status, StatusError)
	}
	if event.SessionID != "error" || event.Label != "ERROR" {
		t.Fatalf("display session = %q label = %q, want error/ERROR", event.SessionID, event.Label)
	}

	agg.Apply(HookPayload{SessionID: "error", HookEventName: "Stop"}, now.Add(time.Second))
	if got := agg.Current(now.Add(time.Second)).Status; got != StatusWaitingConfirmation {
		t.Fatalf("aggregate after clearing error = %q, want %q", got, StatusWaitingConfirmation)
	}

	agg.Apply(HookPayload{SessionID: "waiting", HookEventName: "Stop"}, now.Add(2*time.Second))
	if got := agg.Current(now.Add(2 * time.Second)).Status; got != StatusWorking {
		t.Fatalf("aggregate after clearing waiting = %q, want %q", got, StatusWorking)
	}

	agg.Apply(HookPayload{SessionID: "working", HookEventName: "Stop"}, now.Add(3*time.Second))
	if got := agg.Current(now.Add(3 * time.Second)).Status; got != StatusIdle {
		t.Fatalf("aggregate after clearing working = %q, want %q", got, StatusIdle)
	}
}

func TestAggregatorDisplaySessionUsesHighestPriorityBeforeNewest(t *testing.T) {
	now := time.Date(2026, 5, 29, 10, 0, 0, 0, time.UTC)
	agg := NewAggregator(time.Minute)

	agg.Apply(HookPayload{SessionID: "waiting-old", CWD: "/repo/high", HookEventName: "PermissionRequest"}, now)
	event := agg.Apply(HookPayload{SessionID: "idle-new", CWD: "/repo/low", HookEventName: "SessionStart"}, now.Add(time.Second))

	if event.Status != StatusWaitingConfirmation {
		t.Fatalf("status = %q, want %q", event.Status, StatusWaitingConfirmation)
	}
	if event.SessionID != "waiting-old" {
		t.Fatalf("display session = %q, want waiting-old", event.SessionID)
	}
	if event.CWD != "/repo/high" {
		t.Fatalf("display cwd = %q, want /repo/high", event.CWD)
	}
	if event.Label != "WAITING" {
		t.Fatalf("label = %q, want WAITING", event.Label)
	}
}

func TestAggregatorStopClearsActiveSnapshotsForSameCWD(t *testing.T) {
	now := time.Date(2026, 5, 29, 10, 0, 0, 0, time.UTC)
	agg := NewAggregator(time.Minute)

	agg.Apply(HookPayload{SessionID: "old-waiting", CWD: "/repo", HookEventName: "PermissionRequest"}, now)
	agg.Apply(HookPayload{SessionID: "old-working", CWD: "/repo", HookEventName: "PreToolUse"}, now.Add(time.Second))
	event := agg.Apply(HookPayload{SessionID: "current", CWD: "/repo", HookEventName: "Stop"}, now.Add(2*time.Second))

	if event.Status != StatusIdle {
		t.Fatalf("status after stop = %q, want %q", event.Status, StatusIdle)
	}
	if event.CWD != "/repo" {
		t.Fatalf("display cwd after stop = %q, want /repo", event.CWD)
	}
}

func TestAggregatorStopDoesNotClearActiveSnapshotsForDifferentCWD(t *testing.T) {
	now := time.Date(2026, 5, 29, 10, 0, 0, 0, time.UTC)
	agg := NewAggregator(time.Minute)

	agg.Apply(HookPayload{SessionID: "other-waiting", CWD: "/other", HookEventName: "PermissionRequest"}, now)
	event := agg.Apply(HookPayload{SessionID: "current", CWD: "/repo", HookEventName: "Stop"}, now.Add(time.Second))

	if event.Status != StatusWaitingConfirmation {
		t.Fatalf("status after stop in different cwd = %q, want %q", event.Status, StatusWaitingConfirmation)
	}
	if event.CWD != "/other" {
		t.Fatalf("display cwd after stop in different cwd = %q, want /other", event.CWD)
	}
}

func TestAggregatorIgnoresTimedOutSessions(t *testing.T) {
	now := time.Date(2026, 5, 29, 10, 0, 0, 0, time.UTC)
	agg := NewAggregator(5 * time.Second)

	agg.Apply(HookPayload{SessionID: "s1", HookEventName: "PreToolUse"}, now)
	if got := agg.Current(now.Add(5 * time.Second)).Status; got != StatusWorking {
		t.Fatalf("status at timeout boundary = %q, want %q", got, StatusWorking)
	}

	event := agg.Current(now.Add(5*time.Second + time.Nanosecond))
	if event.Status != StatusOffline {
		t.Fatalf("status after timeout = %q, want %q", event.Status, StatusOffline)
	}
	if event.SessionID != "" || event.CWD != "" || event.Label != "OFFLINE" {
		t.Fatalf("offline display = sessionId:%q cwd:%q label:%q, want empty/empty/OFFLINE", event.SessionID, event.CWD, event.Label)
	}
}

func TestHTTPHandlerAcceptsPostJSONUpdatesTimestampAndEmits(t *testing.T) {
	now := time.Date(2026, 5, 29, 10, 0, 0, 0, time.UTC)
	var emitted []StatusEvent
	handler := NewHookHandler(NewAggregator(time.Minute), func(event StatusEvent) {
		emitted = append(emitted, event)
	}, func() time.Time {
		return now
	})

	body := map[string]any{
		"hook_event_name": "PermissionRequest",
		"session_id":      "session-1",
		"cwd":             "/repo",
		"permission_mode": "on-request",
	}
	payload, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodPost, "/codex/hook", bytes.NewReader(payload))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("status code = %d, want %d; body=%s", rec.Code, http.StatusAccepted, rec.Body.String())
	}
	if len(emitted) != 1 {
		t.Fatalf("emitted %d events, want 1", len(emitted))
	}

	event := emitted[0]
	if event.Status != StatusWaitingConfirmation {
		t.Fatalf("emitted status = %q, want %q", event.Status, StatusWaitingConfirmation)
	}
	if event.SessionID != "session-1" {
		t.Fatalf("top-level sessionId = %q, want session-1", event.SessionID)
	}
	if event.CWD != "/repo" {
		t.Fatalf("top-level cwd = %q, want /repo", event.CWD)
	}
	if event.Label != "WAITING" {
		t.Fatalf("top-level label = %q, want WAITING", event.Label)
	}
	if !event.UpdatedAt.Equal(now) {
		t.Fatalf("event UpdatedAt = %s, want %s", event.UpdatedAt, now)
	}
	if len(event.Sessions) != 1 {
		t.Fatalf("sessions = %d, want 1", len(event.Sessions))
	}
	session := event.Sessions[0]
	if session.SessionID != "session-1" || session.CWD != "/repo" || session.PermissionMode != "on-request" {
		t.Fatalf("session snapshot = %+v", session)
	}
	if !session.UpdatedAt.Equal(now) {
		t.Fatalf("session UpdatedAt = %s, want %s", session.UpdatedAt, now)
	}
}
