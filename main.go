package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"html"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
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
	windowWidth   = 224
	windowHeight  = 76
)

var (
	version = "dev"
	commit  = ""
	date    = ""
)

//go:embed docs/assets/logo.png
var trayIcon []byte

func main() {
	if shouldPrintVersion(os.Args) {
		fmt.Println("Work Light " + versionSummary())
		return
	}

	aggregator := codexstatus.NewAggregator(statusTimeout)
	var server *http.Server
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	emitStatus := dedupedEmitter(func(event codexstatus.StatusEvent) {
		application.Get().Event.Emit("codexStatusChanged", event)
	})

	var app *application.App
	options := buildApplicationOptions(func() {
		cancel()
		if server == nil {
			return
		}
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer shutdownCancel()
		_ = server.Shutdown(shutdownCtx)
	})
	options.SingleInstance.OnSecondInstanceLaunch = func(application.SecondInstanceData) {
		if app == nil {
			return
		}
		if window, ok := app.Window.Get("work-light"); ok {
			window.Show().Focus()
		}
	}
	app = application.New(options)

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

	mainWindow := app.Window.NewWithOptions(buildMainWindowOptions())
	if systemTrayEnabled() {
		setupSystemTray(app, mainWindow)
	}

	log.Printf("codex hook listener: http://%s/codex/hook", hookAddr)
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}

func buildMainWindowOptions() application.WebviewWindowOptions {
	return application.WebviewWindowOptions{
		Title:            "Work Light",
		Name:             "work-light",
		Width:            windowWidth,
		Height:           windowHeight,
		MinWidth:         windowWidth,
		MinHeight:        windowHeight,
		MaxWidth:         windowWidth,
		MaxHeight:        windowHeight,
		Hidden:           true,
		Zoom:             1.0,
		Frameless:        true,
		AlwaysOnTop:      true,
		DisableResize:    true,
		BackgroundType:   application.BackgroundTypeSolid,
		BackgroundColour: application.NewRGB(8, 16, 16),
		Windows: application.WindowsWindow{
			HiddenOnTaskbar: true,
		},
	}
}

func systemTrayEnabled() bool {
	return true
}

func buildApplicationOptions(onShutdown func()) application.Options {
	return application.Options{
		Name:        "Work Light",
		Description: "Codex status floating window " + versionSummary(),
		Assets: application.AssetOptions{
			Handler: frontendassets.Assets(),
		},
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "dev.tigotin.work-light",
			OnSecondInstanceLaunch: func(application.SecondInstanceData) {
			},
			ExitCode: 0,
		},
		OnShutdown: onShutdown,
	}
}

func setupSystemTray(app *application.App, window application.Window) {
	languagePath := trayLanguageSettingsPath()
	language := loadTrayLanguage(languagePath)
	pinned := true
	var tray *application.SystemTray
	var setLanguage func(trayLanguage)
	var renderTray func()
	var togglePinned func()

	setLanguage = func(next trayLanguage) {
		language = normalizeTrayLanguage(string(next))
		if err := saveTrayLanguage(languagePath, language); err != nil {
			log.Printf("save tray language: %v", err)
		}
		renderTray()
	}
	togglePinned = func() {
		pinned = !pinned
		window.SetAlwaysOnTop(pinned)
		renderTray()
	}
	renderTray = func() {
		applySystemTrayText(tray, window, app, language, pinned, setLanguage, togglePinned)
	}

	tray = app.SystemTray.New().
		SetIcon(trayIcon).
		AttachWindow(window).
		WindowOffset(8)
	renderTray()
}

