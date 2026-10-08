// Storage layer with two modes:
// - "server": the local web app with its Node API (data shared, files on disk)
// - "local":  static hosting (e.g. GitHub Pages) — data lives in this browser's localStorage
// The mode is detected once on first use: if /api/state answers, use the server.
//
// Hierarchy: global HO slots -> modules -> PCs (pc.hoId points at a global slot).

export type Status = "planned" | "ongoing" | "paused" | "disbanded" | "finished";
export type CardMeta = { name: string; sizeBytes: number; data?: string };
export type Ho = { id: string; name: string };
export type Pc = { id: string; name: string; photo: string | null; card: CardMeta | null; hoId: string | null };
export type Module = { id: string; name: string; status: Status; pcs: Pc[] };
export type State = { hos: Ho[]; modules: Module[]; updatedAt: string };

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

function uid(prefix: string) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function defaultHos(): Ho[] {
  return [1, 2, 3, 4].map((n) => ({ id: uid("h"), name: `HO${n}` }));
}

function migrate(s: any): State {
  if (!s || !Array.isArray(s.modules)) return { hos: defaultHos(), modules: [], updatedAt: "" };
  const globalHos: Ho[] = Array.isArray(s.hos) ? s.hos : [];
  const byName = new Map<string, Ho>(globalHos.map((h) => [h.name, h]));
  for (const m of s.modules) {
    if (Array.isArray(m.hos)) {
      const idMap = new Map<string, string>();
      for (const h of m.hos) {
        let g = byName.get(h.name);
        if (!g) {
          g = { id: uid("h"), name: h.name };
          globalHos.push(g);
          byName.set(h.name, g);
        }
        idMap.set(h.id, g.id);
      }
      for (const p of m.pcs ?? []) {
        p.hoId = p.hoId ? idMap.get(p.hoId) ?? null : null;
      }
      delete m.hos;
    }
    if (!Array.isArray(m.pcs)) m.pcs = [];
  }
  if (!Array.isArray(s.hos) || !s.hos.length) s.hos = globalHos.length ? globalHos : defaultHos();
  const ids = new Set(s.hos.map((h: Ho) => h.id));
  for (const m of s.modules) {
    for (const p of m.pcs) if (p.hoId && !ids.has(p.hoId)) p.hoId = null;
  }
  return s as State;
}

function loadLocal(): State {
  try {
    return migrate(JSON.parse(localStorage.getItem(LS_KEY) || ""));
  } catch {
    return { hos: defaultHos(), modules: [], updatedAt: "" };
  }
}

function saveLocal(s: State) {
  s.updatedAt = new Date().toISOString();
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

async function serverReq<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    headers: init?.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : undefined,
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

/* ---------- global HO slots ---------- */

export async function addHo(name?: string): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq("/api/hos", { method: "POST", body: JSON.stringify({ name: name || "" }) });
    return;
  }
  const s = loadLocal();
  s.hos.push({ id: uid("h"), name: name?.trim() || `HO${s.hos.length + 1}` });
  saveLocal(s);
}

export async function renameHo(hoId: string, name: string): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/hos/${hoId}`, { method: "PATCH", body: JSON.stringify({ name }) });
    return;
  }
  const s = loadLocal();
  const ho = s.hos.find((h) => h.id === hoId);
  if (ho && name.trim()) {
    ho.name = name.trim();
    saveLocal(s);
  }
}

export async function removeHo(hoId: string): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/hos/${hoId}`, { method: "DELETE" });
    return;
  }
  const s = loadLocal();
  s.hos = s.hos.filter((h) => h.id !== hoId);
  for (const m of s.modules) for (const p of m.pcs) if (p.hoId === hoId) p.hoId = null;
  saveLocal(s);
}

export async function reorderHos(hoIds: string[]): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq("/api/hos/order", { method: "PUT", body: JSON.stringify({ hoIds }) });
    return;
  }
  const s = loadLocal();
  const ranked = new Map(hoIds.map((id, i) => [id, i]));
  s.hos.sort((a, b) => (ranked.get(a.id) ?? 999) - (ranked.get(b.id) ?? 999));
  saveLocal(s);
}

/* ---------- modules ---------- */

export async function addModule(name: string, status: Status): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq("/api/modules", { method: "POST", body: JSON.stringify({ name, status }) });
    return;
  }
  const s = loadLocal();
  s.modules.push({ id: uid("m"), name, status, pcs: [] });
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

/* ---------- PCs ---------- */

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
  const p = findModule(s, moduleId)?.pcs.find((x) => x.id === pcId);
  if (p && (hoId === null || s.hos.some((h) => h.id === hoId))) {
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

export async function setCard(moduleId: string, pcId: string, file: File): Promise<void> {
  if ((await detectMode()) === "server") {
    const r = await fetch(`/api/modules/${moduleId}/pcs/${pcId}/card`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
      body: file,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `上传失败 (${r.status})`);
    }
    return;
  }
  const buf = await file.arrayBuffer();
  const s = loadLocal();
  const p = findModule(s, moduleId)?.pcs.find((x) => x.id === pcId);
  if (p) p.card = { name: file.name, sizeBytes: buf.byteLength, data: bufToBase64(buf) };
  saveLocal(s);
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    out += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(out);
}

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
        if (p.card.sizeBytes && bytes.length !== p.card.sizeBytes) {
          throw new Error("卡背数据已损坏（大小校验失败），请重新上传");
        }
        return bytes.buffer;
      }
    }
  }
  throw new Error("未找到角色卡文件");
}
