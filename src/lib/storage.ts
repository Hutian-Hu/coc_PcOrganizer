// Storage layer with two modes:
// - "server": the local web app with its Node API (data shared, files on disk)
// - "local":  static hosting (e.g. GitHub Pages) — data lives in this browser's localStorage
// The mode is detected once on first use: if /api/state answers, use the server.

export type Status = "planned" | "ongoing" | "finished";
export type CardMeta = { name: string; sizeBytes: number; data?: string };
export type Pc = { id: string; name: string; photo: string | null; card: CardMeta | null };
export type Module = { id: string; name: string; status: Status; pcs: Pc[] };
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

function loadLocal(): State {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || "");
    if (s && Array.isArray(s.modules)) return s as State;
  } catch {
    /* ignore */
  }
  return { modules: [], updatedAt: "" };
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
  s.modules.push({ id: uid("m"), name, status, pcs: [] });
  saveLocal(s);
}

export async function setModuleStatus(id: string, status: Status): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/modules/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    return;
  }
  const s = loadLocal();
  const m = s.modules.find((x) => x.id === id);
  if (m) m.status = status;
  saveLocal(s);
}

export async function renameModule(id: string, name: string): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/modules/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    return;
  }
  const s = loadLocal();
  const m = s.modules.find((x) => x.id === id);
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

export async function addPc(moduleId: string, name: string): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/modules/${moduleId}/pcs`, { method: "POST", body: JSON.stringify({ name }) });
    return;
  }
  const s = loadLocal();
  const m = s.modules.find((x) => x.id === moduleId);
  if (m) m.pcs.push({ id: uid("p"), name, photo: null, card: null });
  saveLocal(s);
}

export async function removePc(moduleId: string, pcId: string): Promise<void> {
  if ((await detectMode()) === "server") {
    await serverReq(`/api/modules/${moduleId}/pcs/${pcId}`, { method: "DELETE" });
    return;
  }
  const s = loadLocal();
  const m = s.modules.find((x) => x.id === moduleId);
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
  const p = s.modules.find((x) => x.id === moduleId)?.pcs.find((x) => x.id === pcId);
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
  const p = s.modules.find((x) => x.id === moduleId)?.pcs.find((x) => x.id === pcId);
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
