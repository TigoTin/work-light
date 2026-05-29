package main

import (
	"context"
	"html"
	"log"
	"net"
	"net/http"
	"reflect"
	"sync"
	"time"

	frontendassets "work-light/frontend"
	"work-light/internal/codexstatus"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	hookAddr      = "127.0.0.1:17373"
	statusTimeout = 45 * time.Second
	windowWidth   = 220
	windowHeight  = 72
)

func main() {
	aggregator := codexstatus.NewAggregator(statusTimeout)
	var server *http.Server
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	emitStatus := dedupedEmitter(func(event codexstatus.StatusEvent) {
		application.Get().Event.Emit("codexStatusChanged", event)
	})

	app := application.New(application.Options{
		Name:        "Work Light",
		Description: "Codex status floating window",
		Assets: application.AssetOptions{
			Handler: frontendassets.Assets(),
		},
		OnShutdown: func() {
			cancel()
			if server == nil {
				return
			}
			shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer shutdownCancel()
			_ = server.Shutdown(shutdownCtx)
		},
	})

	server = &http.Server{
		Addr:              hookAddr,
		Handler:           codexstatus.NewHookHandler(aggregator, emitStatus, time.Now),
		ReadHeaderTimeout: 5 * time.Second,
	}

	listener, err := net.Listen("tcp", hookAddr)
	if err != nil {
		message := hookListenErrorMessage(hookAddr, err)
		log.Print(message)
		app.Window.NewWithOptions(application.WebviewWindowOptions{
			Title:         "Work Light Hook Error",
			Name:          "work-light-hook-error",
			Width:         420,
			Height:        260,
			MinWidth:      420,
			MinHeight:     260,
			MaxWidth:      420,
			MaxHeight:     260,
			AlwaysOnTop:   true,
			DisableResize: true,
			HTML:          hookListenErrorHTML(message),
		})
		if err := app.Run(); err != nil {
			log.Fatal(err)
		}
		return
	}
	defer listener.Close()

	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("hook server stopped: %v", err)
		}
	}()
	go emitTimeoutChanges(ctx, aggregator, emitStatus)

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:         "Work Light",
		Name:          "work-light",
		Width:         windowWidth,
		Height:        windowHeight,
		MinWidth:      windowWidth,
		MinHeight:     windowHeight,
		MaxWidth:      windowWidth,
		MaxHeight:     windowHeight,
		Frameless:     true,
		AlwaysOnTop:   true,
		DisableResize: true,
	})

	log.Printf("codex hook listener: http://%s/codex/hook", hookAddr)
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}

func dedupedEmitter(emit codexstatus.Emitter) codexstatus.Emitter {
	var mu sync.Mutex
	var last codexstatus.StatusEvent
	var hasLast bool

	return func(event codexstatus.StatusEvent) {
		mu.Lock()
		defer mu.Unlock()
		if hasLast && event.Status == last.Status && reflect.DeepEqual(event.Sessions, last.Sessions) {
			return
		}
		last = event
		hasLast = true
		emit(event)
	}
}

func hookListenErrorMessage(addr string, err error) string {
	return "Work Light could not start the Codex hook listener on " + addr + ".\n\n" +
		"Another process is already using this port. Close the other Work Light instance or free the port, then start Work Light again.\n\n" +
		"Details: " + err.Error()
}

func hookListenErrorHTML(message string) string {
	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
body{margin:0;padding:24px;background:#151b1b;color:#fff8c7;font:14px "Courier New",monospace}
h1{margin:0 0 14px;font-size:18px;color:#ff6b5f}
pre{white-space:pre-wrap;line-height:1.45}
</style>
</head>
<body>
<h1>Hook listener unavailable</h1>
<pre>` + html.EscapeString(message) + `</pre>
</body>
</html>`
}

func emitTimeoutChanges(ctx context.Context, aggregator *codexstatus.Aggregator, emit codexstatus.Emitter) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			emit(aggregator.Current(now))
		}
	}
}
