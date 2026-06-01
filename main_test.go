package main

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestHookListenErrorMessageExplainsPortConflict(t *testing.T) {
	message := hookListenErrorMessage("127.0.0.1:17373", errors.New("bind: address already in use"))

	for _, want := range []string{"127.0.0.1:17373", "already using this port", "bind: address already in use"} {
		if !strings.Contains(message, want) {
			t.Fatalf("message %q does not contain %q", message, want)
		}
	}
}

func TestVersionSummaryUsesInjectedValues(t *testing.T) {
	oldVersion, oldCommit, oldDate := version, commit, date
	t.Cleanup(func() {
		version, commit, date = oldVersion, oldCommit, oldDate
	})

	version = "1.2.3"
	commit = "abcdef123456"
	date = "2026-05-30T01:02:03Z"

	if got, want := versionSummary(), "1.2.3 (abcdef1, 2026-05-30T01:02:03Z)"; got != want {
		t.Fatalf("versionSummary() = %q, want %q", got, want)
	}
}

func TestVersionSummaryDefaultsToDev(t *testing.T) {
	oldVersion, oldCommit, oldDate := version, commit, date
	t.Cleanup(func() {
		version, commit, date = oldVersion, oldCommit, oldDate
	})

	version = ""
	commit = ""
	date = ""

	if got, want := versionSummary(), "dev"; got != want {
		t.Fatalf("versionSummary() = %q, want %q", got, want)
	}
}

func TestBuildApplicationOptionsEnablesSingleInstance(t *testing.T) {
	options := buildApplicationOptions(func() {})

	if options.Name != "Work Light" {
		t.Fatalf("Name = %q, want Work Light", options.Name)
	}
	if options.SingleInstance == nil {
		t.Fatal("SingleInstance is nil")
	}
	if options.SingleInstance.UniqueID != "dev.tigotin.work-light" {
		t.Fatalf("UniqueID = %q, want dev.tigotin.work-light", options.SingleInstance.UniqueID)
	}
	if options.SingleInstance.ExitCode != 0 {
		t.Fatalf("ExitCode = %d, want 0", options.SingleInstance.ExitCode)
	}
	if options.SingleInstance.OnSecondInstanceLaunch == nil {
		t.Fatal("OnSecondInstanceLaunch is nil")
	}
}

func TestMainWindowOptionsHideTaskbarEntry(t *testing.T) {
	options := buildMainWindowOptions()

	if !options.Hidden {
		t.Fatal("Hidden = false, want true so the window is shown only after frontend sizing")
	}
	if !options.Windows.HiddenOnTaskbar {
		t.Fatal("Windows.HiddenOnTaskbar = false, want true")
	}
	if !options.Frameless || !options.AlwaysOnTop {
		t.Fatalf("floating window options = frameless:%v alwaysOnTop:%v, want true/true", options.Frameless, options.AlwaysOnTop)
	}
}

func TestMainWindowUsesSolidDockBackground(t *testing.T) {
	options := buildMainWindowOptions()

	if options.BackgroundType != application.BackgroundTypeSolid {
		t.Fatalf("BackgroundType = %v, want BackgroundTypeSolid", options.BackgroundType)
	}
	if options.BackgroundColour != application.NewRGB(8, 16, 16) {
		t.Fatalf("BackgroundColour = %#v, want solid dock RGB", options.BackgroundColour)
	}
}

func TestSystemTrayEnabledByDefault(t *testing.T) {
	if !systemTrayEnabled() {
		t.Fatal("systemTrayEnabled() = false, want true so Work Light appears in the Windows status area")
	}
}

func TestSystemTrayUsesChineseTextByDefault(t *testing.T) {
	version = "dev"
	commit = ""
	date = ""

	labels := trayLabels(defaultTrayLanguage())
	if got, want := labels.Show, "显示工作灯"; got != want {
		t.Fatalf("trayShowLabel() = %q, want %q", got, want)
	}
	if got, want := labels.Hide, "隐藏窗口"; got != want {
		t.Fatalf("trayHideLabel() = %q, want %q", got, want)
	}
	if got, want := labels.Quit, "退出"; got != want {
		t.Fatalf("trayQuitLabel() = %q, want %q", got, want)
	}
	if got, want := labels.Language, "语言"; got != want {
		t.Fatalf("tray language label = %q, want %q", got, want)
	}
	if got, want := labels.Status, "工作灯"; got != want {
		t.Fatalf("trayStatusLabel() = %q, want %q", got, want)
	}
	if got, want := labels.Pin, "固定置顶"; got != want {
		t.Fatalf("tray pin label = %q, want %q", got, want)
	}
	if got, want := labels.Unpin, "取消置顶"; got != want {
		t.Fatalf("tray unpin label = %q, want %q", got, want)
	}
	if got, want := labels.ClearError, "清除错误"; got != want {
		t.Fatalf("tray clear error label = %q, want %q", got, want)
	}
	if got, want := trayTooltip(labels), "工作灯 dev"; got != want {
		t.Fatalf("trayTooltip() = %q, want %q", got, want)
	}
}

