package main

import (
	"context"
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
		log.Fatalf("start hook listener %s: %v", hookAddr, err)
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
