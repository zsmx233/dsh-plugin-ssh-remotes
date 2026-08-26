window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-remote-ssh",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
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
		//#region src/client/api.ts
		async function request(path, init) {
			const response = await fetch(path, {
				...init,
				headers: {
					"content-type": "application/json",
					...init?.headers ?? {}
				}
			});
			const body = await response.json();
			if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `request failed: ${response.status}`);
			return body;
		}
		var RemoteSshApi = class {
			async status() {
				return await request(API.status);
			}
			async list() {
				return (await request(API.connections)).connections;
			}
			async create(input) {
				return (await request(API.connections, {
					method: "POST",
					body: JSON.stringify(input)
				})).connection;
			}
			async remove(id) {
				await request(`${API.connections}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
			}
			async test(id, password = "") {
				return (await request(API.test, {
					method: "POST",
					body: JSON.stringify({
						id,
						password
					})
				})).result;
			}
			async bootstrap(id, password = "") {
				return (await request(API.bootstrap, {
					method: "POST",
					body: JSON.stringify({
						id,
						password,
						installUi: true
					})
				})).result;
			}
			async connect(id, password = "", remotePath) {
				return (await request(API.connect, {
					method: "POST",
					body: JSON.stringify({
						id,
						password,
						...remotePath ? { remotePath } : {}
					})
				})).session;
			}
			async select(id, remotePath, password = "") {
				return (await request(API.select, {
					method: "POST",
					body: JSON.stringify({
						id,
						remotePath,
						password
					})
				})).session;
			}
			async disconnect(id) {
				await request(API.disconnect, {
					method: "POST",
					body: JSON.stringify({ id })
				});
			}
			async workspace(connectionId, op, args) {
				return (await request(API.workspace, {
					method: "POST",
					body: JSON.stringify({
						connectionId,
						op,
						args
					})
				})).value;
			}
		};
		//#endregion
		//#region src/client/index.tsx
		const inject = [
			"slots",
			"workspaces",
			"sessions",
			"betterSidebar"
		];
		const panelState = {
			open: false,
			listeners: /* @__PURE__ */ new Set(),
			get() {
				return this.open;
			},
			set(value) {
				this.open = value;
				for (const listener of this.listeners) listener();
			},
			subscribe(listener) {
				this.listeners.add(listener);
				return () => this.listeners.delete(listener);
			}
		};
		const CSS = `
.dsh-rssh-backdrop{position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.52);display:flex;align-items:center;justify-content:center;padding:20px}
.dsh-rssh-panel{width:min(920px,96vw);max-height:90vh;display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay,#1b1c22);color:var(--dsw-alias-label-primary,#f0f1f4);border:1px solid var(--dsw-alias-border-l1,#3b3d47);border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.55)}
.dsh-rssh-head,.dsh-rssh-row,.dsh-rssh-actions,.dsh-rssh-status{display:flex;align-items:center;gap:8px}
.dsh-rssh-head{padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,#3b3d47)}
.dsh-rssh-title{font-size:15px;font-weight:650}.dsh-rssh-spacer{flex:1}.dsh-rssh-body{overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.dsh-rssh-section{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#9fa2ad)}
.dsh-rssh-card{border:1px solid var(--dsw-alias-border-l1,#3b3d47);border-radius:9px;padding:11px;background:var(--dsw-alias-bg-layer-1,#202129)}
.dsh-rssh-row{align-items:flex-start}.dsh-rssh-meta{min-width:0;flex:1}.dsh-rssh-name{font-weight:650}.dsh-rssh-desc,.dsh-rssh-hint{font-size:12px;color:var(--dsw-alias-label-secondary,#a3a6b0);word-break:break-all;margin-top:3px}
.dsh-rssh-actions{flex-wrap:wrap;justify-content:flex-end}.dsh-rssh-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dsh-rssh-full{grid-column:1/-1}
.dsh-rssh-field{display:flex;flex-direction:column;gap:4px}.dsh-rssh-label{font-size:11px;color:var(--dsw-alias-label-secondary,#a3a6b0)}
.dsh-rssh-input,.dsh-rssh-select{width:100%;box-sizing:border-box;color:inherit;background:var(--dsw-alias-bg-base,#15161b);border:1px solid var(--dsw-alias-border-l1,#3b3d47);border-radius:6px;padding:7px 8px;font:inherit}
.dsh-rssh-btn{border:1px solid var(--dsw-alias-border-l2,#4a4d59);border-radius:6px;padding:6px 10px;background:var(--dsw-alias-bg-layer-2,#292b34);color:inherit;cursor:pointer;white-space:nowrap}.dsh-rssh-btn:hover{border-color:var(--dsw-alias-brand-primary,#5b8def)}.dsh-rssh-btn:disabled{opacity:.48;cursor:default}
.dsh-rssh-primary{background:var(--dsw-alias-brand-primary,#4e7fe0);border-color:transparent;color:#fff}.dsh-rssh-danger:hover{border-color:#dc6464}.dsh-rssh-error{color:#ef8585;font-size:12px;white-space:pre-wrap}.dsh-rssh-ok{color:#69cc96;font-size:12px;white-space:pre-wrap}
.dsh-rssh-pill{font-size:11px;padding:2px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,#292b34)}.dsh-rssh-pill.ready{color:#69cc96}.dsh-rssh-pill.failed{color:#ef8585}
.dsh-rssh-footer-action{border:0;background:transparent;color:inherit;cursor:pointer;padding:6px 9px;font-size:12px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-rssh-footer-action:hover{color:var(--dsw-alias-brand-primary,#6b9cff)}
.dsh-rssh-adopting{position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:1500;padding:8px 13px;border-radius:8px;background:#20232c;color:#fff;border:1px solid #4b5060;box-shadow:0 8px 24px rgba(0,0,0,.35);font-size:12px}
.dsh-rssh-explorer{height:100%;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,#15161b);color:inherit}.dsh-rssh-explorer-head{display:flex;gap:6px;align-items:center;padding:7px;border-bottom:1px solid var(--dsw-alias-border-l1,#343640)}.dsh-rssh-path{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;opacity:.75;flex:1}.dsh-rssh-files{min-height:120px;overflow:auto;border-bottom:1px solid var(--dsw-alias-border-l1,#343640)}.dsh-rssh-file{display:flex;width:100%;gap:7px;border:0;background:transparent;color:inherit;text-align:left;padding:5px 9px;cursor:pointer}.dsh-rssh-file:hover{background:var(--dsw-alias-bg-layer-2,#292b34)}.dsh-rssh-editor{flex:1;min-height:140px;resize:none;border:0;border-bottom:1px solid var(--dsw-alias-border-l1,#343640);background:#111218;color:inherit;padding:9px;font:12px/1.5 ui-monospace,Consolas,monospace}.dsh-rssh-command{display:flex;gap:6px;padding:7px}.dsh-rssh-command input{flex:1}.dsh-rssh-output{max-height:130px;overflow:auto;margin:0;padding:8px;white-space:pre-wrap;font:11px/1.4 ui-monospace,Consolas,monospace}
.dsh-rssh-targets{height:100%;overflow:auto;padding:8px;background:var(--dsw-alias-bg-base,#15161b)}.dsh-rssh-target-host{border:1px solid var(--dsw-alias-border-l1,#343640);border-radius:7px;margin-bottom:7px;overflow:hidden}.dsh-rssh-target-main{display:flex;align-items:center;gap:7px;padding:8px}.dsh-rssh-target-main .dsh-rssh-meta{min-width:0}.dsh-rssh-target-folder{display:flex;align-items:center;gap:6px;width:100%;border:0;border-top:1px solid var(--dsw-alias-border-l1,#343640);background:transparent;color:inherit;padding:6px 10px 6px 25px;text-align:left;cursor:pointer;font-size:11px}.dsh-rssh-target-folder:hover{background:var(--dsw-alias-bg-layer-2,#292b34)}.dsh-rssh-picker-list{min-height:180px;max-height:55vh;overflow:auto;border:1px solid var(--dsw-alias-border-l1,#343640);border-radius:6px;margin-top:7px}.dsh-rssh-picker-row{display:flex;width:100%;gap:7px;border:0;background:transparent;color:inherit;padding:7px 9px;text-align:left;cursor:pointer}.dsh-rssh-picker-row:hover{background:var(--dsw-alias-bg-layer-2,#292b34)}
@media(max-width:720px){.dsh-rssh-form{grid-template-columns:1fr}.dsh-rssh-full{grid-column:1}.dsh-rssh-row{flex-direction:column}.dsh-rssh-actions{justify-content:flex-start}}
`;
		function remoteContextFromUrl() {
			const params = new URLSearchParams(window.location.search);
			const authority = params.get("dshRemoteAuthority")?.trim() ?? "";
			const path = params.get("dshRemotePath")?.trim() ?? "";
			if (authority === "" || !path.startsWith("/")) return void 0;
			const rawReturn = params.get("dshRemoteReturn");
			let returnUrl;
			if (rawReturn !== null) try {
				const parsed = new URL(rawReturn);
				if (parsed.protocol === "http:" && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "[::1]")) returnUrl = parsed.href;
			} catch {}
			return {
				authority,
				path,
				returnUrl
			};
		}
		function RemoteWorkspaceInitializer({ ctx, remote }) {
			const [message, setMessage] = (0, react.useState)(`正在连接 ${remote.authority}…`);
			(0, react.useEffect)(() => {
				let active = true;
				(async () => {
					try {
						const workspace = await ctx.workspaces.create({ path: remote.path });
						if (!active) return;
						setMessage(`正在打开远程工作区 ${remote.path}…`);
						const sessionId = await ctx.workspaces.connectWorkspace(workspace.workspaceId);
						if (!active) return;
						ctx.sessions.open(sessionId);
						const url = new URL(window.location.href);
						url.searchParams.delete("dshRemoteAuthority");
						url.searchParams.delete("dshRemotePath");
						url.searchParams.delete("dshRemoteReturn");
						window.history.replaceState({}, "", url);
						setMessage("");
					} catch (error) {
						if (active) setMessage(`远程工作区打开失败：${error instanceof Error ? error.message : String(error)}`);
					}
				})();
				return () => {
					active = false;
				};
			}, [
				ctx,
				remote.authority,
				remote.path
			]);
			return message === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-rssh-adopting",
				children: message
			});
		}
		const emptyForm = {
			name: "",
			host: "",
			port: 22,
			user: "",
			authType: "agent",
			keyPath: "",
			remotePath: "/",
			runtimeCommand: "node"
		};
		function RemoteExplorer({ api, scope }) {
			const [session, setSession] = (0, react.useState)();
			const [dir, setDir] = (0, react.useState)("");
			const [entries, setEntries] = (0, react.useState)([]);
			const [file, setFile] = (0, react.useState)("");
			const [content, setContent] = (0, react.useState)("");
			const [command, setCommand] = (0, react.useState)("git status --short --branch");
			const [output, setOutput] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				api.status().then((status) => {
					const found = status.sessions.find((item) => item.markerPath === scope.cwd && item.state === "ready");
					setSession(found);
					if (found) setDir(found.remotePath);
				}).catch((e) => setError(e instanceof Error ? e.message : String(e)));
			}, [api, scope.cwd]);
			const load = async (path) => {
				if (!session) return;
				try {
					setError("");
					setEntries(await api.workspace(session.connectionId, "listDir", { targetKey: path }));
					setDir(path);
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			(0, react.useEffect)(() => {
				if (session && dir) load(dir);
			}, [session?.connectionId, dir === "" ? "" : "initial"]);
			if (!session) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-rssh-explorer",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-rssh-error",
					style: { padding: 10 },
					children: "该会话没有活动的 Remote-SSH 执行面。请从 Remote-SSH 管理器重新连接。"
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-rssh-explorer",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-rssh-explorer-head",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "dsh-rssh-btn",
								onClick: () => void load(dir.replace(/\/+[^/]+\/?$/, "") || "/"),
								children: "↑"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dsh-rssh-path",
								children: [
									"[SSH: ",
									session.authority,
									"] ",
									dir
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "dsh-rssh-btn",
								onClick: () => void load(dir),
								children: "刷新"
							})
						]
					}),
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-rssh-error",
						style: { padding: 7 },
						children: error
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-rssh-files",
						children: entries.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							className: "dsh-rssh-file",
							onClick: () => {
								if (entry.type === "directory") load(entry.target.targetKey);
								else api.workspace(session.connectionId, "readText", { targetKey: entry.target.targetKey }).then((text) => {
									setFile(entry.target.targetKey);
									setContent(text);
								}).catch((e) => setError(e instanceof Error ? e.message : String(e)));
							},
							disabled: entry.broken === true,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: entry.broken ? "×" : entry.type === "directory" ? "▸" : entry.isSymlink ? "↗" : "·" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: entry.name })]
						}, entry.target.targetKey))
					}),
					file ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-rssh-explorer-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-rssh-path",
							children: file
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dsh-rssh-btn dsh-rssh-primary",
							onClick: () => void api.workspace(session.connectionId, "writeText", {
								targetKey: file,
								content,
								policy: { mode: "workspace-write" }
							}).then(() => setOutput("已保存")).catch((e) => setError(e instanceof Error ? e.message : String(e))),
							children: "保存"
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						className: "dsh-rssh-editor",
						value: content,
						onChange: (e) => setContent(e.target.value)
					})] }) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-rssh-command",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "dsh-rssh-input",
							value: command,
							onChange: (e) => setCommand(e.target.value),
							onKeyDown: (e) => {
								if (e.key === "Enter") api.workspace(session.connectionId, "exec", {
									command,
									cwd: dir,
									timeoutMs: 6e4
								}).then((r) => setOutput(`${r.stdout.text}${r.stderr.text ? `\n[stderr]\n${r.stderr.text}` : ""}\n[exit ${r.exitCode}]`)).catch((x) => setError(x instanceof Error ? x.message : String(x)));
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dsh-rssh-btn",
							onClick: () => void api.workspace(session.connectionId, "exec", {
								command,
								cwd: dir,
								timeoutMs: 6e4
							}).then((r) => setOutput(`${r.stdout.text}${r.stderr.text ? `\n[stderr]\n${r.stderr.text}` : ""}\n[exit ${r.exitCode}]`)).catch((x) => setError(x instanceof Error ? x.message : String(x))),
							children: "运行"
						})]
					}),
					output ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						className: "dsh-rssh-output",
						children: output
					}) : null
				]
			});
		}
		async function adoptRemoteWorkspace(ctx, session) {
			const workspace = await ctx.workspaces.create({ path: session.markerPath });
			const sessionId = await ctx.workspaces.connectWorkspace(workspace.workspaceId);
			ctx.sessions.open(sessionId);
			ctx.betterSidebar?.openTab({ type: "remote-ssh:explorer" }, {
				sessionId,
				cwd: session.markerPath
			});
		}
		function RemoteTargets({ ctx, api }) {
			const [connections, setConnections] = (0, react.useState)([]);
			const [passwords, setPasswords] = (0, react.useState)({});
			const [picker, setPicker] = (0, react.useState)();
			const [pathInput, setPathInput] = (0, react.useState)("/");
			const [busy, setBusy] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)("");
			const refresh = () => api.list().then(setConnections);
			(0, react.useEffect)(() => {
				refresh().catch((e) => setError(e instanceof Error ? e.message : String(e)));
			}, []);
			const passwordOf = (connection) => passwords[connection.id] ?? "";
			const loadDir = async (connection, session, path) => {
				const entries = await api.workspace(connection.id, "listDir", { targetKey: path });
				const canonical = path === "" ? "/" : path;
				setPathInput(canonical);
				setPicker({
					connection,
					session,
					path: canonical,
					entries
				});
			};
			const browse = async (connection) => {
				setBusy(connection.id);
				setError("");
				try {
					const session = await api.connect(connection.id, passwordOf(connection), "/");
					await loadDir(connection, session, connection.remotePath || "/");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				} finally {
					setBusy("");
				}
			};
			const open = async (connection, path) => {
				setBusy(`open:${connection.id}`);
				setError("");
				try {
					await adoptRemoteWorkspace(ctx, await api.select(connection.id, path, passwordOf(connection)));
					await refresh();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				} finally {
					setBusy("");
				}
			};
			if (picker) {
				const parent = picker.path.replace(/\/+[^/]+\/?$/, "") || "/";
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-rssh-targets",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-rssh-explorer-head",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "dsh-rssh-btn",
									onClick: () => setPicker(void 0),
									children: "← 主机"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: picker.connection.name }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsh-rssh-spacer" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "dsh-rssh-btn dsh-rssh-primary",
									disabled: busy !== "",
									onClick: () => void open(picker.connection, picker.path),
									children: "打开此文件夹"
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-rssh-command",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "dsh-rssh-btn",
									onClick: () => void loadDir(picker.connection, picker.session, parent),
									children: "↑"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "dsh-rssh-input",
									value: pathInput,
									onChange: (e) => setPathInput(e.target.value),
									onKeyDown: (e) => {
										if (e.key === "Enter") loadDir(picker.connection, picker.session, pathInput).catch((x) => setError(x instanceof Error ? x.message : String(x)));
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "dsh-rssh-btn",
									onClick: () => void loadDir(picker.connection, picker.session, pathInput).catch((x) => setError(x instanceof Error ? x.message : String(x))),
									children: "转到"
								})
							]
						}),
						error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-rssh-error",
							children: error
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-rssh-picker-list",
							children: picker.entries.filter((entry) => entry.type === "directory" && !entry.broken).map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: "dsh-rssh-picker-row",
								onDoubleClick: () => void open(picker.connection, entry.target.targetKey),
								onClick: () => void loadDir(picker.connection, picker.session, entry.target.targetKey).catch((x) => setError(x instanceof Error ? x.message : String(x))),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "▸" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: entry.name })]
							}, entry.target.targetKey))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-rssh-hint",
							style: { marginTop: 7 },
							children: "单击进入目录，双击直接作为工作区打开。选定后执行 Host 会重启并只授权该目录。"
						})
					]
				});
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-rssh-targets",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-rssh-explorer-head",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "SSH 连接目标" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsh-rssh-spacer" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "dsh-rssh-btn",
								onClick: () => panelState.set(true),
								children: "＋ 新建/管理"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "dsh-rssh-btn",
								onClick: () => void refresh(),
								children: "刷新"
							})
						]
					}),
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-rssh-error",
						style: { padding: 7 },
						children: error
					}) : null,
					connections.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-rssh-hint",
						style: { padding: 10 },
						children: "没有 SSH 主机。点击“新建/管理”添加连接。"
					}) : null,
					connections.map((connection) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-rssh-target-host",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-rssh-target-main",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "▸" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dsh-rssh-meta",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dsh-rssh-name",
										children: connection.name
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-rssh-desc",
										children: [
											connection.user ? `${connection.user}@` : "",
											connection.host,
											":",
											connection.port
										]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsh-rssh-spacer" }),
								connection.authType === "password" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "dsh-rssh-input",
									style: { width: 130 },
									type: "password",
									placeholder: "SSH 密码",
									value: passwordOf(connection),
									onChange: (e) => setPasswords((current) => ({
										...current,
										[connection.id]: e.target.value
									}))
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "dsh-rssh-btn dsh-rssh-primary",
									disabled: busy !== "" || connection.authType === "password" && passwordOf(connection) === "",
									onClick: () => void browse(connection),
									children: busy === connection.id ? "连接中…" : "选择文件夹"
								})
							]
						}), connection.recentPaths.map((path) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							className: "dsh-rssh-target-folder",
							disabled: busy !== "" || connection.authType === "password" && passwordOf(connection) === "",
							onClick: () => void open(connection, path),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "⌁" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-rssh-path",
									children: path
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "打开" })
							]
						}, path))]
					}, connection.id))
				]
			});
		}
		function ManagerPanel({ ctx, api }) {
			const open = (0, react.useSyncExternalStore)(panelState.subscribe.bind(panelState), panelState.get.bind(panelState));
			const [status, setStatus] = (0, react.useState)();
			const [connections, setConnections] = (0, react.useState)([]);
			const [form, setForm] = (0, react.useState)({ ...emptyForm });
			const [passwords, setPasswords] = (0, react.useState)({});
			const [busy, setBusy] = (0, react.useState)("");
			const [message, setMessage] = (0, react.useState)();
			const refresh = async () => {
				const [nextStatus, nextConnections] = await Promise.all([api.status(), api.list()]);
				setStatus(nextStatus);
				setConnections(nextConnections);
			};
			(0, react.useEffect)(() => {
				if (!open) return;
				refresh().catch((error) => setMessage({
					ok: false,
					text: error instanceof Error ? error.message : String(error)
				}));
			}, [open]);
			if (!open) return null;
			const action = async (key, work) => {
				setBusy(key);
				setMessage(void 0);
				try {
					await work();
				} catch (error) {
					setMessage({
						ok: false,
						text: error instanceof Error ? error.message : String(error)
					});
				} finally {
					setBusy("");
				}
			};
			const sessions = new Map((status?.sessions ?? []).map((session) => [session.connectionId, session]));
			const setField = (key, value) => setForm((current) => ({
				...current,
				[key]: value
			}));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-rssh-backdrop",
				onMouseDown: () => panelState.set(false),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-rssh-panel",
					onMouseDown: (event) => event.stopPropagation(),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-rssh-head",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-rssh-title",
								children: "Remote-SSH 工作区"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-rssh-pill",
								children: "Local control · Remote execution"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsh-rssh-spacer" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "dsh-rssh-btn",
								onClick: () => panelState.set(false),
								children: "关闭"
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-rssh-body",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-rssh-status",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: status?.sshAvailable ? "dsh-rssh-ok" : "dsh-rssh-error",
										children: status ? `OpenSSH: ${status.sshAvailable ? status.sshPath : "不可用"}` : "正在检测 OpenSSH…"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsh-rssh-spacer" }),
									status ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-rssh-hint",
										children: "轻量执行面 · 本地会话与 Agent"
									}) : null
								]
							}),
							message ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: message.ok ? "dsh-rssh-ok" : "dsh-rssh-error",
								children: message.text
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-rssh-section",
								children: "远程工作区"
							}),
							connections.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-rssh-hint",
								children: "尚未添加连接。远端只需要 Node.js 与 SSH，不需要安装完整 DSH。"
							}) : null,
							connections.map((connection) => {
								const session = sessions.get(connection.id);
								const password = passwords[connection.id] ?? "";
								const authReady = connection.authType !== "password" || password !== "";
								return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dsh-rssh-card",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-rssh-row",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "dsh-rssh-meta",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: "dsh-rssh-name",
													children: [
														connection.name,
														" ",
														session ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: `dsh-rssh-pill ${session.state}`,
															children: session.state
														}) : null
													]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: "dsh-rssh-desc",
													children: [
														connection.authType === "config" ? connection.host : `${connection.user ? `${connection.user}@` : ""}${connection.host}:${connection.port}`,
														" · ",
														connection.remotePath
													]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: "dsh-rssh-desc",
													children: [
														"认证：",
														connection.authType,
														" · 运行时：",
														connection.runtimeCommand
													]
												}),
												connection.authType === "password" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													className: "dsh-rssh-input",
													type: "password",
													autoComplete: "off",
													placeholder: "本次操作的 SSH 密码（仅内存）",
													value: password,
													onChange: (event) => setPasswords((values) => ({
														...values,
														[connection.id]: event.target.value
													}))
												}) : null,
												session?.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: "dsh-rssh-error",
													children: session.error
												}) : null
											]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "dsh-rssh-actions",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: "dsh-rssh-btn",
													disabled: busy !== "" || !authReady,
													onClick: () => void action(`test:${connection.id}`, async () => {
														const result = await api.test(connection.id, password);
														setMessage({
															ok: result.ok,
															text: result.ok ? result.stdout || "SSH 与远程目录正常" : result.error || "检测失败"
														});
													}),
													children: busy === `test:${connection.id}` ? "检测中…" : "检测"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: "dsh-rssh-btn",
													disabled: busy !== "" || !authReady,
													onClick: () => {
														if (!window.confirm(`将在 ${connection.name} 部署轻量 Remote Host（单个 Node.js 文件）。是否继续？`)) return;
														action(`setup:${connection.id}`, async () => {
															const result = await api.bootstrap(connection.id, password);
															if (!result.ok) throw new Error(result.error || "远端安装失败");
															setMessage({
																ok: true,
																text: "轻量 Remote Host 已部署，可以连接。"
															});
														});
													},
													children: busy === `setup:${connection.id}` ? "部署中…" : "部署轻量 Host"
												}),
												session?.state === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: "dsh-rssh-btn",
													disabled: busy !== "",
													onClick: () => void action(`disconnect:${connection.id}`, async () => {
														await api.disconnect(connection.id);
														await refresh();
													}),
													children: "断开"
												}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: "dsh-rssh-btn dsh-rssh-primary",
													disabled: busy !== "" || !authReady,
													onClick: () => {
														panelState.set(false);
														ctx.betterSidebar?.openTab({ type: "remote-ssh:targets" });
													},
													children: "选择工作区"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: "dsh-rssh-btn dsh-rssh-danger",
													disabled: busy !== "",
													onClick: () => {
														if (!window.confirm(`删除连接“${connection.name}”？不会删除远程目录。`)) return;
														action(`remove:${connection.id}`, async () => {
															await api.remove(connection.id);
															await refresh();
														});
													},
													children: "删除"
												})
											]
										})]
									})
								}, connection.id);
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-rssh-section",
								children: "添加连接"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-rssh-card dsh-rssh-form",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "dsh-rssh-field",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dsh-rssh-label",
											children: "显示名称 *"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: "dsh-rssh-input",
											value: String(form.name ?? ""),
											onChange: (event) => setField("name", event.target.value),
											placeholder: "dev-server"
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "dsh-rssh-field",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dsh-rssh-label",
											children: "主机或 SSH config 别名 *"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: "dsh-rssh-input",
											value: String(form.host ?? ""),
											onChange: (event) => setField("host", event.target.value),
											placeholder: "192.168.1.20"
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "dsh-rssh-field",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dsh-rssh-label",
											children: "用户"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: "dsh-rssh-input",
											value: String(form.user ?? ""),
											onChange: (event) => setField("user", event.target.value),
											placeholder: "root"
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "dsh-rssh-field",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dsh-rssh-label",
											children: "端口"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: "dsh-rssh-input",
											type: "number",
											value: Number(form.port ?? 22),
											onChange: (event) => setField("port", Number(event.target.value))
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "dsh-rssh-field",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dsh-rssh-label",
											children: "认证方式"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											className: "dsh-rssh-select",
											value: String(form.authType ?? "agent"),
											onChange: (event) => setField("authType", event.target.value),
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "agent",
													children: "SSH Agent / 默认密钥"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "key",
													children: "指定密钥"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "password",
													children: "用户名 + 密码"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "config",
													children: "~/.ssh/config 别名"
												})
											]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "dsh-rssh-field",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dsh-rssh-label",
											children: "初始浏览目录"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: "dsh-rssh-input",
											value: String(form.remotePath ?? "/"),
											onChange: (event) => setField("remotePath", event.target.value),
											placeholder: "/"
										})]
									}),
									form.authType === "key" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "dsh-rssh-field dsh-rssh-full",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dsh-rssh-label",
											children: "本机私钥路径 *"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: "dsh-rssh-input",
											value: String(form.keyPath ?? ""),
											onChange: (event) => setField("keyPath", event.target.value),
											placeholder: "C:\\\\Users\\\\you\\\\.ssh\\\\id_ed25519"
										})]
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "dsh-rssh-field",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dsh-rssh-label",
											children: "远端 Node.js 命令"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: "dsh-rssh-input",
											value: String(form.runtimeCommand ?? "node"),
											onChange: (event) => setField("runtimeCommand", event.target.value)
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-rssh-field",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dsh-rssh-label",
											children: "\xA0"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "dsh-rssh-btn dsh-rssh-primary",
											disabled: busy !== "",
											onClick: () => void action("create", async () => {
												await api.create(form);
												setForm({ ...emptyForm });
												await refresh();
											}),
											children: busy === "create" ? "添加中…" : "添加 SSH 主机"
										})]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-rssh-hint",
								children: "安全模型：Remote Host 仅绑定 127.0.0.1，随机令牌鉴权，所有 RPC 经过 SSH 隧道；文件访问被限制在工作区根目录内。密码不会落盘。"
							})
						]
					})]
				})
			});
		}
		function RemoteRoot({ ctx, api, remote }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [remote ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RemoteWorkspaceInitializer, {
				ctx,
				remote
			}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ManagerPanel, {
				ctx,
				api
			})] });
		}
		function FooterAction({ ctx, wide, remote }) {
			const label = remote ? `[SSH: ${remote.authority}]` : wide ? "Remote-SSH" : "SSH";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				className: "dsh-rssh-footer-action",
				title: remote ? `${remote.authority}: ${remote.path}` : "Remote-SSH 工作区",
				onClick: () => {
					if (remote?.returnUrl) window.location.assign(remote.returnUrl);
					else {
						const sidebar = ctx.betterSidebar;
						if (sidebar) sidebar.openTab({ type: "remote-ssh:targets" });
						else panelState.set(!panelState.get());
					}
				},
				children: label
			});
		}
		function apply(ctx) {
			const api = new RemoteSshApi();
			const remote = remoteContextFromUrl();
			const style = document.createElement("style");
			style.dataset.plugin = "@dsh-external/dsh-remote-ssh";
			style.textContent = CSS;
			document.head.appendChild(style);
			const betterSidebar = ctx.betterSidebar;
			const disposeTargets = betterSidebar?.registerTab({
				id: "remote-ssh:targets",
				title: "SSH 连接目标",
				order: 10,
				single: true,
				component: () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RemoteTargets, {
					ctx,
					api
				})
			});
			const disposeExplorer = betterSidebar?.registerTab({
				id: "remote-ssh:explorer",
				title: "Remote Explorer",
				order: 15,
				single: true,
				component: ({ scope }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RemoteExplorer, {
					api,
					scope
				})
			});
			const footer = ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "dsh-remote-ssh.open",
				order: -20,
				label: "Remote-SSH"
			}, (props) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FooterAction, {
				ctx,
				wide: props.wide,
				remote
			})));
			const overlay = ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "dsh-remote-ssh.panel",
				order: 15,
				label: "Remote-SSH Workspaces"
			}, () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RemoteRoot, {
				ctx,
				api,
				remote
			})));
			ctx.effect(() => () => {
				footer();
				overlay();
				disposeTargets?.();
				disposeExplorer?.();
				style.remove();
			}, "dsh-remote-ssh: client surfaces");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map