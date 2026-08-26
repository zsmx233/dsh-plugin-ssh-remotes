#!/usr/bin/env node
'use strict'

const { spawn } = require('child_process')
const { createServer } = require('http')
const { promises: fs } = require('fs')
const { dirname, isAbsolute, join, relative, resolve, sep } = require('path')

const pairs = []
for (let i = 2; i < process.argv.length; i += 1) {
  const value = process.argv[i]
  if (value.indexOf('--') === 0) pairs.push([value.slice(2), process.argv[i + 1]])
}
const argv = Object.fromEntries(pairs)
let root = ''
const token = argv.token || ''
const port = Number(argv.port || 0)
const MAX_BODY = 16 * 1024 * 1024
const MAX_OUTPUT = 4 * 1024 * 1024
const locks = new Map()

function codedError(message, code) {
  const value = new Error(message)
  value.code = code || 'FS_IO_ERROR'
  return value
}
function inside(path) {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && rel.indexOf(`..${sep}`) !== 0 && !isAbsolute(rel))
}
function pathOf(value, cwd) {
  const candidate = resolve(cwd || root, String(value || '.'))
  if (!inside(candidate)) throw codedError(`path escapes remote workspace: ${candidate}`, 'FS_SANDBOX_DENIED')
  return candidate
}
function version(value) {
  const nanos = value.mtimeNs !== undefined ? value.mtimeNs : BigInt(Math.round(Number(value.mtimeMs) * 1e6))
  return `${value.dev}:${value.ino}:${value.size}:${nanos}`
}
function info(value, noFollow) {
  return {
    version: version(value),
    type: noFollow && value.isSymbolicLink() ? 'symlink' : value.isFile() ? 'file' : value.isDirectory() ? 'directory' : 'other',
    size: value.isFile() ? Number(value.size) : undefined,
  }
}
async function maybeStat(path, noFollow) {
  try {
    return info(await (noFollow ? fs.lstat(path, { bigint: true }) : fs.stat(path, { bigint: true })), noFollow)
  } catch (failure) {
    if (failure && failure.code === 'ENOENT') return undefined
    throw failure
  }
}
async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw codedError('request too large', 'FS_TOO_LARGE')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}
function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}
async function atomicWrite(path, content) {
  await fs.mkdir(dirname(path), { recursive: true })
  const temp = join(dirname(path), `.${process.pid}-${Date.now()}.dsh-tmp`)
  await fs.writeFile(temp, content, 'utf8')
  await fs.rename(temp, path)
}
async function locked(key, work) {
  const prior = locks.get(key) || Promise.resolve()
  const run = prior.then(work, work)
  const tail = run.catch(function () {})
  locks.set(key, tail)
  try { return await run } finally { if (locks.get(key) === tail) locks.delete(key) }
}
async function execCommand(args, req) {
  const cwd = pathOf(args.cwd || root)
  const timeoutMs = Math.max(1, Math.min(Number(args.timeoutMs || 60000), 30 * 60 * 1000))
  const command = String(args.command || '')
  return new Promise(function (resolveResult) {
    const child = spawn('/bin/bash', ['-lc', command], { cwd, env: Object.assign({}, process.env, args.env || {}), detached: true })
    let stdout = ''
    let stderr = ''
    let truncatedOut = false
    let truncatedErr = false
    let timedOut = false
    function append(current, chunk, marked) {
      const next = current + chunk.toString()
      if (Buffer.byteLength(next) <= MAX_OUTPUT) return [next, marked]
      return [next.slice(-MAX_OUTPUT), true]
    }
    child.stdout.on('data', function (chunk) { const next = append(stdout, chunk, truncatedOut); stdout = next[0]; truncatedOut = next[1] })
    child.stderr.on('data', function (chunk) { const next = append(stderr, chunk, truncatedErr); stderr = next[0]; truncatedErr = next[1] })
    function kill() { try { process.kill(-child.pid, 'SIGTERM') } catch (_) {} }
    const timer = setTimeout(function () { timedOut = true; kill() }, timeoutMs)
    req.once('close', kill)
    child.once('close', function (exitCode, signal) {
      clearTimeout(timer)
      req.removeListener('close', kill)
      resolveResult({ exitCode, signal, timedOut, aborted: false, timeoutMs, stdout: { text: stdout, truncated: truncatedOut }, stderr: { text: stderr, truncated: truncatedErr }, sandbox: { mode: 'workspace-write', denied: false, enforcement: 'remote-root' } })
    })
    child.once('error', function (failure) {
      clearTimeout(timer)
      resolveResult({ exitCode: null, signal: null, timedOut: false, aborted: false, timeoutMs, stdout: { text: '', truncated: false }, stderr: { text: failure.message, truncated: false } })
    })
  })
}
async function rpc(op, args, req) {
  if (op === 'resolve') {
    const base = args.cwd ? pathOf(args.cwd) : root
    const candidate = pathOf(args.path, base)
    let canonical = candidate
    try { canonical = await fs.realpath(candidate) } catch (failure) {
      if (!failure || failure.code !== 'ENOENT') throw failure
      const parent = await fs.realpath(dirname(candidate))
      canonical = join(parent, candidate.slice(dirname(candidate).length + 1))
    }
    if (!inside(canonical)) throw codedError('resolved path escapes remote workspace', 'FS_SANDBOX_DENIED')
    return { targetKey: canonical, displayPath: canonical }
  }
  if (op === 'stat') return maybeStat(pathOf(args.targetKey), false)
  if (op === 'lstat') return maybeStat(pathOf(args.path, args.cwd ? pathOf(args.cwd) : root), true)
  if (op === 'readText') return fs.readFile(pathOf(args.targetKey), 'utf8')
  if (op === 'readBytes') {
    const data = await fs.readFile(pathOf(args.targetKey))
    if (data.length > Number(args.maxBytes)) throw codedError('file exceeds byte limit', 'FS_TOO_LARGE')
    return data.toString('base64')
  }
  if (op === 'listDir') {
    const base = pathOf(args.targetKey)
    const rows = await fs.readdir(base, { withFileTypes: true })
    rows.sort(function (a, b) { return a.name.localeCompare(b.name) })
    return Promise.all(rows.map(async function (entry) {
      const path = join(base, entry.name)
      const link = await fs.lstat(path, { bigint: true })
      let value = link
      let broken = false
      if (link.isSymbolicLink()) {
        try { value = await fs.stat(path, { bigint: true }) } catch (failure) {
          if (!failure || failure.code !== 'ENOENT') throw failure
          broken = true
        }
      }
      return {
        name: entry.name,
        type: broken ? 'other' : value.isFile() ? 'file' : value.isDirectory() ? 'directory' : 'other',
        target: { targetKey: path, displayPath: path },
        version: version(link),
        size: !broken && value.isFile() ? Number(value.size) : undefined,
        isSymlink: link.isSymbolicLink(),
        broken,
      }
    }))
  }
  if (op === 'writeText') return locked(String(args.targetKey), async function () {
    const path = pathOf(args.targetKey)
    const existing = await maybeStat(path, false)
    if (args.policy && args.policy.mode === 'read-only') throw codedError('remote workspace is read-only', 'FS_SANDBOX_DENIED')
    if (args.expected && args.expected.kind === 'createIfAbsent' && existing) throw codedError('file exists and was not observed', 'FS_NOT_OBSERVED')
    if (args.expected && args.expected.kind === 'replaceIfVersion' && (!existing || existing.version !== args.expected.version)) throw codedError('file changed since it was read', 'FS_STALE_VERSION')
    const before = existing && existing.type === 'file' ? await fs.readFile(path, 'utf8').catch(function () { return null }) : null
    await atomicWrite(path, String(args.content))
    const afterInfo = await maybeStat(path, false)
    return { operation: existing ? 'update' : 'create', version: afterInfo.version, before, after: String(args.content).replace(/\r\n/g, '\n') }
  })
  if (op === 'editText') return locked(String(args.targetKey), async function () {
    const path = pathOf(args.targetKey)
    if (args.policy && args.policy.mode === 'read-only') throw codedError('remote workspace is read-only', 'FS_SANDBOX_DENIED')
    const existing = await maybeStat(path, false)
    if (!existing || (args.expected && existing.version !== args.expected.version)) throw codedError('file changed since it was read', 'FS_STALE_VERSION')
    const before = (await fs.readFile(path, 'utf8')).replace(/\r\n/g, '\n')
    const oldString = String(args.edit.oldString)
    const count = before.split(oldString).length - 1
    if (count === 0) throw codedError('edit text not found', 'FS_EDIT_NOT_FOUND')
    if (!args.edit.replaceAll && count !== 1) throw codedError('edit text is ambiguous', 'FS_AMBIGUOUS_EDIT')
    const after = args.edit.replaceAll ? before.split(oldString).join(String(args.edit.newString)) : before.replace(oldString, String(args.edit.newString))
    await atomicWrite(path, after)
    return { version: (await maybeStat(path, false)).version, before, after }
  })
  if (op === 'exec') return execCommand(args, req)
  throw codedError(`unknown operation: ${op}`, 'REMOTE_UNKNOWN_OPERATION')
}

