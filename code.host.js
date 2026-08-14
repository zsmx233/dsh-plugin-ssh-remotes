// ============================================================================
// dsh-ssh-remotes — Host half (dynamic-plugin function body)
// ============================================================================
// Usage: in a DeepSeek Harness session, create a Cordis dynamic plugin with
// cordis_define and paste the FULL content of this file into `code.host`.
// This file IS the function body: it starts with `return {` and ends with `}`.
// ============================================================================
return {
  async apply(ctx) {
    const subprocess = ctx.get('subprocess')
    const fs = ctx.get('fs')
    const storage = ctx.get('storage')
    const sandboxPolicy = ctx.get('sandboxPolicy')

    // ---- durable store via the 'json' storage backend; memory fallback ----
    let unit = null
    try {
      const backend = storage ? storage.backend.get('json') : undefined
      if (backend && backend.kv) {
        unit = await backend.kv.open({
          name: 'sshremotes',
          version: 1,
          tables: ['connections'],
          hasGlobal: false,
        })
      }
    } catch (err) {
      console.error('ssh-remotes: storage unavailable, memory-only mode', String(err && err.message || err))
      unit = null
    }
    const memory = new Map()
    ctx.effect(() => () => {
      if (unit) unit.close().catch(() => {})
    })

    // ---- locate the OpenSSH client ----
    let sshPath = null
    if (subprocess) {
      try {
        sshPath = await subprocess.resolveExecutable('ssh')
      } catch (err) {
        sshPath = null
      }
      if (!sshPath) {
        for (const candidate of ['C:\\Windows\\System32\\OpenSSH\\ssh.exe']) {
          try {
            sshPath = await subprocess.resolveExecutable(candidate)
            break
          } catch (err) {
            sshPath = null
          }
        }
      }
    }

    let baseDir = 'C:\\Windows'
    if (fs) {
      try {
        baseDir = fs.processPath(await fs.resolve('.'))
      } catch (err) {
        /* keep fallback */
      }
    }

    // ---- password auth state (memory only) ----
    const passwords = new Map() // connId -> password
    const policy = sandboxPolicy ? sandboxPolicy.resolve({ mode: 'danger-full-access' }) : null
    const writeFile = async (path, content) => {
      const target = await fs.resolve(path)
      await fs.writeText(target, content, undefined, undefined, policy)
    }
    const passFileOf = (conn) => baseDir + '\\dsh-ssh-pw-' + conn.id + '.txt'
    const askFileOf = (conn) => baseDir + '\\dsh-ssh-ap-' + conn.id + '.cmd'
    const ensureAskpass = async (conn) => {
      if (!policy) throw new Error('sandboxPolicy unavailable; password auth not supported')
      const passFile = passFileOf(conn)
      const askFile = askFileOf(conn)
      await writeFile(passFile, passwords.get(conn.id) || '')
      await writeFile(askFile, '@echo off\r\n@type "' + passFile + '"\r\n')
      return askFile
    }
    const wipePasswordFile = async (conn) => {
      try {
        await writeFile(passFileOf(conn), '')
      } catch (err) {}
    }

    // ---- connection store helpers ----
    async function loadConnections() {
      if (unit) {
        const snap = await unit.loadAll()
        const table = snap.tables.connections || {}
        return Object.keys(table).map((key) => table[key])
      }
      return Array.from(memory.values())
    }
    async function getConnection(id) {
      if (unit) {
        const snap = await unit.loadAll()
        const table = snap.tables.connections || {}
        return table[id] || null
      }
      return memory.get(id) || null
    }
    async function putConnection(conn) {
      memory.set(conn.id, conn)
      if (unit) await unit.putRecord('connections', conn.id, conn)
    }
    async function dropConnection(id) {
      memory.delete(id)
      passwords.delete(id)
      if (unit) await unit.deleteRecord('connections', id)
    }

    // ---- ssh helpers ----
    function shq(value) {
      return "'" + String(value).replace(/'/g, "'\\''") + "'"
    }
    function baseSshArgs(conn, askFile) {
      const args = [sshPath]
      if (!askFile) {
        args.push('-o', 'BatchMode=yes')
      }
      args.push('-o', 'ConnectTimeout=10')
      args.push('-o', 'StrictHostKeyChecking=accept-new')
      args.push('-o', 'RequestTTY=no')
      const port = Number(conn.port || 22)
      if (port !== 22) args.push('-p', String(port))
      if (conn.authType === 'key' && conn.keyPath) args.push('-i', String(conn.keyPath))
      const target = conn.authType === 'config' ? conn.host
        : (conn.user ? conn.user + '@' + conn.host : conn.host)
      args.push(target)
      return args
    }
    async function runRemote(conn, command, input, askFile) {
      if (!sshPath) return { ok: false, error: 'OpenSSH client (ssh) not found on this host' }
      const argv = baseSshArgs(conn, askFile)
      if (command) argv.push(command)
      let handle
      try {
        handle = subprocess.spawn({
          argv,
          cwd: baseDir,
          stdio: {
            stdin: input !== undefined ? { data: input } : 'ignore',
            stdout: { maxBytes: 2 * 1024 * 1024, spill: { maxBytes: 16 * 1024 * 1024 } },
            stderr: { maxBytes: 1024 * 1024, spill: { maxBytes: 8 * 1024 * 1024 } },
          },
          graceMs: 5000,
          env: askFile ? { SSH_ASKPASS: askFile, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: '1' } : undefined,
        })
      } catch (err) {
        return { ok: false, error: String(err && err.message || err) }
      }
      const started = Date.now()
      let outcome
      try {
        outcome = await handle.done
      } catch (err) {
        return { ok: false, error: 'spawn failed: ' + String(err && err.message || err) }
      }
      const read = (reader) => (reader ? reader.readFrom(0).text : '')
      const stdout = read(handle.collected.stdout)
      const stderr = read(handle.collected.stderr)
      const result = {
        ok: outcome.exitCode === 0,
        exitCode: outcome.exitCode,
        stdout,
        stderr,
        elapsedMs: Date.now() - started,
      }
      if (outcome.exitCode !== 0) {
        result.error = (stderr || stdout || ('ssh exited with code ' + outcome.exitCode)).trim()
      }
      return result
    }
    // for password connections: return the askpass file if authenticated, else null
    async function authFor(conn) {
      if (conn.authType !== 'password') return { askFile: undefined }
      if (!passwords.has(conn.id)) return null
      try {
        const askFile = await ensureAskpass(conn)
        return { askFile }
      } catch (err) {
        return { error: String(err && err.message || err) }
      }
    }

    // ---- Package-private RPC for the Client UI ----
    harness.handle('ssh-remotes.status', async () => ({
      sshOk: !!sshPath,
      sshPath: sshPath || '',
      persistent: !!unit,
      authed: Array.from(passwords.keys()),
    }))
    harness.handle('ssh-remotes.list', async () => ({ connections: await loadConnections() }))
    harness.handle('ssh-remotes.add', async (args) => {
      const input = args || {}
      const name = String(input.name || '').trim()
      const host = String(input.host || '').trim()
      const user = String(input.user || '').trim()
      const port = Number(input.port || 22)
      const authType = input.authType === 'key' || input.authType === 'password' || input.authType === 'config' ? input.authType : 'agent'
      const keyPath = String(input.keyPath || '').trim()
      const remotePath = String(input.remotePath || '/').trim() || '/'
      if (!name) return { ok: false, error: 'name is required' }
      if (!host) return { ok: false, error: 'host is required' }
      if (authType === 'key' && !keyPath) return { ok: false, error: 'keyPath is required for key auth' }
      if (authType === 'password' && !user) return { ok: false, error: 'user is required for password auth' }
      const id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      const conn = { id, name, host, port, user, authType, keyPath, remotePath }
      await putConnection(conn)
      return { ok: true, connection: conn }
    })
    harness.handle('ssh-remotes.remove', async (args) => {
      await dropConnection(String((args && args.id) || ''))
      return { ok: true }
    })
    harness.handle('ssh-remotes.auth', async (args) => {
      const conn = await getConnection(String((args && args.id) || ''))
      if (!conn) return { ok: false, error: 'unknown connection id' }
      if (conn.authType !== 'password') return { ok: false, error: 'connection is not password-auth' }
      const password = String((args && args.password) || '')
      if (!password) return { ok: false, error: 'password is required' }
      passwords.set(conn.id, password)
      let askFile
      try {
        askFile = await ensureAskpass(conn)
      } catch (err) {
        passwords.delete(conn.id)
        return { ok: false, error: String(err && err.message || err) }
      }
      const res = await runRemote(conn, 'echo DSH_AUTH_OK', undefined, askFile)
      if (!res.ok) {
        passwords.delete(conn.id)
        wipePasswordFile(conn)
        return res
      }
      return { ok: true, stdout: res.stdout }
    })
    harness.handle('ssh-remotes.logout', async (args) => {
      const conn = await getConnection(String((args && args.id) || ''))
      passwords.delete(String((args && args.id) || ''))
      if (conn) wipePasswordFile(conn)
      return { ok: true }
    })
    harness.handle('ssh-remotes.test', async (args) => {
      const conn = await getConnection(String((args && args.id) || ''))
      if (!conn) return { ok: false, error: 'unknown connection id' }
      const auth = await authFor(conn)
      if (auth === null) return { ok: false, error: 'not authenticated; enter the password first' }
      if (auth.error) return { ok: false, error: auth.error }
      return runRemote(conn, 'echo DSH_SSH_OK', undefined, auth.askFile)
    })
    harness.handle('ssh-remotes.ls', async (args) => {
      const conn = await getConnection(String((args && args.id) || ''))
      if (!conn) return { ok: false, error: 'unknown connection id' }
      const auth = await authFor(conn)
      if (auth === null) return { ok: false, error: 'not authenticated; enter the password first' }
      if (auth.error) return { ok: false, error: auth.error }
      const path = String((args && args.path) || conn.remotePath || '/')
      return runRemote(conn, 'ls -la --time-style=long-iso ' + shq(path), undefined, auth.askFile)
    })
    harness.handle('ssh-remotes.read', async (args) => {
      const conn = await getConnection(String((args && args.id) || ''))
      if (!conn) return { ok: false, error: 'unknown connection id' }
      const auth = await authFor(conn)
      if (auth === null) return { ok: false, error: 'not authenticated; enter the password first' }
      if (auth.error) return { ok: false, error: auth.error }
      const path = String((args && args.path) || '')
      if (!path) return { ok: false, error: 'path is required' }
      return runRemote(conn, 'cat ' + shq(path), undefined, auth.askFile)
    })
    harness.handle('ssh-remotes.write', async (args) => {
      const conn = await getConnection(String((args && args.id) || ''))
      if (!conn) return { ok: false, error: 'unknown connection id' }
      const auth = await authFor(conn)
      if (auth === null) return { ok: false, error: 'not authenticated; enter the password first' }
      if (auth.error) return { ok: false, error: auth.error }
      const path = String((args && args.path) || '')
      if (!path) return { ok: false, error: 'path is required' }
      const idx = path.lastIndexOf('/')
      const parent = idx > 0 ? path.slice(0, idx) : '.'
      return runRemote(conn, 'mkdir -p ' + shq(parent) + ' && cat > ' + shq(path),
        String(args && args.content === undefined ? '' : args.content), auth.askFile)
    })
    harness.handle('ssh-remotes.exec', async (args) => {
      const conn = await getConnection(String((args && args.id) || ''))
      if (!conn) return { ok: false, error: 'unknown connection id' }
      const auth = await authFor(conn)
      if (auth === null) return { ok: false, error: 'not authenticated; enter the password first' }
      if (auth.error) return { ok: false, error: auth.error }
      const command = String((args && args.command) || '').trim()
      if (!command) return { ok: false, error: 'command is required' }
      return runRemote(conn, command, undefined, auth.askFile)
    })
  },
}
