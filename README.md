# Work Light

Work Light 是一个 Windows 桌面悬浮窗程序，用来接收 Codex Hook 事件并显示当前工作状态。程序启动后会监听：

```text
POST http://127.0.0.1:17373/codex/hook
```

## 构建 Windows 程序

在仓库任意目录运行：

```sh
bash scripts/build-windows.sh
```

脚本会先安装前端依赖，再运行 `npm --prefix frontend run build`，最后执行：

```sh
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -buildvcs=false -ldflags "-H=windowsgui" -o dist/work-light.exe .
```

产物路径：

```text
dist/work-light.exe
```

前端资源会通过 `go:embed` 打进 exe，运行时不需要同目录携带 `frontend/dist`。

## 运行

在 Windows 上双击或从终端启动：

```powershell
.\dist\work-light.exe
```

程序会在本机启动 Hook 接收端：`http://127.0.0.1:17373/codex/hook`。

## 配置 Codex Hook

把 Codex Hook 配成向本机 POST JSON。WSL/Codex 推荐直接使用仓库里的 shell 转发脚本：

```toml
[hooks]
SessionStart = { command = "/home/ding/workspaceWsl/my/work-light/scripts/codex-hook-forward.sh" }
UserPromptSubmit = { command = "/home/ding/workspaceWsl/my/work-light/scripts/codex-hook-forward.sh" }
PreToolUse = { command = "/home/ding/workspaceWsl/my/work-light/scripts/codex-hook-forward.sh" }
PostToolUse = { command = "/home/ding/workspaceWsl/my/work-light/scripts/codex-hook-forward.sh" }
PermissionRequest = { command = "/home/ding/workspaceWsl/my/work-light/scripts/codex-hook-forward.sh" }
Stop = { command = "/home/ding/workspaceWsl/my/work-light/scripts/codex-hook-forward.sh" }
```

Codex 会把 hook JSON 写入命令的 stdin；`scripts/codex-hook-forward.sh` 会转发到 `http://127.0.0.1:17373/codex/hook`，Work Light 未运行时会直接退出，不阻塞 Codex。

如果在 Windows 原生命令里运行 Codex，也可以继续使用 PowerShell 转发脚本和 Windows-only `command_windows`：

```toml
[hooks]
SessionStart = { command_windows = 'powershell -NoProfile -ExecutionPolicy Bypass -File "C:\path\to\work-light\scripts\codex-hook-forward.ps1"' }
UserPromptSubmit = { command_windows = 'powershell -NoProfile -ExecutionPolicy Bypass -File "C:\path\to\work-light\scripts\codex-hook-forward.ps1"' }
PreToolUse = { command_windows = 'powershell -NoProfile -ExecutionPolicy Bypass -File "C:\path\to\work-light\scripts\codex-hook-forward.ps1"' }
PostToolUse = { command_windows = 'powershell -NoProfile -ExecutionPolicy Bypass -File "C:\path\to\work-light\scripts\codex-hook-forward.ps1"' }
PermissionRequest = { command_windows = 'powershell -NoProfile -ExecutionPolicy Bypass -File "C:\path\to\work-light\scripts\codex-hook-forward.ps1"' }
Stop = { command_windows = 'powershell -NoProfile -ExecutionPolicy Bypass -File "C:\path\to\work-light\scripts\codex-hook-forward.ps1"' }
```

后端会保留 `hook_event_name`、`session_id`、`cwd`、`permission_mode`，补充 `updatedAt`，聚合最近活跃的会话，并向 Wails 窗口发送 `codexStatusChanged` 事件。

状态优先级是 `error > waiting_confirmation > working > idle > offline`。会话超过后端超时时间后不再参与聚合。
