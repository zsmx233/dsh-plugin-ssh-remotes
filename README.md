# DSH Remote-SSH

原生 Remote-SSH 语义的标准 DSH 双端插件：浏览器 UI、会话、LLM 与 Agent 调度留在本机，远端只运行一个无依赖的轻量 Node.js 执行 Host。

## 架构

```text
Local DSH Web + sessions + LLM/Agent
  ├─ native better-sidebar tab: SSH 连接目标
  ├─ remote folder picker + recent workspace history
  ├─ native better-sidebar tab: Remote Explorer
  ├─ ctx.fs bridge (read/write/edit/list/stat)
  └─ ctx.shell bridge (foreground/background command)
          │ token-authenticated HTTP over ssh -L
          ▼
Remote Host (remote-host.cjs, 127.0.0.1 only)
  └─ workspace-root fenced fs + bash
```

它不会启动远端 `dsh web`，也不会把浏览器导航到另一套页面。连接成功后，插件创建本地 marker 目录作为 DSH workspace identity；现有文件工具根据 session cwd 自动识别远程会话并透明转发。普通本地会话继续使用原 `ctx.fs` / `ctx.shell` 实现。

## 安装

```powershell
dsh plugin --profile web add D:\Plugin\dsh-ssh-remotes
dsh web
```

打开左下角 `SSH` 进入“SSH 连接目标”，添加主机后点击“选择文件夹”。资源页会通过 SSH 浏览服务器目录；选中目录并点击“打开此文件夹”后，它会成为 DSH 工作区并自动出现在最近目录下。连接操作会自动上传 `remote-host.cjs`；远端只要求 OpenSSH 与 Node.js 12+，不要求安装 DSH 或 Web UI。

## 已实现

- 标准 DSH bundle/client 包结构（`exports`, `dsh.bundle.patch`, `dsh.client`）
- SSH config、Agent/默认密钥、指定密钥、临时密码认证
- 随机 token、远端 loopback-only 监听、SSH 本地转发
- 远程根目录围栏与 `read-only` 写拒绝
- `read` / `write` / `edit` / directory listing / binary read 的 `ctx.fs` 透明路由
- 前台与后台 `ctx.shell` 路由；远端命令由 `/bin/bash -lc` 执行
- Trae 风格 `SSH 连接目标` 资源页：主机节点、远程目录选择器、最近工作区子节点
- 直接把所选远程目录登记并打开为当前 DSH workspace，无需手工输入路径
- better-sidebar 原生 `Remote Explorer` 页：目录浏览、文件读取/保存、命令与 git 操作
- 同一 DSH 实例混合本地与远程会话

## 当前边界

- 交互 PTY/终端重连仍是下一阶段；当前 Remote Explorer 提供一次性命令，Agent shell 支持前台/后台执行。
- 远端 Host 当前面向 POSIX/Linux（使用 `/bin/bash`）。
- Remote Explorer 使用插件自己的远程 API；better-sidebar 内置 Explorer 仍面向本地 marker 目录。
- 远端连接在本地 DSH Host 重启后需重新连接；连接配置会持久化，密码不会落盘。

## 开发验证

```powershell
npm run typecheck
npm test
npm run build
$env:npm_config_cache = "$PWD\.npm-cache"
npm run pack:check
```
