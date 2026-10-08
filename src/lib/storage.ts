// Storage layer with two modes:
// - "server": the local web app with its Node API (data shared, files on disk)
// - "local":  static hosting (e.g. GitHub Pages) — data lives in this browser's localStorage
// The mode is detected once on first use: if /api/state answers, use the server.

export type Status = "planned" | "ongoing" | "finished";
export type CardMeta = { name: string; sizeBytes: number; data?: string };
export type Ho = { id: string; name: string };
export type Pc = { id: string; name: string; photo: string | null; card: CardMeta | null; hoId: string | null };
export type Module = { id: string; name: string; status: Status; hos: Ho[]; pcs: Pc[] };
export type State = { modules: Module[]; updatedAt: string };

type Mode = "server" | "local";

let modePromise: Promise<Mode> | null = null;

function detectMode(): Promise<Mode> {
  if (!modePromise) {
    modePromise = fetch("/api/state", { cache: "no-store" })
      .then((r) => (r.ok ? "server" : "local"))
      .catch(() => "local");
  }
  return modePromise;
}

const LS_KEY = "coc-web-state-v1";

function defaultHos(): Ho[] {
  return [1, 2, 3, 4].map((n) => ({ id: uid("h"), name: `HO${n}` }));
}

function migrate(s: any): State {
  if (!s || !Array.isArray(s.modules)) return { modules: [], updatedAt: "" };
  for (const m of s.modules) {
    if (!Array.isArray(m.hos)) m.hos = defaultHos();
    if (!Array.isArray(m.pcs)) m.pcs = [];
    const hoIds = new Set(m.hos.map((h: Ho) => h.id));
    for (const p of m.pcs) {
      if (p.hoId === undefined) p.hoId = null;
      if (p.hoId && !hoIds.has(p.hoId)) p.hoId = null;
    }
  }
  return s as State;
}

function loadLocal(): State {
  try {
    return migrate(JSON.parse(localStorage.getItem(LS_KEY) || ""));
  } catch {
    return { modules: [], updatedAt: "" };
  }
}

function saveLocal(s: State) {
  s.updatedAt = new Date().toISOString();
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

function uid(prefix: string) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function serverReq<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `请求失败 (${r.status})`);
  }
  return r.json() as Promise<T>;
}

function findModule(s: State, id: string) {
  return s.modules.find((x) => x.id === id);
}

export async function getState(): Promise<State> {
  if ((await detectMode()) === "server") return serverReq<State>("/api/state");
  return loadLocal();
}

export async function addModule(name: string, status: Status): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq("/api/modules", { method: "POST", body: JSON.stringify({ name, status }) });
    return;
  }
  const s = loadLocal();
  s.modules.push({ id: uid("m"), name, status, hos: defaultHos(), pcs: [] });
  saveLocal(s);
}

export async function setModuleStatus(id: string, status: Status): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/modules/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    return;
  }
  const s = loadLocal();
  const m = findModule(s, id);
  if (m) m.status = status;
  saveLocal(s);
}

export async function renameModule(id: string, name: string): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/modules/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    return;
  }
  const s = loadLocal();
  const m = findModule(s, id);
  if (m) m.name = name;
  saveLocal(s);
}

export async function removeModule(id: string): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/modules/${id}`, { method: "DELETE" });
    return;
  }
  const s = loadLocal();
  s.modules = s.modules.filter((x) => x.id !== id);
  saveLocal(s);
}

export async function addHo(moduleId: string, name?: string): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/modules/${moduleId}/hos`, {
      method: "POST",
      body: JSON.stringify({ name: name || "" }),
    });
    return;
  }
  const s = loadLocal();
  const m = findModule(s, moduleId);
  if (m) {
    m.hos.push({ id: uid("h"), name: name?.trim() || `HO${m.hos.length + 1}` });
    saveLocal(s);
  }
}

