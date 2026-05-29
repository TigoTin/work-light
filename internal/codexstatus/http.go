package codexstatus

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

const MaxHookPayloadBytes = 64 * 1024

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
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", http.MethodGet)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("ok\n"))
	})
	mux.HandleFunc("/codex/hook", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", http.MethodPost)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var payload HookPayload
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, MaxHookPayloadBytes)).Decode(&payload); err != nil {
			var maxBytesError *http.MaxBytesError
			if errors.As(err, &maxBytesError) {
				http.Error(w, "payload too large", http.StatusRequestEntityTooLarge)
				return
			}
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