func TestSystemTrayUsesEnglishTextWhenSelected(t *testing.T) {
	version = "dev"
	commit = ""
	date = ""

	labels := trayLabels(trayLanguageEnglish)
	if got, want := labels.Show, "Show Work Light"; got != want {
		t.Fatalf("english show label = %q, want %q", got, want)
	}
	if got, want := labels.Hide, "Hide Window"; got != want {
		t.Fatalf("english hide label = %q, want %q", got, want)
	}
	if got, want := labels.Quit, "Quit"; got != want {
		t.Fatalf("english quit label = %q, want %q", got, want)
	}
	if got, want := labels.Language, "Language"; got != want {
		t.Fatalf("english language label = %q, want %q", got, want)
	}
	if got, want := labels.Status, "Work Light"; got != want {
		t.Fatalf("english status label = %q, want %q", got, want)
	}
	if got, want := labels.Pin, "Pin on Top"; got != want {
		t.Fatalf("english pin label = %q, want %q", got, want)
	}
	if got, want := labels.Unpin, "Unpin from Top"; got != want {
		t.Fatalf("english unpin label = %q, want %q", got, want)
	}
	if got, want := labels.ClearError, "Clear Error"; got != want {
		t.Fatalf("english clear error label = %q, want %q", got, want)
	}
	if got, want := trayTooltip(labels), "Work Light dev"; got != want {
		t.Fatalf("english tooltip = %q, want %q", got, want)
	}
}

func TestTrayLanguageSupportsOnlyChineseAndEnglish(t *testing.T) {
	if got := normalizeTrayLanguage("zh"); got != trayLanguageChinese {
		t.Fatalf("normalizeTrayLanguage(zh) = %q, want %q", got, trayLanguageChinese)
	}
	if got := normalizeTrayLanguage("en"); got != trayLanguageEnglish {
		t.Fatalf("normalizeTrayLanguage(en) = %q, want %q", got, trayLanguageEnglish)
	}
	if got := normalizeTrayLanguage("fr"); got != trayLanguageChinese {
		t.Fatalf("normalizeTrayLanguage(fr) = %q, want default %q", got, trayLanguageChinese)
	}
}

func TestTrayLanguagePersistsSelection(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")

	if got := loadTrayLanguage(path); got != trayLanguageChinese {
		t.Fatalf("loadTrayLanguage(missing) = %q, want default %q", got, trayLanguageChinese)
	}
	if err := saveTrayLanguage(path, trayLanguageEnglish); err != nil {
		t.Fatalf("saveTrayLanguage() error = %v", err)
	}
	if got := loadTrayLanguage(path); got != trayLanguageEnglish {
		t.Fatalf("loadTrayLanguage(saved) = %q, want %q", got, trayLanguageEnglish)
	}
	if err := saveTrayLanguage(path, trayLanguage("fr")); err != nil {
		t.Fatalf("saveTrayLanguage(invalid) error = %v", err)
	}
	if got := loadTrayLanguage(path); got != trayLanguageChinese {
		t.Fatalf("loadTrayLanguage(invalid saved) = %q, want default %q", got, trayLanguageChinese)
	}
}

func TestMainWindowHasStartupBreathingRoom(t *testing.T) {
	options := buildMainWindowOptions()

	if options.Width != 224 || options.Height != 76 {
		t.Fatalf("window size = %dx%d, want 224x76 for the smaller floating widget", options.Width, options.Height)
	}
}

func TestMainWindowForcesNeutralWebviewZoom(t *testing.T) {
	options := buildMainWindowOptions()

	if options.Zoom != 1.0 {
		t.Fatalf("Zoom = %v, want 1.0 so persisted WebView zoom cannot crop the compact UI", options.Zoom)
	}
	if options.ZoomControlEnabled {
		t.Fatal("ZoomControlEnabled = true, want false for a fixed-size status widget")
	}
}

func TestShouldPrintVersion(t *testing.T) {
	if !shouldPrintVersion([]string{"work-light", "--version"}) {
		t.Fatal("shouldPrintVersion() = false, want true")
	}
	if !shouldPrintVersion([]string{"work-light", "-v"}) {
		t.Fatal("shouldPrintVersion() = false for -v, want true")
	}
	if shouldPrintVersion([]string{"work-light"}) {
		t.Fatal("shouldPrintVersion() = true without version flag, want false")
	}
}
