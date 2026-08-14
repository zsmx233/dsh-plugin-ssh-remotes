// ============================================================================
// dsh-ssh-remotes — Client half (dynamic-plugin function body)
// ============================================================================
// Usage: in a DeepSeek Harness session, create a Cordis dynamic plugin with
// cordis_define and paste the FULL content of this file into `code.client`.
// This file IS the function body: it starts with `return {` and ends with `}`.
// Requires the Host half (code.host.js) to provide the `ssh-remotes.*` RPCs.
// ============================================================================
return {
  apply(ctx) {
    // ---- tiny shared open-state store ----
    const store = {
      open: false,
      listeners: new Set(),
      get() { return this.open },
      set(value) {
        this.open = !!value
        this.listeners.forEach((fn) => fn())
      },
      subscribe(fn) {
        this.listeners.add(fn)
        return () => this.listeners.delete(fn)
      },
    }

    function useOpen() {
      const [state, setState] = React.useState(store.get())
      React.useEffect(() => store.subscribe(() => setState(store.get())), [])
      return state
    }

    const slots = ctx.get('slots')
    if (slots === undefined) return

    styles.insert(`
.sshrm-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
  pointer-events: auto;
}
.sshrm-panel {
  background: var(--dsw-alias-bg-overlay, #1e1e24);
  border: 1px solid var(--dsw-alias-border-l1, #3a3a44);
  border-radius: 10px;
  color: var(--dsw-alias-label-primary, #e8e8ee);
  width: 680px; max-width: 92vw; max-height: 86vh;
  display: flex; flex-direction: column;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5);
}
.sshrm-head {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #3a3a44);
  font-weight: 600;
}
.sshrm-head .spacer { flex: 1; }
.sshrm-body {
  overflow: auto; padding: 14px 16px;
  display: flex; flex-direction: column; gap: 12px;
}
.sshrm-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1, #3a3a44);
  border-radius: 8px;
}
.sshrm-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sshrm-name { font-weight: 600; font-size: 13px; }
.sshrm-desc { font-size: 12px; color: var(--dsw-alias-label-secondary, #9a9aa8); }
.sshrm-field { display: flex; flex-direction: column; gap: 4px; }
.sshrm-label { font-size: 11px; color: var(--dsw-alias-label-secondary, #9a9aa8); }
.sshrm-input, .sshrm-select {
  background: var(--dsw-alias-bg-layer-1, #16161c);
  color: var(--dsw-alias-label-primary, #e8e8ee);
  border: 1px solid var(--dsw-alias-border-l1, #3a3a44);
  border-radius: 6px; padding: 6px 8px; font-size: 13px;
  box-sizing: border-box; width: 100%;
}
.sshrm-btn {
  background: var(--dsw-alias-bg-layer-2, #26262e);
  color: var(--dsw-alias-label-primary, #e8e8ee);
  border: 1px solid var(--dsw-alias-border-l2, #4a4a56);
  border-radius: 6px; padding: 5px 10px; font-size: 12px;
  cursor: pointer; white-space: nowrap;
}
.sshrm-btn:hover { border-color: var(--dsw-alias-brand-primary, #4f8cff); }
.sshrm-btn:disabled { opacity: 0.5; cursor: default; }
.sshrm-btn-primary {
  background: var(--dsw-alias-brand-primary, #4f8cff);
  border-color: transparent; color: #fff;
}
.sshrm-btn-danger:hover { border-color: var(--dsw-alias-state-error-primary, #e06c6c); }
.sshrm-ok { color: var(--dsw-alias-state-success-primary, #4caf7d); }
.sshrm-err { color: var(--dsw-alias-state-error-primary, #e06c6c); }
.sshrm-muted { color: var(--dsw-alias-label-secondary, #9a9aa8); font-size: 12px; }
.sshrm-pre {
  background: var(--dsw-alias-bg-base, #101014);
  border: 1px solid var(--dsw-alias-border-l1, #3a3a44);
  border-radius: 6px; padding: 8px;
  font-family: Consolas, 'Courier New', monospace; font-size: 12px;
  white-space: pre-wrap; word-break: break-all;
  max-height: 260px; overflow: auto; margin: 0;
}
.sshrm-form { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.sshrm-form .full { grid-column: 1 / -1; }
.sshrm-section { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--dsw-alias-label-secondary, #9a9aa8); margin-top: 4px; }
.sshrm-foot {
  background: transparent; border: none;
  color: var(--dsw-alias-label-secondary, #9a9aa8);
  font-size: 12px; cursor: pointer; padding: 6px 10px;
}
.sshrm-foot:hover { color: var(--dsw-alias-label-primary, #e8e8ee); }
.sshrm-authbox {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1, #3a3a44);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #16161c);
}
.sshrm-step {
  display: flex; flex-direction: column; gap: 8px;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l1, #3a3a44);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #16161c);
}
.sshrm-step-row { display: flex; align-items: center; gap: 8px; }
`)

    const FooterAction = (props) => React.createElement('button', {
      className: 'sshrm-foot',
      onClick: () => store.set(!store.get()),
      title: 'SSH Remote Workspaces',
    }, props.wide ? 'SSH Remote' : 'SSH')

    const ManagerPanel = () => {
      const open = useOpen()
      const [status, setStatus] = React.useState(null)
      const [connections, setConnections] = React.useState([])
      const [error, setError] = React.useState('')
      const [form, setForm] = React.useState({
        name: '', host: '', port: '22', user: '',
        authType: 'agent', keyPath: '', remotePath: '/',
      })
      const [busyId, setBusyId] = React.useState('')
      const [results, setResults] = React.useState({})
      const [confirmId, setConfirmId] = React.useState('')
      const [authed, setAuthed] = React.useState({})
      const [authConnId, setAuthConnId] = React.useState('')
      const [authPassword, setAuthPassword] = React.useState('')
      const [authBusy, setAuthBusy] = React.useState(false)
      const [authError, setAuthError] = React.useState('')
      // password two-step form state
      const [uh, setUh] = React.useState('')
      const [pwInput, setPwInput] = React.useState('')
      const [pwStep, setPwStep] = React.useState(1)
      const [browseId, setBrowseId] = React.useState('')
      const [browsePath, setBrowsePath] = React.useState('')
      const [browseOut, setBrowseOut] = React.useState('')
      const [browseErr, setBrowseErr] = React.useState('')
      const [browseBusy, setBrowseBusy] = React.useState(false)
      const [cmd, setCmd] = React.useState('')
      const [cmdOut, setCmdOut] = React.useState('')
      const [cmdErr, setCmdErr] = React.useState('')
      const [cmdBusy, setCmdBusy] = React.useState(false)

      React.useEffect(() => {
        if (!open) return
        let cancelled = false
        async function load() {
          try {
            const st = await host.call('ssh-remotes.status')
            if (!cancelled) setStatus(st)
          } catch (err) {
            if (!cancelled) setError('status failed: ' + String(err && err.message || err))
          }
          try {
            const res = await host.call('ssh-remotes.list')
            if (!cancelled) setConnections(res.connections || [])
          } catch (err) {
            if (!cancelled) setError('list failed: ' + String(err && err.message || err))
          }
          try {
            const st = await host.call('ssh-remotes.status')
            if (!cancelled && st && st.authed) {
              const map = {}
              st.authed.forEach((id) => { map[id] = true })
              setAuthed(map)
            }
          } catch (err) {}
        }
        load()
        return () => { cancelled = true }
      }, [open])

      if (!open) return null

      const refresh = async () => {
        try {
          const res = await host.call('ssh-remotes.list')
          setConnections(res.connections || [])
        } catch (err) {
          setError('list failed: ' + String(err && err.message || err))
        }
      }

      const setField = (key) => (ev) => {
        const next = {}
        Object.keys(form).forEach((k) => { next[k] = form[k] })
        next[key] = ev.target.value
        setForm(next)
      }

      // ---- password two-step flow ----
      const parseUh = (value) => {
        let v = String(value || '').trim()
        if (!v) return null
        let port = 22
        const m = v.match(/:([0-9]+)$/)
        if (m) {
          port = Number(m[1])
          v = v.slice(0, -m[0].length)
        }
        const at = v.lastIndexOf('@')
        if (at <= 0 || at === v.length - 1) return null
        const user = v.slice(0, at)
        const host = v.slice(at + 1)
        if (!user || !host) return null
        return { user, host, port }
      }

      const submitPasswordConn = async () => {
        setError('')
        if (pwStep === 1) {
          if (!parseUh(uh)) {
            setError('Step 1: enter username@host, e.g. root@192.168.1.10 (port optional: root@host:2222)')
            return
          }
          setPwStep(2)
          return
        }
        const parsed = parseUh(uh)
        if (!parsed) {
          setPwStep(1)
          return
        }
        if (!pwInput) {
          setError('Step 2: enter the password')
          return
        }
        setBusyId('add')
        try {
          const res = await host.call('ssh-remotes.add', {
            name: parsed.user + '@' + parsed.host,
            host: parsed.host,
            port: String(parsed.port),
            user: parsed.user,
            authType: 'password',
            keyPath: '',
            remotePath: '/',
          })
          if (!res.ok) {
            setError('add failed: ' + String(res.error || 'unknown'))
            setBusyId('')
            return
          }
          const conn = res.connection
          const authRes = await host.call('ssh-remotes.auth', { id: conn.id, password: pwInput })
          if (authRes.ok) {
            const next = {}
            Object.keys(authed).forEach((k) => { next[k] = authed[k] })
            next[conn.id] = true
            setAuthed(next)
            setUh('')
            setPwInput('')
            setPwStep(1)
            await refresh()
          } else {
            setError('login failed: ' + String(authRes.error || 'unknown error') + ' (connection saved; you can retry Login)')
            await refresh()
          }
        } catch (err) {
          setError('add failed: ' + String(err && err.message || err))
        }
        setBusyId('')
      }

      const submitAdd = async () => {
        setError('')
        setBusyId('add')
        try {
          const res = await host.call('ssh-remotes.add', {
            name: form.name, host: form.host, port: form.port,
            user: form.user, authType: form.authType,
            keyPath: form.keyPath, remotePath: form.remotePath,
          })
          if (!res.ok) {
            setError('add failed: ' + String(res.error || 'unknown'))
          } else {
            setForm({ name: '', host: '', port: '22', user: '', authType: 'agent', keyPath: '', remotePath: '/' })
            await refresh()
          }
        } catch (err) {
          setError('add failed: ' + String(err && err.message || err))
        }
        setBusyId('')
      }

      const runTest = async (id) => {
        setBusyId(id)
        try {
          const res = await host.call('ssh-remotes.test', { id })
          const text = res.ok
            ? 'OK - connected (' + (res.elapsedMs || 0) + ' ms)' + (res.stdout ? ': ' + res.stdout.trim() : '')
            : 'FAILED: ' + String(res.error || 'unknown error')
          const next = {}
          Object.keys(results).forEach((k) => { next[k] = results[k] })
          next[id] = { ok: res.ok, text }
          setResults(next)
        } catch (err) {
          const next = {}
          Object.keys(results).forEach((k) => { next[k] = results[k] })
          next[id] = { ok: false, text: String(err && err.message || err) }
          setResults(next)
        }
        setBusyId('')
      }

      const startAuth = (id) => {
        setAuthConnId(id)
        setAuthPassword('')
        setAuthError('')
      }

      const doAuth = async () => {
        if (!authConnId || !authPassword) return
        setAuthBusy(true)
        setAuthError('')
        try {
          const res = await host.call('ssh-remotes.auth', { id: authConnId, password: authPassword })
          if (res.ok) {
            const next = {}
            Object.keys(authed).forEach((k) => { next[k] = authed[k] })
            next[authConnId] = true
            setAuthed(next)
            setAuthConnId('')
            setAuthPassword('')
          } else {
            setAuthError(String(res.error || 'login failed'))
          }
        } catch (err) {
          setAuthError(String(err && err.message || err))
        }
        setAuthBusy(false)
      }

      const doLogout = async (id) => {
        try {
          await host.call('ssh-remotes.logout', { id })
        } catch (err) {}
        const next = {}
        Object.keys(authed).forEach((k) => { next[k] = authed[k] })
        delete next[id]
        setAuthed(next)
      }

      const removeConn = async (id) => {
        setBusyId(id)
        try {
          await host.call('ssh-remotes.remove', { id })
          setConfirmId('')
          const next = {}
          Object.keys(authed).forEach((k) => { next[k] = authed[k] })
          delete next[id]
          setAuthed(next)
          if (browseId === id) {
            setBrowseId('')
            setBrowseOut('')
          }
          await refresh()
        } catch (err) {
          setError('remove failed: ' + String(err && err.message || err))
        }
        setBusyId('')
      }

      const openBrowse = (conn) => {
        setBrowseId(conn.id)
        setBrowsePath(conn.remotePath || '/')
        setBrowseOut('')
        setBrowseErr('')
        setCmd('')
        setCmdOut('')
        setCmdErr('')
      }

      const runLs = async () => {
        if (!browseId || !browsePath) return
        setBrowseBusy(true)
        setBrowseErr('')
        setBrowseOut('')
        try {
          const res = await host.call('ssh-remotes.ls', { id: browseId, path: browsePath })
          if (res.ok) setBrowseOut(res.stdout)
          else setBrowseErr('ls failed: ' + String(res.error || 'unknown'))
        } catch (err) {
          setBrowseErr('ls failed: ' + String(err && err.message || err))
        }
        setBrowseBusy(false)
      }

      const runCmd = async () => {
        if (!browseId || !cmd.trim()) return
        setCmdBusy(true)
        setCmdErr('')
        setCmdOut('')
        try {
          const res = await host.call('ssh-remotes.exec', { id: browseId, command: cmd })
          if (res.ok) setCmdOut(res.stdout)
          else setCmdErr('command failed (' + res.exitCode + '): ' + String(res.error || 'unknown'))
        } catch (err) {
          setCmdErr('command failed: ' + String(err && err.message || err))
        }
        setCmdBusy(false)
      }

      const browsing = connections.find((c) => c.id === browseId) || null

      // password two-step add form
      const passwordForm = React.createElement('div', { className: 'sshrm-form' },
        React.createElement('div', { className: 'sshrm-field full' },
          React.createElement('span', { className: 'sshrm-label' }, 'Step 1 of 2 — Username@Host'),
          React.createElement('input', {
            className: 'sshrm-input',
            value: uh,
            onChange: (ev) => { setUh(ev.target.value); setError('') },
            onKeyDown: (ev) => { if (ev.key === 'Enter') submitPasswordConn() },
            placeholder: 'root@192.168.1.10 (port optional: root@host:2222)',
            disabled: pwStep === 2,
          }),
        ),
        pwStep === 2
          ? React.createElement('div', { className: 'sshrm-field full' },
              React.createElement('span', { className: 'sshrm-label' }, 'Step 2 of 2 — Password for ' + uh.trim()),
              React.createElement('input', {
                className: 'sshrm-input',
                type: 'password',
                autoComplete: 'off',
                value: pwInput,
                onChange: (ev) => { setPwInput(ev.target.value); setError('') },
                onKeyDown: (ev) => { if (ev.key === 'Enter') submitPasswordConn() },
                placeholder: 'enter password',
              }),
            )
          : null,
        React.createElement('div', { className: 'sshrm-field full' },
          React.createElement('div', { className: 'sshrm-step-row' },
            pwStep === 2
              ? React.createElement('button', {
                  className: 'sshrm-btn',
                  disabled: busyId !== '',
                  onClick: () => { setPwStep(1); setError('') },
                }, 'Back')
              : null,
            React.createElement('button', {
              className: 'sshrm-btn sshrm-btn-primary',
              disabled: busyId !== '',
              onClick: () => submitPasswordConn(),
            }, busyId === 'add'
              ? 'Adding...'
              : (pwStep === 1 ? 'Next' : (busyId === 'auth' ? 'Logging in...' : 'Add & Login'))),
          ),
        ),
        React.createElement('div', { className: 'sshrm-field full' },
          React.createElement('span', { className: 'sshrm-muted' }, 'The password is used once to authenticate and kept in memory only; it is never saved.'),
        ),
      )

      return React.createElement('div', { className: 'sshrm-backdrop', onClick: () => store.set(false) },
        React.createElement('div', { className: 'sshrm-panel', onClick: (ev) => ev.stopPropagation() },
          React.createElement('div', { className: 'sshrm-head' },
            React.createElement('span', null, 'SSH Remote Workspaces'),
            React.createElement('span', { className: 'sshrm-muted' },
              status ? ((status.sshOk ? 'ssh OK' : 'ssh missing') + (status.persistent ? ' / saved' : ' / memory-only')) : 'loading...'),
            React.createElement('span', { className: 'spacer' }),
            React.createElement('button', { className: 'sshrm-btn', onClick: () => store.set(false) }, 'Close'),
          ),
          React.createElement('div', { className: 'sshrm-body' },
            error ? React.createElement('div', { className: 'sshrm-err' }, error) : null,
            React.createElement('div', { className: 'sshrm-section' }, 'Remote workspaces'),
            connections.length === 0
              ? React.createElement('div', { className: 'sshrm-muted' }, 'No remote workspaces yet. Add one below.')
              : connections.map((conn) =>
                  React.createElement('div', { key: conn.id },
                    React.createElement('div', { className: 'sshrm-row' },
                      React.createElement('div', { className: 'sshrm-meta' },
                        React.createElement('div', { className: 'sshrm-name' },
                          conn.name,
                          authed[conn.id] ? React.createElement('span', { className: 'sshrm-ok' }, '  ● authenticated') : null,
                        ),
                        React.createElement('div', { className: 'sshrm-desc' },
                          conn.authType === 'config'
                            ? ('config alias: ' + conn.host)
                            : ((conn.user ? conn.user + '@' : '') + conn.host + ':' + conn.port + '  ' + conn.remotePath),
                        ),
                        React.createElement('div', { className: 'sshrm-desc' },
                          'auth: ' + conn.authType + (conn.authType === 'key' ? ' (' + conn.keyPath + ')' : conn.authType === 'password' ? ' (password, memory only)' : ''),
                        ),
                        results[conn.id]
                          ? React.createElement('div', { className: results[conn.id].ok ? 'sshrm-ok' : 'sshrm-err' }, results[conn.id].text)
                          : null,
                      ),
                      conn.authType === 'password'
                        ? (authed[conn.id]
                            ? React.createElement('button', { className: 'sshrm-btn', disabled: busyId !== '', onClick: () => doLogout(conn.id) }, 'Logout')
                            : React.createElement('button', {
                                className: 'sshrm-btn sshrm-btn-primary',
                                disabled: busyId !== '',
                                onClick: () => startAuth(conn.id),
                              }, 'Login'))
                        : React.createElement('button', {
                            className: 'sshrm-btn',
                            disabled: busyId !== '',
                            onClick: () => runTest(conn.id),
                          }, busyId === conn.id ? '...' : 'Test'),
                      React.createElement('button', {
                        className: 'sshrm-btn',
                        disabled: busyId !== '' || (conn.authType === 'password' && !authed[conn.id]),
                        onClick: () => openBrowse(conn),
                      }, 'Browse'),
                      confirmId === conn.id
                        ? React.createElement('button', {
                            className: 'sshrm-btn sshrm-btn-danger',
                            disabled: busyId !== '',
                            onClick: () => removeConn(conn.id),
                          }, 'Confirm')
                        : React.createElement('button', {
                            className: 'sshrm-btn sshrm-btn-danger',
                            disabled: busyId !== '',
                            onClick: () => setConfirmId(conn.id),
                          }, 'Remove'),
                    ),
                    authConnId === conn.id
                      ? React.createElement('div', { className: 'sshrm-authbox' },
                          React.createElement('input', {
                            className: 'sshrm-input',
                            type: 'password',
                            autoComplete: 'off',
                            placeholder: conn.user + '@' + conn.host + ' password',
                            value: authPassword,
                            onChange: (ev) => setAuthPassword(ev.target.value),
                            onKeyDown: (ev) => { if (ev.key === 'Enter') doAuth() },
                            style: { flex: 1 },
                          }),
                          React.createElement('button', {
                            className: 'sshrm-btn sshrm-btn-primary',
                            disabled: authBusy || !authPassword,
                            onClick: () => doAuth(),
                          }, authBusy ? 'Logging in...' : 'Login'),
                          React.createElement('button', {
                            className: 'sshrm-btn',
                            disabled: authBusy,
                            onClick: () => setAuthConnId(''),
                          }, 'Cancel'),
                        )
                      : null,
                    authConnId === conn.id && authError
                      ? React.createElement('div', { className: 'sshrm-err' }, authError)
                      : null,
                  ),
                ),
            React.createElement('div', { className: 'sshrm-section' }, 'Add remote workspace'),
            form.authType === 'password'
              ? passwordForm
              : React.createElement('div', { className: 'sshrm-form' },
                  React.createElement('div', { className: 'sshrm-field' },
                    React.createElement('span', { className: 'sshrm-label' }, 'Name *'),
                    React.createElement('input', { className: 'sshrm-input', value: form.name, onChange: setField('name'), placeholder: 'e.g. dev-server' }),
                  ),
                  React.createElement('div', { className: 'sshrm-field' },
                    React.createElement('span', { className: 'sshrm-label' }, 'Host *'),
                    React.createElement('input', { className: 'sshrm-input', value: form.host, onChange: setField('host'), placeholder: 'host or ssh-config alias' }),
                  ),
                  React.createElement('div', { className: 'sshrm-field' },
                    React.createElement('span', { className: 'sshrm-label' }, 'Port'),
                    React.createElement('input', { className: 'sshrm-input', value: form.port, onChange: setField('port'), placeholder: '22' }),
                  ),
                  React.createElement('div', { className: 'sshrm-field' },
                    React.createElement('span', { className: 'sshrm-label' }, 'User'),
                    React.createElement('input', { className: 'sshrm-input', value: form.user, onChange: setField('user'), placeholder: 'optional' }),
                  ),
                  React.createElement('div', { className: 'sshrm-field' },
                    React.createElement('span', { className: 'sshrm-label' }, 'Auth'),
                    React.createElement('select', { className: 'sshrm-select', value: form.authType, onChange: setField('authType') },
                      React.createElement('option', { value: 'agent' }, 'agent / default key'),
                      React.createElement('option', { value: 'key' }, 'explicit key file'),
                      React.createElement('option', { value: 'password' }, 'username + password'),
                      React.createElement('option', { value: 'config' }, '~/.ssh/config alias'),
                    ),
                  ),
                  form.authType === 'key'
                    ? React.createElement('div', { className: 'sshrm-field full' },
                        React.createElement('span', { className: 'sshrm-label' }, 'Private key path *'),
                        React.createElement('input', { className: 'sshrm-input', value: form.keyPath, onChange: setField('keyPath'), placeholder: 'C:\\Users\\you\\.ssh\\id_ed25519' }),
                      )
                    : null,
                  React.createElement('div', { className: 'sshrm-field' },
                    React.createElement('span', { className: 'sshrm-label' }, 'Remote path'),
                    React.createElement('input', { className: 'sshrm-input', value: form.remotePath, onChange: setField('remotePath'), placeholder: '/' }),
                  ),
                  React.createElement('div', { className: 'sshrm-field full' },
                    React.createElement('button', {
                      className: 'sshrm-btn sshrm-btn-primary',
                      disabled: busyId !== '',
                      onClick: () => submitAdd(),
                    }, busyId === 'add' ? 'Adding...' : 'Add workspace'),
                  ),
                ),
            browsing ? React.createElement('div', null,
              React.createElement('div', { className: 'sshrm-section' }, 'Browse ' + browsing.name),
              React.createElement('div', { className: 'sshrm-form' },
                React.createElement('div', { className: 'sshrm-field' },
                  React.createElement('span', { className: 'sshrm-label' }, 'Remote path'),
                  React.createElement('input', { className: 'sshrm-input', value: browsePath, onChange: (ev) => setBrowsePath(ev.target.value) }),
                ),
                React.createElement('div', { className: 'sshrm-field' },
                  React.createElement('span', { className: 'sshrm-label' }, '&nbsp;'),
                  React.createElement('button', {
                    className: 'sshrm-btn',
                    disabled: browseBusy || !browsePath,
                    onClick: () => runLs(),
                  }, browseBusy ? 'Listing...' : 'List files'),
                ),
              ),
              browseErr ? React.createElement('div', { className: 'sshrm-err' }, browseErr) : null,
              browseOut ? React.createElement('pre', { className: 'sshrm-pre' }, browseOut) : null,
              React.createElement('div', { className: 'sshrm-form' },
                React.createElement('div', { className: 'sshrm-field' },
                  React.createElement('span', { className: 'sshrm-label' }, 'Run remote command'),
                  React.createElement('input', {
                    className: 'sshrm-input', value: cmd,
                    onChange: (ev) => setCmd(ev.target.value),
                    onKeyDown: (ev) => { if (ev.key === 'Enter') runCmd() },
                    placeholder: 'e.g. uname -a',
                  }),
                ),
                React.createElement('div', { className: 'sshrm-field' },
                  React.createElement('span', { className: 'sshrm-label' }, '&nbsp;'),
                  React.createElement('button', {
                    className: 'sshrm-btn',
                    disabled: cmdBusy || !cmd.trim(),
                    onClick: () => runCmd(),
                  }, cmdBusy ? 'Running...' : 'Run'),
                ),
              ),
              cmdErr ? React.createElement('div', { className: 'sshrm-err' }, cmdErr) : null,
              cmdOut ? React.createElement('pre', { className: 'sshrm-pre' }, cmdOut) : null,
            ) : null,
          ),
        ),
      )
    }

    slots.inject('sidebar.footer.action', () => slots.register(
      { name: 'sidebar.footer.action', id: 'ssh-remotes.open', order: -10, label: 'SSH Remote' },
      (props) => React.createElement(FooterAction, { wide: props.wide }),
    ))
    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'ssh-remotes.panel', order: 10, label: 'SSH Remote Workspaces' },
      () => React.createElement(ManagerPanel),
    ))
  },
}
