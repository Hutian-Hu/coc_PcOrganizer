// Storage layer with two modes:
// - "server": the local web app with its Node API (data shared, files on disk)
// - "local":  static hosting (e.g. GitHub Pages) — data lives in this browser's localStorage
// The mode is detected once on first use: if /api/state answers, use the server.
//
// Hierarchy: global HO slots -> modules -> PCs (pc.hoId points at a global slot).

export type Status = "planned" | "ongoing" | "paused" | "disbanded" | "finished";
export type CardMeta = { name: string; sizeBytes: number; data?: string };
export type Ho = { id: string; name: string };
export type PcAttr = { label: string; value: number; half: number; fifth: number };
export type Pc = { id: string; name: string; photo: string | null; card: CardMeta | null; hoId: string | null; attrs?: PcAttr[] | null };
export type Module = { id: string; name: string; status: Status; pcs: Pc[] };
export type State = { hos: Ho[]; modules: Module[]; pcOrder: string[]; updatedAt: string };

type Mode = "server" | "local";

import { idbPutCard, idbGetCard, idbDeleteCard } from "./cardStore";

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
  if (!s || !Array.isArray(s.modules)) {
    return { hos: defaultHos(), modules: [], pcOrder: [], updatedAt: "" };
  }
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
  // 全局显示顺序：看板栏目按它渲染，与模组归属解耦；缺省按现有模组顺序生成
  const all = s.modules.flatMap((m: Module) => m.pcs.map((p: Pc) => p.id));
  const order: string[] = Array.isArray(s.pcOrder) ? s.pcOrder.filter((id: string) => all.includes(id)) : [];
  for (const id of all) if (!order.includes(id)) order.push(id);
  s.pcOrder = order;
  return s as State;
}

function loadLocal(): State {
  let s: State;
  try {
    s = migrate(JSON.parse(localStorage.getItem(LS_KEY) || ""));
  } catch {
    return { hos: defaultHos(), modules: [], pcOrder: [], updatedAt: "" };
  }
  // legacy: card binaries used to live inside the state JSON and blew the
  // localStorage quota — migrate them into IndexedDB on first sight.
  const hasLegacy = s.modules.some((m) => m.pcs.some((p) => p.card && (p.card as { data?: string }).data));
  if (hasLegacy) void migrateLegacyCards(s);
  return s;
}

async function migrateLegacyCards(s: State) {
  try {
    for (const m of s.modules) {
      for (const p of m.pcs) {
        const d = (p.card as { data?: string } | null)?.data;
        if (!d) continue;
        const bin = atob(d);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        await idbPutCard(p.id, bytes.buffer);
        delete (p.card as { data?: string }).data;
      }
    }
    saveLocal(s);
  } catch {
    /* 下次加载再试 */
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
  const m = findModule(s, id);
  if (m) for (const p of m.pcs) if (p.card) void idbDeleteCard(p.id).catch(() => {});
  const dead = new Set(m?.pcs.map((p) => p.id) ?? []);
  s.modules = s.modules.filter((x) => x.id !== id);
  s.pcOrder = s.pcOrder.filter((pid) => !dead.has(pid));
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
  if (m) {
    const pc = { id: uid("p"), name, photo: null, card: null, hoId: null };
    m.pcs.push(pc);
    s.pcOrder.push(pc.id);
  }
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

// 调整 PC：设置 HO 位并在全局顺序表中插入到 beforePcId 之前（null = 放到最后）。
// 只影响显示位置，不改变 PC 所在模组。
export async function orderPc(
  moduleId: string,
  pcId: string,
  targetHoId: string | null,
  beforePcId?: string | null
): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/modules/${moduleId}/pcs/${pcId}`, {
      method: "PATCH",
      body: JSON.stringify({ hoId: targetHoId, beforePcId: beforePcId ?? null }),
    });
    return;
  }
  const s = loadLocal();
  const p = findModule(s, moduleId)?.pcs.find((x) => x.id === pcId);
  if (!p) return;
  if (targetHoId === null || s.hos.some((h) => h.id === targetHoId)) p.hoId = targetHoId;
  s.pcOrder = s.pcOrder.filter((id) => id !== pcId);
  const idx = beforePcId ? s.pcOrder.indexOf(beforePcId) : -1;
  if (idx >= 0) s.pcOrder.splice(idx, 0, pcId);
  else s.pcOrder.push(pcId);
  saveLocal(s);
}

export async function setPcAttrs(moduleId: string, pcId: string, attrs: PcAttr[] | null): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/modules/${moduleId}/pcs/${pcId}`, {
      method: "PATCH",
      body: JSON.stringify({ attrs }),
    });
    return;
  }
  const s = loadLocal();
  const p = findModule(s, moduleId)?.pcs.find((x) => x.id === pcId);
  if (p) {
    p.attrs = attrs;
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
  if (m?.pcs.some((p) => p.id === pcId)) {
    void idbDeleteCard(pcId).catch(() => {});
  }
  if (m) m.pcs = m.pcs.filter((p) => p.id !== pcId);
  s.pcOrder = s.pcOrder.filter((pid) => pid !== pcId);
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
  if (p) {
    await idbPutCard(p.id, buf);
    p.card = { name: file.name, sizeBytes: buf.byteLength };
    saveLocal(s);
  }
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
      if (p.id !== pcId || !p.card) continue;
      const fromIdb = await idbGetCard(pcId);
      if (fromIdb) {
        if (p.card.sizeBytes && fromIdb.byteLength !== p.card.sizeBytes) {
          throw new Error("角色卡数据已损坏（大小校验失败），请重新上传");
        }
        return fromIdb;
      }
      // legacy fallback: card still embedded as base64 in the state JSON
      const d = (p.card as { data?: string }).data;
      if (d) {
        const bin = atob(d);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        void idbPutCard(pcId, bytes.buffer)
          .then(() => migrateLegacyCards(s))
          .catch(() => {});
        if (p.card.sizeBytes && bytes.length !== p.card.sizeBytes) {
          throw new Error("角色卡数据已损坏（大小校验失败），请重新上传");
        }
        return bytes.buffer;
      }
      throw new Error("未找到角色卡文件");
    }
  }
  throw new Error("未找到角色卡文件");
}
