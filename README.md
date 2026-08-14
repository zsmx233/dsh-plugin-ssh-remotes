# dsh-ssh-remotes

SSH Remote Workspaces plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH).

Add **remote workspaces** to the Harness sidebar: connect to a remote host over SSH, test the
connection, browse remote directories, run remote commands, and read/write remote files —
with agent, explicit-key, ssh-config, or **username + password** authentication.

## Features

- Sidebar entry **「SSH Remote」** (`sidebar.footer.action`) opens a management panel (`shell.overlay`)
- Connection profiles persisted in the DSH storage backend (`$DSH_HOME/storages/sshremotes.json`)
- Four auth modes:
  - `agent / default key` — ssh-agent or `~/.ssh` default keys
  - `explicit key file` — a private key path
  - `username + password` — **two-step login**: step 1 `user@host[:port]`, step 2 the password;
    password is cached in memory only, never saved, and the temp password file is wiped after use
    (implemented with OpenSSH `SSH_ASKPASS` + `SSH_ASKPASS_REQUIRE=force`, the same mechanism
    VS Code Remote-SSH uses on Windows)
  - `~/.ssh/config alias` — host field holds a config alias
- Per-connection actions: Test / Login-Logout / Browse (remote `ls`) / Run command / Remove
- Password connections require a one-time login; subsequent operations reuse the in-memory credential

## File layout

```
dsh-ssh-remotes/
├── package.json          # Cordis package metadata (host half, ESM)
├── lib/index.js          # Host half as a standard Cordis plugin (export default { name, inject, apply })
├── code.host.js          # Host half as a dynamic-plugin function body (paste into cordis_define)
├── code.client.js        # Client half as a dynamic-plugin function body (paste into cordis_define)
└── README.md
```

## Installation

### Option A — dynamic load (no build required, recommended)

In any DSH session with the Web UI:

1. Create a new Cordis dynamic plugin (`cordis_define`).
2. Paste the full content of `code.host.js` into `code.host`, and `code.client.js` into `code.client`.
3. Run the package (`cordis_run`) and approve the client activation.
4. The **「SSH Remote」** button appears at the sidebar foot.

### Option B — standard host install

The host half is a plain Cordis plugin:

```bash
dsh plugin --profile web add <path-or-git-url-of-dsh-ssh-remotes>
```

then add it to the profile composition (`cordis.patch.yml`) with any required services present.
Note: the browser UI half is delivered via the dynamic path above; a prebuilt `./client` web
bundle is not shipped because it must be produced by the DSH client build chain.

## Requirements

- Windows with the OpenSSH client (`C:\Windows\System32\OpenSSH\ssh.exe` or `ssh` on PATH)
  — also works on Linux/macOS where `ssh` is present
- Password auth needs `SSH_ASKPASS_REQUIRE=force` support (OpenSSH >= 8.4; the bundled
  Windows OpenSSH 9.x qualifies)

## Security notes

- Passwords live in the harness process memory only and are cleared on logout / connection
  removal / plugin stop.
- The temporary password file (random name, harness-private directory) is emptied right after use.
- SSH runs non-interactively: `BatchMode=yes` (key auth), `ConnectTimeout=10`,
  `StrictHostKeyChecking=accept-new`, `RequestTTY=no`.

## RPC surface (package-private, Client → Host)

`status`, `list`, `add`, `remove`, `auth`, `logout`, `test`, `ls`, `read`, `write`, `exec`

## License

MIT