export async function renameHo(moduleId: string, hoId: string, name: string): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/modules/${moduleId}/hos/${hoId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
    return;
  }
  const s = loadLocal();
  const ho = findModule(s, moduleId)?.hos.find((h) => h.id === hoId);
  if (ho && name.trim()) {
    ho.name = name.trim();
    saveLocal(s);
  }
}

export async function removeHo(moduleId: string, hoId: string): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/modules/${moduleId}/hos/${hoId}`, { method: "DELETE" });
    return;
  }
  const s = loadLocal();
  const m = findModule(s, moduleId);
  if (m) {
    m.hos = m.hos.filter((h) => h.id !== hoId);
    for (const p of m.pcs) if (p.hoId === hoId) p.hoId = null;
    saveLocal(s);
  }
}

export async function addPc(moduleId: string, name: string): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/modules/${moduleId}/pcs`, { method: "POST", body: JSON.stringify({ name }) });
    return;
  }
  const s = loadLocal();
  const m = findModule(s, moduleId);
  if (m) m.pcs.push({ id: uid("p"), name, photo: null, card: null, hoId: null });
  saveLocal(s);
}

export async function renamePc(moduleId: string, pcId: string, name: string): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/modules/${moduleId}/pcs/${pcId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
    return;
  }
  const s = loadLocal();
  const p = findModule(s, moduleId)?.pcs.find((x) => x.id === pcId);
  if (p && name.trim()) {
    p.name = name.trim();
    saveLocal(s);
  }
}

export async function setPcHo(moduleId: string, pcId: string, hoId: string | null): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/modules/${moduleId}/pcs/${pcId}`, {
      method: "PATCH",
      body: JSON.stringify({ hoId }),
    });
    return;
  }
  const s = loadLocal();
  const m = findModule(s, moduleId);
  const p = m?.pcs.find((x) => x.id === pcId);
  if (m && p && (hoId === null || m.hos.some((h) => h.id === hoId))) {
    p.hoId = hoId;
    saveLocal(s);
  }
}

export async function removePc(moduleId: string, pcId: string): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/modules/${moduleId}/pcs/${pcId}`, { method: "DELETE" });
    return;
  }
  const s = loadLocal();
  const m = findModule(s, moduleId);
  if (m) m.pcs = m.pcs.filter((p) => p.id !== pcId);
  saveLocal(s);
}

export async function setPhoto(moduleId: string, pcId: string, photo: string | null): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/modules/${moduleId}/pcs/${pcId}/photo`, {
      method: "PUT",
      body: JSON.stringify({ photo }),
    });
    return;
  }
  const s = loadLocal();
  const p = findModule(s, moduleId)?.pcs.find((x) => x.id === pcId);
  if (p) p.photo = photo;
  saveLocal(s);
}

export async function setCard(
  moduleId: string,
  pcId: string,
  payload: { name: string; data: string; sizeBytes: number }
): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/modules/${moduleId}/pcs/${pcId}/card`, {
      method: "PUT",
      body: JSON.stringify({ name: payload.name, data: payload.data }),
    });
    return;
  }
  const s = loadLocal();
  const p = findModule(s, moduleId)?.pcs.find((x) => x.id === pcId);
  if (p) p.card = { name: payload.name, sizeBytes: payload.sizeBytes, data: payload.data };
  saveLocal(s);
}

// Fetch the card file content for preview/download.
export async function getCardArrayBuffer(pcId: string): Promise<ArrayBuffer> {
  if ((await detectMode()) === "server") {
    const r = await fetch(`/api/cards/${pcId}`);
    if (!r.ok) throw new Error("角色卡下载失败");
    return r.arrayBuffer();
  }
  const s = loadLocal();
  for (const m of s.modules) {
    for (const p of m.pcs) {
      if (p.id === pcId && p.card?.data) {
        const bin = atob(p.card.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes.buffer;
      }
    }
  }
  throw new Error("未找到角色卡文件");
}
