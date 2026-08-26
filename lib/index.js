import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, posix, relative, sep } from "node:path";
//#region src/protocol.ts
const API_PREFIX = "/api/dsh-remote-ssh";
const API = {
	status: `${API_PREFIX}/status`,
	connections: `${API_PREFIX}/connections`,
	test: `${API_PREFIX}/test`,
	bootstrap: `${API_PREFIX}/bootstrap`,
	connect: `${API_PREFIX}/connect`,
	disconnect: `${API_PREFIX}/disconnect`,
	workspace: `${API_PREFIX}/workspace`,
	select: `${API_PREFIX}/select`
};
//#endregion
//#region src/http.ts
const MAX_BODY_BYTES = 8388608;
async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.length;
		if (size > MAX_BODY_BYTES) {
			req.destroy();
			return null;
		}
		chunks.push(buffer);
	}
	if (chunks.length === 0) return {};
	try {
		const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null;
	} catch {
		return null;
	}
}
function writeJson(res, status, body, headers = {}) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"referrer-policy": "no-referrer",
		...headers
	});
	res.end(JSON.stringify(body));
}
//#endregion
//#region src/loopback.ts
function isIPv4Loopback(value) {
	const parts = value.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
function isLoopbackAddress(value) {
	if (value === void 0) return false;
	const normalized = value.toLowerCase();
	if (normalized === "::1") return true;
	if (normalized.startsWith("::ffff:")) return isIPv4Loopback(normalized.slice(7));
	return isIPv4Loopback(normalized);
}
function isLoopbackHostname(value) {
	return value === "localhost" || value === "[::1]" || isIPv4Loopback(value);
}
function isLoopbackRequest(req) {
	if (!isLoopbackAddress(req.socket.remoteAddress)) return false;
	const host = req.headers.host;
	if (typeof host !== "string") return false;
	let hostUrl;
	try {
		hostUrl = new URL(`http://${host}`);
	} catch {
		return false;
	}
	if (!isLoopbackHostname(hostUrl.hostname)) return false;
	if (req.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = req.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
//#endregion
//#region src/routes.ts
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
function requestId(req) {
	return new URL(req.url ?? "/", "http://localhost").searchParams.get("id")?.trim() ?? "";
}
function guard(req, res, methods) {
	if (!isLoopbackRequest(req)) {
		writeJson(res, 403, { error: "forbidden: loopback-only" });
		return false;
	}
	if (!methods.includes(req.method ?? "GET")) {
		writeJson(res, 405, { error: `method not allowed: ${req.method}` });
		return false;
	}
	return true;
}
function makeRoutes(store, manager) {
	return [
		{
			kind: "exact",
			path: API.status,
			handler: async (req, res) => {
				if (!guard(req, res, ["GET"])) return;
				writeJson(res, 200, {
					sshAvailable: manager.sshPath !== "",
					sshPath: manager.sshPath,
					scpAvailable: manager.scpPath !== "",
					scpPath: manager.scpPath,
					sessions: manager.listSessions(),
					packageVersion: manager.packageVersion,
					executionModel: "local-control-remote-execution"
				});
			}
		},
		{
			kind: "exact",
			path: API.connections,
			handler: async (req, res) => {
				if (!guard(req, res, [
					"GET",
					"POST",
					"DELETE"
				])) return;
				if (req.method === "GET") {
					writeJson(res, 200, { connections: store.list() });
					return;
				}
				if (req.method === "DELETE") {
					const id = requestId(req);
					if (id === "") {
						writeJson(res, 400, { error: "id is required" });
						return;
					}
					await manager.disconnect(id);
					writeJson(res, 200, { removed: await store.remove(id) });
					return;
				}
				const body = await readJsonBody(req);
				if (body === null) {
					writeJson(res, 400, { error: "invalid JSON body" });
					return;
				}
				try {
					writeJson(res, 201, { connection: await store.create(body) });
				} catch (error) {
					writeJson(res, 400, { error: errorMessage(error) });
				}
			}
		},
		{
			kind: "exact",
			path: API.test,
			handler: async (req, res) => {
				if (!guard(req, res, ["POST"])) return;
				const body = await readJsonBody(req);
				const id = typeof body?.id === "string" ? body.id : "";
				const password = typeof body?.password === "string" ? body.password : "";
				if (id === "") {
					writeJson(res, 400, { error: "id is required" });
					return;
				}
				try {
					const result = await manager.test(id, password);
					writeJson(res, result.ok ? 200 : 502, { result });
				} catch (error) {
					writeJson(res, 400, { error: errorMessage(error) });
				}
			}
		},
		{
			kind: "exact",
			path: API.bootstrap,
			handler: async (req, res) => {
				if (!guard(req, res, ["POST"])) return;
				const body = await readJsonBody(req);
				const id = typeof body?.id === "string" ? body.id : "";
				const password = typeof body?.password === "string" ? body.password : "";
				const installUi = body?.installUi !== false;
				if (id === "") {
					writeJson(res, 400, { error: "id is required" });
					return;
				}
				try {
					const result = await manager.bootstrap(id, {
						password,
						installUi
					});
					writeJson(res, result.ok ? 200 : 502, { result });
				} catch (error) {
					writeJson(res, 400, { error: errorMessage(error) });
				}
			}
		},
		{
			kind: "exact",
			path: API.connect,
			handler: async (req, res) => {
				if (!guard(req, res, ["POST"])) return;
				const body = await readJsonBody(req);
				const id = typeof body?.id === "string" ? body.id : "";
				const password = typeof body?.password === "string" ? body.password : "";
				const remotePath = typeof body?.remotePath === "string" ? body.remotePath : void 0;
				if (id === "") {
					writeJson(res, 400, { error: "id is required" });
					return;
				}
				try {
					writeJson(res, 200, { session: await manager.connect(id, {
						password,
						remotePath
					}) });
				} catch (error) {
					writeJson(res, 502, { error: errorMessage(error) });
				}
			}
		},
		{
			kind: "exact",
			path: API.select,
			handler: async (req, res) => {
				if (!guard(req, res, ["POST"])) return;
				const body = await readJsonBody(req);
				const id = typeof body?.id === "string" ? body.id : "";
				const remotePath = typeof body?.remotePath === "string" ? body.remotePath : "";
				const password = typeof body?.password === "string" ? body.password : "";
				if (id === "" || !remotePath.startsWith("/")) {
					writeJson(res, 400, { error: "id and absolute remotePath are required" });
					return;
				}
				try {
					writeJson(res, 200, { session: await manager.selectWorkspace(id, remotePath, password) });
				} catch (error) {
					writeJson(res, 502, { error: errorMessage(error) });
				}
			}
		},
		{
			kind: "exact",
			path: API.disconnect,
			handler: async (req, res) => {
				if (!guard(req, res, ["POST"])) return;
				const body = await readJsonBody(req);
				const id = typeof body?.id === "string" ? body.id : "";
				if (id === "") {
					writeJson(res, 400, { error: "id is required" });
					return;
				}
				writeJson(res, 200, { disconnected: await manager.disconnect(id) });
			}
		},
		{
			kind: "exact",
			path: API.workspace,
			handler: async (req, res) => {
				if (!guard(req, res, ["POST"])) return;
				const body = await readJsonBody(req);
				const connectionId = typeof body?.connectionId === "string" ? body.connectionId : "";
				const op = typeof body?.op === "string" ? body.op : "";
				const args = typeof body?.args === "object" && body.args !== null && !Array.isArray(body.args) ? body.args : {};
				if (connectionId === "" || !(/* @__PURE__ */ new Set([
					"listDir",
					"readText",
					"writeText",
					"exec",
					"stat"
				])).has(op)) {
					writeJson(res, 400, { error: "invalid workspace RPC request" });
					return;
				}
				try {
					writeJson(res, 200, { value: await manager.rpc(connectionId, op, args) });
				} catch (error) {
					writeJson(res, 502, { error: errorMessage(error) });
				}
			}
		}
	];
}
//#endregion
//#region src/ssh-manager.ts
const COMMAND_TIMEOUT_MS = 3e4;
const BOOT_TIMEOUT_MS = 45e3;
const LOG_LIMIT = 49152;
function shellQuote(value) {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}
function appendTail(current, chunk) {
	const combined = current + chunk.toString();
	return combined.length > LOG_LIMIT ? combined.slice(-49152) : combined;
}
async function executableOrFallback(candidates) {
	for (const candidate of candidates) {
		if (!candidate.includes("\\") && !candidate.includes("/")) return candidate;
		try {
			await access(candidate);
			return candidate;
		} catch {}
	}
	return candidates.at(-1) ?? "";
}
async function freePort() {
	return await new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address === null || typeof address === "string") return reject(/* @__PURE__ */ new Error("failed to allocate port"));
			const port = address.port;
			server.close((error) => error ? reject(error) : resolve(port));
		});
	});
}
async function makeAskpass(password) {
	if (password === "") throw new Error("password is required");
	const directory = await mkdtemp(join(tmpdir(), "dsh-remote-ssh-"));
	const passwordFile = join(directory, "password.txt");
	const windows = process.platform === "win32";
	const script = join(directory, windows ? "askpass.cmd" : "askpass.sh");
	await writeFile(passwordFile, password, {
		encoding: "utf8",
		mode: 384
	});
	await writeFile(script, windows ? `@echo off\r\n@type "${passwordFile}"\r\n` : `#!/bin/sh\ncat ${shellQuote(passwordFile)}\n`, {
		encoding: "utf8",
		mode: 448
	});
	if (!windows) await chmod(script, 448);
	return {
		env: {
			...process.env,
			SSH_ASKPASS: script,
			SSH_ASKPASS_REQUIRE: "force",
			DISPLAY: process.env.DISPLAY || ":0"
		},
		dispose: () => rm(directory, {
			recursive: true,
			force: true
		})
	};
}
function targetOf(c) {
	return c.authType === "config" || c.user === "" ? c.host : `${c.user}@${c.host}`;
}
function sshConnectionArgs(c, password = false) {
	const args = [
		"-o",
		"ConnectTimeout=12",
		"-o",
		"ServerAliveInterval=15",
		"-o",
		"ServerAliveCountMax=3",
		"-o",
		"StrictHostKeyChecking=accept-new",
		"-o",
		"RequestTTY=no"
	];
	if (!password) args.push("-o", "BatchMode=yes");
	if (c.authType !== "config" && c.port !== 22) args.push("-p", String(c.port));
	if (c.authType === "key") args.push("-i", c.keyPath);
	args.push(targetOf(c));
	return args;
}
function scpConnectionArgs(c, password = false) {
	const args = [
		"-o",
		"ConnectTimeout=12",
		"-o",
		"StrictHostKeyChecking=accept-new"
	];
	if (!password) args.push("-o", "BatchMode=yes");
	if (c.authType !== "config" && c.port !== 22) args.push("-P", String(c.port));
	if (c.authType === "key") args.push("-i", c.keyPath);
	return args;
}
function runProcess(executable, args, options = {}) {
	return new Promise((resolve) => {
		const started = Date.now();
		let stdout = "";
		let stderr = "";
		let settled = false;
		const child = spawn(executable, args, {
			env: options.env ?? process.env,
			windowsHide: true
		});
		const finish = (value) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(value);
		};
		child.stdout.on("data", (c) => {
			stdout = appendTail(stdout, c);
		});
		child.stderr.on("data", (c) => {
			stderr = appendTail(stderr, c);
		});
		child.once("error", (error) => finish({
			ok: false,
			exitCode: null,
			stdout,
			stderr,
			error: error.message,
			elapsedMs: Date.now() - started
		}));
		child.once("close", (exitCode) => finish({
			ok: exitCode === 0,
			exitCode,
			stdout,
			stderr,
			error: exitCode === 0 ? void 0 : (stderr || stdout || `process exited with ${exitCode}`).trim(),
			elapsedMs: Date.now() - started
		}));
		const timer = setTimeout(() => {
			child.kill("SIGTERM");
			finish({
				ok: false,
				exitCode: null,
				stdout,
				stderr,
				error: `operation timed out after ${options.timeoutMs ?? COMMAND_TIMEOUT_MS} ms`,
				elapsedMs: Date.now() - started
			});
		}, options.timeoutMs ?? COMMAND_TIMEOUT_MS);
	});
}
var RemoteSshManager = class RemoteSshManager {
	store;
	packageRoot;
	packageVersion = "0.4.0";
	sshPath;
	scpPath;
	sessions = /* @__PURE__ */ new Map();
	constructor(store, packageRoot, sshPath, scpPath) {
		this.store = store;
		this.packageRoot = packageRoot;
		this.sshPath = sshPath;
		this.scpPath = scpPath;
	}
	static async create(store, packageRoot) {
		const windows = process.platform === "win32";
		return new RemoteSshManager(store, packageRoot, await executableOrFallback(windows ? ["C:\\Windows\\System32\\OpenSSH\\ssh.exe", "ssh"] : ["/usr/bin/ssh", "ssh"]), await executableOrFallback(windows ? ["C:\\Windows\\System32\\OpenSSH\\scp.exe", "scp"] : ["/usr/bin/scp", "scp"]));
	}
	listSessions() {
		return [...this.sessions.values()].map((s) => this.view(s));
	}
	sessionForMarker(cwd) {
		const s = [...this.sessions.values()].find((v) => v.state === "ready" && (cwd === v.markerPath || cwd.startsWith(`${v.markerPath}\\`) || cwd.startsWith(`${v.markerPath}/`)));
		return s ? {
			connection: s.connection,
			markerPath: s.markerPath,
			remotePath: s.remotePath
		} : void 0;
	}
	async rpc(connectionId, op, args, signal) {
		const s = this.sessions.get(connectionId);
		if (!s || s.state !== "ready") throw new Error(`Remote-SSH connection is not ready: ${connectionId}`);
		const response = await fetch(`http://127.0.0.1:${s.localPort}/rpc`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${s.token}`,
				"content-type": "application/json"
			},
			body: JSON.stringify({
				op,
				args
			}),
			signal
		});
		const body = await response.json();
		if (!response.ok || body.ok !== true) {
			const error = new Error(body.error?.message ?? `remote RPC failed: HTTP ${response.status}`);
			error.code = body.error?.code;
			throw error;
		}
		return body.value;
	}
	async test(connectionId, password = "") {
		const c = this.store.get(connectionId);
		return this.execRemote(c, `set -eu; cd -- ${shellQuote(c.remotePath)}; printf "DSH_REMOTE_PATH=%s\\n" "$(pwd -P)"; ${shellQuote(c.runtimeCommand)} --version`, password);
	}
	async bootstrap(connectionId, options = {}) {
		const c = this.store.get(connectionId);
		const probe = await this.test(connectionId, options.password ?? "");
		return probe.ok ? this.deploy(c, options.password ?? "") : probe;
	}
	async connect(connectionId, options = {}) {
		const c = this.store.get(connectionId);
		const requestedPath = options.remotePath?.trim() || c.remotePath;
		const old = this.sessions.get(connectionId);
		if (old && (old.state === "starting" || old.state === "ready")) {
			if (old.remotePath === requestedPath) return this.view(old);
			await this.disconnect(connectionId);
		}
		const password = options.password ?? "";
		const test = await this.probePath(c, requestedPath, password);
		if (!test.ok) throw new Error(test.error || "remote probe failed");
		const remotePath = test.stdout?.match(/^DSH_REMOTE_PATH=(.+)$/m)?.[1]?.trim();
		if (!remotePath) throw new Error("remote path probe returned no canonical path");
		const deployed = await this.deploy(c, password);
		if (!deployed.ok) throw new Error(deployed.error || "remote host deployment failed");
		const [localPort, remotePort] = await Promise.all([freePort(), freePort()]);
		const markerPath = join(process.env.DSH_HOME || join(homedir(), ".dsh"), "remote-workspaces", c.id);
		await mkdir(markerPath, { recursive: true });
		await writeFile(join(markerPath, ".dsh-remote.json"), JSON.stringify({
			authority: c.name,
			remotePath
		}, null, 2) + "\n", "utf8");
		const token = randomBytes(32).toString("hex");
		const askpass = c.authType === "password" ? await makeAskpass(password) : void 0;
		const args = sshConnectionArgs(c, askpass !== void 0);
		args.splice(args.length - 1, 0, "-o", "ExitOnForwardFailure=yes", "-L", `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`);
		args.push(`exec ${shellQuote(c.runtimeCommand)} ~/.cache/dsh-remote-ssh/remote-host.cjs --root ${shellQuote(remotePath)} --port ${remotePort} --token ${shellQuote(token)}`);
		const processHandle = spawn(this.sshPath, args, {
			env: askpass?.env ?? process.env,
			windowsHide: true
		});
		const s = {
			connection: c,
			process: processHandle,
			localPort,
			remotePort,
			remotePath,
			markerPath,
			token,
			state: "starting",
			startedAt: (/* @__PURE__ */ new Date()).toISOString(),
			logTail: "",
			askpass
		};
		this.sessions.set(connectionId, s);
		processHandle.stdout.on("data", (c) => {
			s.logTail = appendTail(s.logTail, c);
		});
		processHandle.stderr.on("data", (c) => {
			s.logTail = appendTail(s.logTail, c);
		});
		processHandle.once("error", (e) => {
			s.state = "failed";
			s.error = e.message;
		});
		processHandle.once("close", (code) => {
			if (s.state === "ready") s.state = "stopped";
			else if (s.state === "starting") {
				s.state = "failed";
				s.error = `remote host exited during startup (${code})`;
			}
		});
		try {
			await this.waitUntilReady(s);
			s.state = "ready";
			await askpass?.dispose();
			s.askpass = void 0;
			return this.view(s);
		} catch (e) {
			s.state = "failed";
			s.error = e instanceof Error ? e.message : String(e);
			processHandle.kill("SIGTERM");
			await askpass?.dispose();
			throw new Error(`${s.error}\n${s.logTail.slice(-4e3)}`);
		}
	}
	async selectWorkspace(connectionId, remotePath, password = "") {
		await this.disconnect(connectionId);
		const connection = await this.store.rememberPath(connectionId, remotePath);
		return this.connect(connectionId, {
			password,
			remotePath: connection.remotePath
		});
	}
	async disconnect(id) {
		const s = this.sessions.get(id);
		if (!s) return false;
		this.sessions.delete(id);
		await s.askpass?.dispose();
		if (s.process.exitCode === null) s.process.kill("SIGTERM");
		s.state = "stopped";
		return true;
	}
	async dispose() {
		await Promise.all([...this.sessions.keys()].map((id) => this.disconnect(id)));
	}
	async deploy(c, password) {
		const prep = await this.execRemote(c, "set -eu; mkdir -p ~/.cache/dsh-remote-ssh", password);
		if (!prep.ok) return prep;
		const askpass = c.authType === "password" ? await makeAskpass(password) : void 0;
		try {
			return await runProcess(this.scpPath, [
				...scpConnectionArgs(c, !!askpass),
				join(this.packageRoot, "remote-host.cjs"),
				`${targetOf(c)}:.cache/dsh-remote-ssh/remote-host.cjs`
			], {
				env: askpass?.env,
				timeoutMs: 12e4
			});
		} finally {
			await askpass?.dispose();
		}
	}
	async execRemote(c, command, password, timeoutMs = COMMAND_TIMEOUT_MS) {
		const askpass = c.authType === "password" ? await makeAskpass(password) : void 0;
		try {
			return await runProcess(this.sshPath, [...sshConnectionArgs(c, !!askpass), command], {
				env: askpass?.env,
				timeoutMs
			});
		} finally {
			await askpass?.dispose();
		}
	}
	async probePath(c, remotePath, password) {
		return this.execRemote(c, `set -eu; cd -- ${shellQuote(remotePath)}; printf "DSH_REMOTE_PATH=%s\\n" "$(pwd -P)"; ${shellQuote(c.runtimeCommand)} --version`, password);
	}
	async waitUntilReady(s) {
		const deadline = Date.now() + BOOT_TIMEOUT_MS;
		let last = "";
		while (Date.now() < deadline) {
			try {
				const r = await fetch(`http://127.0.0.1:${s.localPort}/health`, { headers: { authorization: `Bearer ${s.token}` } });
				if (r.ok) return;
				last = `HTTP ${r.status}`;
			} catch (e) {
				last = e instanceof Error ? e.message : String(e);
			}
			await new Promise((r) => setTimeout(r, 250));
		}
		throw new Error(`remote execution host did not become ready: ${last}`);
	}
	view(s) {
		return {
			connectionId: s.connection.id,
			authority: s.connection.name,
			remotePath: s.remotePath,
			markerPath: s.markerPath,
			localPort: s.localPort,
			remotePort: s.remotePort,
			state: s.state,
			startedAt: s.startedAt,
			...s.error ? { error: s.error } : {},
			...s.logTail ? { logTail: s.logTail } : {}
		};
	}
};
//#endregion
//#region src/store.ts
function stringValue(value) {
	return typeof value === "string" ? value.trim() : "";
}
function normalizeAuth(value) {
	return value === "key" || value === "password" || value === "config" ? value : "agent";
}
function normalizePort(value) {
	const port = Number(value ?? 22);
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("port must be between 1 and 65535");
	return port;
}
function normalizeConnection(input, existing) {
	const name = stringValue(input.name ?? existing?.name);
	const host = stringValue(input.host ?? existing?.host);
	const user = stringValue(input.user ?? existing?.user);
	const authType = normalizeAuth(input.authType ?? existing?.authType);
	const keyPath = stringValue(input.keyPath ?? existing?.keyPath);
	const remotePath = stringValue(input.remotePath ?? existing?.remotePath) || "/";
	const runtimeCommand = stringValue(input.runtimeCommand ?? existing?.runtimeCommand) || "node";
	if (name === "") throw new Error("name is required");
	if (host === "") throw new Error("host is required");
	if (!remotePath.startsWith("/")) throw new Error("remotePath must be an absolute POSIX path");
	if (authType === "key" && keyPath === "") throw new Error("keyPath is required for key authentication");
	if (authType === "password" && user === "") throw new Error("user is required for password authentication");
	if (!/^[A-Za-z0-9_./~:+-]+$/.test(runtimeCommand)) throw new Error("runtimeCommand must be one Node.js executable path without shell operators");
	const now = (/* @__PURE__ */ new Date()).toISOString();
	return {
		id: existing?.id ?? randomUUID(),
		name,
		host,
		port: normalizePort(input.port ?? existing?.port),
		user,
		authType,
		keyPath,
		remotePath,
		recentPaths: existing?.recentPaths?.filter((path) => typeof path === "string" && path.startsWith("/")).slice(0, 12) ?? [],
		runtimeCommand,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now
	};
}
var ConnectionStore = class {
	file;
	connections = /* @__PURE__ */ new Map();
	loaded = false;
	writeQueue = Promise.resolve();
	constructor(file = join(process.env.DSH_HOME || join(homedir(), ".dsh"), "dsh-remote-ssh.json")) {
		this.file = file;
	}
	async load() {
		if (this.loaded) return;
		this.loaded = true;
		try {
			const parsed = JSON.parse(await readFile(this.file, "utf8"));
			for (const item of Array.isArray(parsed.connections) ? parsed.connections : []) try {
				const normalized = normalizeConnection(item, item);
				this.connections.set(normalized.id, normalized);
			} catch {}
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
	list() {
		return [...this.connections.values()].sort((a, b) => a.name.localeCompare(b.name));
	}
	get(id) {
		const connection = this.connections.get(id);
		if (connection === void 0) throw new Error(`unknown connection: ${id}`);
		return connection;
	}
	async create(input) {
		const connection = normalizeConnection(input);
		this.connections.set(connection.id, connection);
		await this.persist();
		return connection;
	}
	async remove(id) {
		const removed = this.connections.delete(id);
		if (removed) await this.persist();
		return removed;
	}
	async rememberPath(id, remotePath) {
		if (!remotePath.startsWith("/")) throw new Error("remotePath must be an absolute POSIX path");
		const existing = this.get(id);
		const updated = {
			...existing,
			remotePath,
			recentPaths: [remotePath, ...existing.recentPaths.filter((path) => path !== remotePath)].slice(0, 12),
			updatedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		this.connections.set(id, updated);
		await this.persist();
		return updated;
	}
	async persist() {
		const document = {
			version: 1,
			connections: this.list()
		};
		this.writeQueue = this.writeQueue.then(async () => {
			await mkdir(dirname(this.file), { recursive: true });
			await writeFile(this.file, `${JSON.stringify(document, null, 2)}\n`, {
				encoding: "utf8",
				mode: 384
			});
		});
		return this.writeQueue;
	}
};
//#endregion
//#region src/execution-bridge.ts
const PREFIX = "dsh-ssh:";
function remoteKey(connectionId, path) {
	return `${PREFIX}${connectionId}:${Buffer.from(path).toString("base64url")}`;
}
function parseKey(value) {
	const text = String(value);
	if (!text.startsWith(PREFIX)) return;
	const split = text.indexOf(":", 8);
	if (split < 0) return;
	return {
		connectionId: text.slice(8, split),
		path: Buffer.from(text.slice(split + 1), "base64url").toString()
	};
}
function remotePath(marker, root, local) {
	if (local.startsWith("/")) return posix.normalize(local);
	const rel = relative(marker, local).split(sep).join("/");
	return rel === "" ? root : posix.join(root, rel);
}
function remoteRoute(manager, cwd, path) {
	const cwdText = typeof cwd === "string" ? cwd : "";
	const direct = manager.sessionForMarker(cwdText);
	if (direct) return {
		...direct,
		cwd: remotePath(direct.markerPath, direct.remotePath, cwdText),
		path: typeof path === "string" && isAbsolute(path) && path.startsWith(direct.markerPath) ? remotePath(direct.markerPath, direct.remotePath, path) : path
	};
	if (typeof path === "string") {
		const byPath = manager.sessionForMarker(path);
		if (byPath) return {
			...byPath,
			cwd: byPath.remotePath,
			path: remotePath(byPath.markerPath, byPath.remotePath, path)
		};
	}
}
function rpcError(error) {
	throw error;
}
function installExecutionBridge(ctx, manager) {
	const fs = ctx.fs;
	const shell = ctx.shell;
	const restore = [];
	if (fs) {
		const original = Object.fromEntries([
			"resolve",
			"processPath",
			"fileUrl",
			"contains",
			"stat",
			"lstat",
			"readText",
			"streamText",
			"readBytes",
			"listDir",
			"writeText",
			"editText"
		].map((k) => [k, fs[k].bind(fs)]));
		const set = (name, value) => {
			const prior = fs[name];
			fs[name] = value;
			restore.push(() => {
				fs[name] = prior;
			});
		};
		set("resolve", async (path, opts) => {
			const route = remoteRoute(manager, opts?.cwd, path);
			if (!route) return original.resolve(path, opts);
			const value = await manager.rpc(route.connection.id, "resolve", {
				path: route.path,
				cwd: route.cwd
			}, opts?.signal);
			return {
				targetKey: remoteKey(route.connection.id, value.targetKey),
				displayPath: value.displayPath
			};
		});
		set("processPath", (target) => parseKey(target.targetKey)?.path ?? original.processPath(target));
		set("fileUrl", (target) => {
			const parsed = parseKey(target.targetKey);
			return parsed ? `dsh-remote://${parsed.connectionId}${parsed.path}` : original.fileUrl(target);
		});
		set("contains", (parent, child) => {
			const a = parseKey(parent.targetKey);
			const b = parseKey(child.targetKey);
			if (!a || !b) return !a && !b ? original.contains(parent, child) : false;
			if (a.connectionId !== b.connectionId) return false;
			const rel = posix.relative(a.path, b.path);
			return rel === "" || rel !== ".." && !rel.startsWith("../") && !posix.isAbsolute(rel);
		});
		set("stat", async (target, signal) => {
			const p = parseKey(target.targetKey);
			return p ? manager.rpc(p.connectionId, "stat", { targetKey: p.path }, signal) : original.stat(target, signal);
		});
		set("lstat", async (path, opts, signal) => {
			const route = remoteRoute(manager, opts?.cwd, path);
			return route ? manager.rpc(route.connection.id, "lstat", {
				path: route.path,
				cwd: route.cwd
			}, signal) : original.lstat(path, opts, signal);
		});
		set("readText", async (target, signal) => {
			const p = parseKey(target.targetKey);
			return p ? manager.rpc(p.connectionId, "readText", { targetKey: p.path }, signal) : original.readText(target, signal);
		});
		set("streamText", async (target, signal) => {
			const p = parseKey(target.targetKey);
			if (!p) return original.streamText(target, signal);
			const text = await manager.rpc(p.connectionId, "readText", { targetKey: p.path }, signal);
			return (async function* () {
				yield text;
			})();
		});
		set("readBytes", async (target, signal, maxBytes) => {
			const p = parseKey(target.targetKey);
			if (!p) return original.readBytes(target, signal, maxBytes);
			const base64 = await manager.rpc(p.connectionId, "readBytes", {
				targetKey: p.path,
				maxBytes
			}, signal);
			return Buffer.from(base64, "base64");
		});
		set("listDir", async (target, signal) => {
			const p = parseKey(target.targetKey);
			if (!p) return original.listDir(target, signal);
			return (await manager.rpc(p.connectionId, "listDir", { targetKey: p.path }, signal)).map((row) => ({
				...row,
				target: {
					...row.target,
					targetKey: remoteKey(p.connectionId, row.target.targetKey)
				}
			}));
		});
		set("writeText", async (target, content, expected, signal, policy) => {
			const p = parseKey(target.targetKey);
			return p ? manager.rpc(p.connectionId, "writeText", {
				targetKey: p.path,
				content,
				expected,
				policy
			}, signal).catch(rpcError) : original.writeText(target, content, expected, signal, policy);
		});
		set("editText", async (target, edit, expected, signal, policy) => {
			const p = parseKey(target.targetKey);
			return p ? manager.rpc(p.connectionId, "editText", {
				targetKey: p.path,
				edit,
				expected,
				policy
			}, signal).catch(rpcError) : original.editText(target, edit, expected, signal, policy);
		});
	}
	if (shell) {
		const run = shell.run.bind(shell);
		const start = shell.start.bind(shell);
		shell.run = async (spec) => {
			const route = remoteRoute(manager, spec.workdir);
			return route ? manager.rpc(route.connection.id, "exec", {
				command: spec.command,
				cwd: route.cwd,
				timeoutMs: spec.timeoutMs,
				env: {
					...spec.env,
					...spec.dshEnv
				}
			}, spec.signal) : run(spec);
		};
		shell.start = (spec) => {
			const route = remoteRoute(manager, spec.workdir);
			if (!route) return start(spec);
			const controller = new AbortController();
			let output = "";
			let delivered = false;
			const proc = {
				status: "running",
				exitCode: null,
				signal: null,
				readOutput: () => {
					const delta = delivered ? "" : output;
					delivered = true;
					return {
						delta,
						lossy: false
					};
				},
				kill: () => {
					if (proc.status !== "running") return false;
					proc.status = "killed";
					controller.abort();
					return true;
				}
			};
			proc.done = manager.rpc(route.connection.id, "exec", {
				command: spec.command,
				cwd: route.cwd,
				timeoutMs: 18e5,
				env: {
					...spec.env,
					...spec.dshEnv
				}
			}, controller.signal).then((result) => {
				output = result.stdout.text + (result.stderr.text ? `${result.stdout.text.endsWith("\n") || !result.stdout.text ? "" : "\n"}[stderr]\n${result.stderr.text}` : "");
				proc.exitCode = result.exitCode;
				proc.signal = result.signal;
				if (proc.status === "running") proc.status = result.signal ? "killed" : "completed";
			}, (error) => {
				output = `remote process failed: ${error instanceof Error ? error.message : String(error)}`;
				proc.status = "killed";
			});
			return proc;
		};
		restore.push(() => {
			shell.run = run;
			shell.start = start;
		});
	}
	return () => {
		for (const fn of restore.reverse()) fn();
	};
}
//#endregion
//#region src/index.ts
const name = "dsh-remote-ssh";
const inject = [
	"webServer",
	"fs",
	"shell"
];
async function apply(ctx) {
	const store = new ConnectionStore();
	await store.load();
	const packageRoot = fileURLToPath(new URL("..", import.meta.url));
	const manager = await RemoteSshManager.create(store, packageRoot);
	const disposeBridge = installExecutionBridge(ctx, manager);
	const routes = makeRoutes(store, manager);
	ctx.effect(() => {
		const disposers = routes.map((route) => ctx.webServer.register(route));
		return () => {
			for (const dispose of disposers) dispose();
			disposeBridge();
			manager.dispose();
		};
	}, "dsh-remote-ssh: routes and tunnels");
}
//#endregion
export { apply, inject, name, normalizeConnection, shellQuote, sshConnectionArgs };

//# sourceMappingURL=index.js.map