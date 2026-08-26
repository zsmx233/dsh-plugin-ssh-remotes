import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeConnection, shellQuote, sshConnectionArgs } from '../lib/index.js'

test('shellQuote protects a POSIX argument', () => {
  assert.equal(shellQuote("/tmp/a'b"), "'/tmp/a'\\''b'")
})

test('normalizeConnection requires an absolute remote path', () => {
  assert.throws(() => normalizeConnection({ name: 'x', host: 'h', remotePath: 'relative' }), /absolute POSIX path/)
})

test('normalizeConnection never persists a password field', () => {
  const connection = normalizeConnection({
    name: 'dev', host: 'example.test', user: 'alice', authType: 'password', remotePath: '/srv/app', password: 'secret',
  })
  assert.equal(connection.authType, 'password')
  assert.equal(Object.hasOwn(connection, 'password'), false)
  assert.deepEqual(connection.recentPaths, [])
})

test('normalizeConnection keeps valid recent remote workspaces only', () => {
  const existing = normalizeConnection({ name: 'dev', host: 'example.test', remotePath: '/srv/current' })
  existing.recentPaths = ['/srv/one', 'relative', '/srv/two']
  const updated = normalizeConnection({}, existing)
  assert.deepEqual(updated.recentPaths, ['/srv/one', '/srv/two'])
})

test('ssh args keep config aliases under ssh config control', () => {
  const connection = normalizeConnection({
    name: 'config', host: 'prod-alias', port: 2200, user: 'ignored', authType: 'config', remotePath: '/srv/app',
  })
  const args = sshConnectionArgs(connection)
  assert.equal(args.at(-1), 'prod-alias')
  assert.equal(args.includes('-p'), false)
})

test('ssh args use key and non-interactive authentication', () => {
  const connection = normalizeConnection({
    name: 'key', host: 'example.test', port: 2222, user: 'alice', authType: 'key', keyPath: '/keys/id', remotePath: '/srv/app',
  })
  const args = sshConnectionArgs(connection)
  assert.deepEqual(args.slice(-5), ['-p', '2222', '-i', '/keys/id', 'alice@example.test'])
  assert.equal(args.includes('BatchMode=yes'), true)
})
