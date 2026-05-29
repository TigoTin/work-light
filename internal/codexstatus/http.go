package codexstatus

import (
	"encoding/json"
	"net/http"
	"time"
)

type Emitter func(StatusEvent)

type Clock func() time.Time

func NewHookHandler(aggregator *Aggregator, emit Emitter, clock Clock) http.Handler {
	if clock == nil {
		clock = time.Now
	}
	if emit == nil {
		emit = func(StatusEvent) {}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/codex/hook", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", http.MethodPost)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var payload HookPayload
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}

		event := aggregator.Apply(payload, clock())
		emit(event)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(event)
	})
	return mux
}