async function main() {
  if (!token || !Number.isInteger(port) || port < 1) throw new Error('remote-host requires --root, --port and --token')
  root = await fs.realpath(argv.root || process.cwd())
  const server = createServer(async function (req, res) {
    try {
      if (req.headers.authorization !== `Bearer ${token}`) return send(res, 401, { ok: false, error: { message: 'unauthorized' } })
      if (req.url === '/health') return send(res, 200, { ok: true, root, pid: process.pid })
      if (req.method !== 'POST' || req.url !== '/rpc') return send(res, 404, { ok: false, error: { message: 'not found' } })
      const body = await readBody(req)
      send(res, 200, { ok: true, value: await rpc(body.op, body.args || {}, req) })
    } catch (failure) {
      send(res, 400, { ok: false, error: { message: failure && failure.message ? failure.message : String(failure), code: failure && failure.code ? failure.code : 'REMOTE_ERROR' } })
    }
  })
  server.listen(port, '127.0.0.1', function () { process.stdout.write(`DSH_REMOTE_READY=${port}\n`) })
  ;['SIGINT', 'SIGTERM'].forEach(function (signal) { process.on(signal, function () { server.close(function () { process.exit(0) }) }) })
}

main().catch(function (failure) {
  process.stderr.write(`${failure && failure.stack ? failure.stack : String(failure)}\n`)
  process.exitCode = 1
})