func applySystemTrayText(
	tray *application.SystemTray,
	window application.Window,
	app *application.App,
	language trayLanguage,
	pinned bool,
	setLanguage func(trayLanguage),
	togglePinned func(),
) {
	labels := trayLabels(language)
	menu := application.NewMenu()
	menu.Add(labels.Show).OnClick(func(*application.Context) {
		window.Show().Focus()
	})
	menu.Add(labels.Hide).OnClick(func(*application.Context) {
		window.Hide()
	})
	if pinned {
		menu.Add(labels.Unpin).OnClick(func(*application.Context) {
			togglePinned()
		})
	} else {
		menu.Add(labels.Pin).OnClick(func(*application.Context) {
			togglePinned()
		})
	}
	menu.Add(labels.ClearError).OnClick(func(*application.Context) {
		application.Get().Event.Emit("workLightClearError")
	})
	languageMenu := menu.AddSubmenu(labels.Language)
	languageMenu.AddRadio(labels.Chinese, language == trayLanguageChinese).OnClick(func(*application.Context) {
		setLanguage(trayLanguageChinese)
	})
	languageMenu.AddRadio(labels.English, language == trayLanguageEnglish).OnClick(func(*application.Context) {
		setLanguage(trayLanguageEnglish)
	})
	menu.AddSeparator()
	menu.Add(labels.Quit).OnClick(func(*application.Context) {
		app.Quit()
	})

	tray.SetMenu(menu)
	tray.SetLabel(labels.Status)
	tray.SetTooltip(trayTooltip(labels))
}

type trayLanguage string

const (
	trayLanguageChinese trayLanguage = "zh"
	trayLanguageEnglish trayLanguage = "en"
)

type trayText struct {
	Show       string
	Hide       string
	Quit       string
	Language   string
	Chinese    string
	English    string
	Status     string
	Pin        string
	Unpin      string
	ClearError string
}

type trayLanguageSettings struct {
	Language string `json:"language"`
}

func defaultTrayLanguage() trayLanguage {
	return trayLanguageChinese
}

func normalizeTrayLanguage(language string) trayLanguage {
	switch trayLanguage(language) {
	case trayLanguageChinese:
		return trayLanguageChinese
	case trayLanguageEnglish:
		return trayLanguageEnglish
	default:
		return defaultTrayLanguage()
	}
}

func trayLabels(language trayLanguage) trayText {
	if normalizeTrayLanguage(string(language)) == trayLanguageEnglish {
		return trayText{
			Show:       "Show Work Light",
			Hide:       "Hide Window",
			Quit:       "Quit",
			Language:   "Language",
			Chinese:    "中文",
			English:    "English",
			Status:     "Work Light",
			Pin:        "Pin on Top",
			Unpin:      "Unpin from Top",
			ClearError: "Clear Error",
		}
	}

	return trayText{
		Show:       "显示工作灯",
		Hide:       "隐藏窗口",
		Quit:       "退出",
		Language:   "语言",
		Chinese:    "中文",
		English:    "English",
		Status:     "工作灯",
		Pin:        "固定置顶",
		Unpin:      "取消置顶",
		ClearError: "清除错误",
	}
}

func trayTooltip(labels trayText) string {
	return labels.Status + " " + versionSummary()
}

func trayLanguageSettingsPath() string {
	configDir, err := os.UserConfigDir()
	if err != nil || configDir == "" {
		return filepath.Join(".", "work-light-settings.json")
	}
	return filepath.Join(configDir, "Work Light", "settings.json")
}

func loadTrayLanguage(path string) trayLanguage {
	data, err := os.ReadFile(path)
	if err != nil {
		return defaultTrayLanguage()
	}
	var settings trayLanguageSettings
	if err := json.Unmarshal(data, &settings); err != nil {
		return defaultTrayLanguage()
	}
	return normalizeTrayLanguage(settings.Language)
}

func saveTrayLanguage(path string, language trayLanguage) error {
	settings := trayLanguageSettings{Language: string(normalizeTrayLanguage(string(language)))}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o644)
}

func versionSummary() string {
	currentVersion := version
	if currentVersion == "" {
		currentVersion = "dev"
	}
	if commit == "" && date == "" {
		return currentVersion
	}
	shortCommit := commit
	if len(shortCommit) > 7 {
		shortCommit = shortCommit[:7]
	}
	if shortCommit == "" {
		shortCommit = "unknown"
	}
	buildDate := date
	if buildDate == "" {
		buildDate = "unknown"
	}
	return fmt.Sprintf("%s (%s, %s)", currentVersion, shortCommit, buildDate)
}

func shouldPrintVersion(args []string) bool {
	for _, arg := range args[1:] {
		if arg == "--version" || arg == "-v" {
			return true
		}
	}
	return false
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
