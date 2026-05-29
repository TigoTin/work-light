package frontend

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed all:dist
var distFS embed.FS

func Assets() http.Handler {
	dist, err := fs.Sub(distFS, "dist")
	if err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "frontend/dist is not embedded; run npm --prefix frontend run build before go build", http.StatusInternalServerError)
		})
	}
	return http.FileServer(http.FS(dist))
}
