package frontend

import (
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
)

func TestAssetsServeBuiltDist(t *testing.T) {
	handler := Assets()
	index := requestAsset(t, handler, "/")

	if strings.Contains(index, "/wails/runtime.js") {
		t.Fatalf("served development fallback instead of built frontend")
	}

	assetPath := regexp.MustCompile(`(?:src|href)="([^"]*/assets/[^"]+)"`).FindStringSubmatch(index)
	if len(assetPath) != 2 {
		t.Fatalf("index did not reference a built asset: %s", index)
	}
	if body := requestAsset(t, handler, assetPath[1]); strings.TrimSpace(body) == "" {
		t.Fatalf("embedded asset %q was empty", assetPath[1])
	}
}

func requestAsset(t *testing.T, handler http.Handler, path string) string {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, path, nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET %s = %d, want 200", path, recorder.Code)
	}

	body, err := io.ReadAll(recorder.Body)
	if err != nil {
		t.Fatal(err)
	}
	return string(body)
}
