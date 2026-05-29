package codexstatus

import (
	"sort"
	"strings"
	"sync"
	"time"
)

type Status string

const (
	StatusOffline             Status = "offline"
	StatusIdle                Status = "idle"
	StatusWorking             Status = "working"
	StatusWaitingConfirmation Status = "waiting_confirmation"
	StatusError               Status = "error"
)

type HookPayload struct {
	HookEventName  string `json:"hook_event_name"`
	SessionID      string `json:"session_id"`
	CWD            string `json:"cwd"`
	PermissionMode string `json:"permission_mode"`
	Error          any    `json:"error,omitempty"`
}

type SessionSnapshot struct {
	HookEventName  string    `json:"hook_event_name"`
	SessionID      string    `json:"session_id"`
	CWD            string    `json:"cwd"`
	PermissionMode string    `json:"permission_mode"`
	Status         Status    `json:"status"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type StatusEvent struct {
	Status      Status            `json:"status"`
	SessionID   string            `json:"sessionId"`
	CWD         string            `json:"cwd"`
	UpdatedAt   time.Time         `json:"updatedAt"`
	Label       string            `json:"label"`
	OtherStatus Status            `json:"otherStatus,omitempty"`
	OtherCount  int               `json:"otherCount"`
	OtherCWDs   []string          `json:"otherCwds,omitempty"`
	Sessions    []SessionSnapshot `json:"sessions"`
}

type Aggregator struct {
	mu       sync.Mutex
	timeout  time.Duration
	sessions map[string]SessionSnapshot
}

func NewAggregator(timeout time.Duration) *Aggregator {
	return &Aggregator{
		timeout:  timeout,
		sessions: make(map[string]SessionSnapshot),
	}
}

func NormalizeStatus(payload HookPayload) Status {
	if isErrorLike(payload) {
		return StatusError
	}

	switch payload.HookEventName {
	case "SessionStart", "Stop", "SubagentStop":
		return StatusIdle
	case "UserPromptSubmit", "PreToolUse", "PostToolUse", "SubagentStart":
		return StatusWorking
	case "PermissionRequest":
		return StatusWaitingConfirmation
	default:
		return StatusIdle
	}
}

func (a *Aggregator) Apply(payload HookPayload, now time.Time) StatusEvent {
	a.mu.Lock()
	defer a.mu.Unlock()

	status := NormalizeStatus(payload)
	if payload.HookEventName == "Stop" && payload.CWD != "" {
		for sessionID, session := range a.sessions {
			if session.CWD == payload.CWD {
				delete(a.sessions, sessionID)
			}
		}
	}

	sessionID := payload.SessionID
	if sessionID == "" {
		sessionID = "unknown"
	}

	a.sessions[sessionID] = SessionSnapshot{
		HookEventName:  payload.HookEventName,
		SessionID:      sessionID,
		CWD:            payload.CWD,
		PermissionMode: payload.PermissionMode,
		Status:         status,
		UpdatedAt:      now,
	}

	return a.currentLocked(now)
}

func (a *Aggregator) Current(now time.Time) StatusEvent {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.currentLocked(now)
}

func (a *Aggregator) currentLocked(now time.Time) StatusEvent {
	active := make([]SessionSnapshot, 0, len(a.sessions))
	for _, session := range a.sessions {
		if a.isActive(session, now) {
			active = append(active, session)
		}
	}

	sort.Slice(active, func(i, j int) bool {
		return active[i].UpdatedAt.After(active[j].UpdatedAt)
	})

	status := StatusOffline
	var display SessionSnapshot
	hasDisplay := false
	primaryCWD, hasPrimary := primaryCWD(active)
	if hasPrimary {
		for _, session := range active {
			if session.CWD != primaryCWD {
				continue
			}
			if !hasDisplay || statusPriority(session.Status) > statusPriority(display.Status) {
				display = session
				hasDisplay = true
			}
			if statusPriority(session.Status) > statusPriority(status) {
				status = session.Status
			}
		}
	}

	otherStatus := Status("")
	otherCount := 0
	var otherCWDs []string
	seenOtherCWDs := make(map[string]bool)
	for _, session := range active {
		if !hasPrimary || session.CWD == primaryCWD {
			continue
		}
		otherCount++
		if statusPriority(session.Status) > statusPriority(otherStatus) {
			otherStatus = session.Status
		}
		if !seenOtherCWDs[session.CWD] {
			otherCWDs = append(otherCWDs, session.CWD)
			seenOtherCWDs[session.CWD] = true
		}
	}

	if otherCount == 0 {
		otherCWDs = nil
	}

	event := StatusEvent{
		Status:      status,
		UpdatedAt:   now,
		Label:       labelForStatus(status),
		OtherStatus: otherStatus,
		OtherCount:  otherCount,
		OtherCWDs:   otherCWDs,
		Sessions:    active,
	}
	if hasDisplay {
		event.SessionID = display.SessionID
		event.CWD = display.CWD
	}
	return event
}

func primaryCWD(active []SessionSnapshot) (string, bool) {
	if len(active) == 0 {
		return "", false
	}
	for _, session := range active {
		if session.CWD != "" {
			return session.CWD, true
		}
	}
	return active[0].CWD, true
}

func (a *Aggregator) isActive(session SessionSnapshot, now time.Time) bool {
	if a.timeout <= 0 {
		return true
	}
	return !now.After(session.UpdatedAt.Add(a.timeout))
}

func statusPriority(status Status) int {
	switch status {
	case StatusError:
		return 4
	case StatusWaitingConfirmation:
		return 3
	case StatusWorking:
		return 2
	case StatusIdle:
		return 1
	default:
		return 0
	}
}

func labelForStatus(status Status) string {
	switch status {
	case StatusError:
		return "ERROR"
	case StatusWaitingConfirmation:
		return "WAITING"
	case StatusWorking:
		return "WORKING"
	case StatusIdle:
		return "IDLE"
	default:
		return "OFFLINE"
	}
}

func isErrorLike(payload HookPayload) bool {
	if strings.Contains(strings.ToLower(payload.HookEventName), "error") {
		return true
	}
	if payload.Error == nil {
		return false
	}
	if s, ok := payload.Error.(string); ok {
		return s != ""
	}
	return true
}
