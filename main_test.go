package main

import (
	"errors"
	"strings"
	"testing"
)

func TestHookListenErrorMessageExplainsPortConflict(t *testing.T) {
	message := hookListenErrorMessage("127.0.0.1:17373", errors.New("bind: address already in use"))

	for _, want := range []string{"127.0.0.1:17373", "already using this port", "bind: address already in use"} {
		if !strings.Contains(message, want) {
			t.Fatalf("message %q does not contain %q", message, want)
		}
	}
}
