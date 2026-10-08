import type { Plugin } from "vite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "server-data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

type Status = "planned" | "ongoing" | "paused" | "disbanded" | "finished";
type CardMeta = { name: string; sizeBytes: number; storedName: string };
type Ho = { id: string; name: string };
type Pc = { id: string; name: string; photo: string | null; card: CardMeta | null; hoId: string | null };
type Module = { id: string; name: string; status: Status; pcs: Pc[] };
type State = { hos: Ho[]; modules: Module[]; updatedAt: string };

const STATUSES: Status[] = ["planned", "ongoing", "paused", "disbanded", "finished"];

function uid(prefix: string) {
  return prefix + "_" + crypto.randomBytes(5).toString("hex");
}

function defaultHos(): Ho[] {
  return [1, 2, 3, 4].map((n) => ({ id: uid("h"), name: `HO${n}` }));
}

// Migrate legacy states: HO slots used to live inside each module; they are
// now global. Merge module-level slots into one global list keyed by name and
// rewrite pc.hoId to the global ids.
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

function ensureDirs() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function loadState(): State {
  ensureDirs();
  try {
    return migrate(JSON.parse(fs.readFileSync(STATE_FILE, "utf8")));
  } catch {
    return { hos: defaultHos(), modules: [], updatedAt: "" };
  }
}

function saveState(s: State) {
  ensureDirs();
  s.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

function publicState(s: State) {
  return {
    hos: s.hos,
    updatedAt: s.updatedAt,
    modules: s.modules.map((m) => ({
      id: m.id,
      name: m.name,
      status: m.status,
      pcs: m.pcs.map((p) => ({
        id: p.id,
        name: p.name,
        photo: p.photo,
        hoId: p.hoId,
        card: p.card ? { name: p.card.name, sizeBytes: p.card.sizeBytes } : null,
      })),
    })),
  };
}

function json(res: any, code: number, obj: unknown) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function readBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 40 * 1024 * 1024) {
        reject(new Error("请求过大"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req: any): Promise<any> {
  const buf = await readBody(req);
  if (!buf.length) return {};
  return JSON.parse(buf.toString("utf8"));
}

function findModule(state: State, id: string) {
  return state.modules.find((m) => m.id === id);
}

async function handle(req: any, res: any, url: string) {
  const method = req.method || "GET";
  const seg = url.split("/").filter(Boolean); // ["api", ...]
  const ct = String(req.headers["content-type"] || "");
  const body =
    method === "GET" || method === "DELETE" || !ct.includes("application/json")
      ? {}
      : await readJson(req);
  const state = loadState();

  // GET /api/state
  if (method === "GET" && seg.length === 2 && seg[1] === "state") {
    return json(res, 200, publicState(state));
  }

  // GET /api/cards/:pcId — download the linked card file
  if (method === "GET" && seg.length === 3 && seg[1] === "cards") {
    const pcId = decodeURIComponent(seg[2]);
    for (const m of state.modules) {
      for (const p of m.pcs) {
        if (p.id === pcId && p.card) {
          const file = path.join(UPLOAD_DIR, path.basename(p.card.storedName));
          if (!fs.existsSync(file)) return json(res, 404, { error: "文件不存在" });
          res.statusCode = 200;
          res.setHeader(
            "Content-Disposition",
            `attachment; filename*=UTF-8''${encodeURIComponent(p.card.name)}`
          );
          res.setHeader("Content-Type", "application/octet-stream");
          return fs.createReadStream(file).pipe(res);
        }
      }
    }
    return json(res, 404, { error: "未找到角色卡" });
  }

  // POST /api/hos  { name? } — add a global HO column
  if (method === "POST" && seg.length === 2 && seg[1] === "hos") {
    let name = String(body.name || "").trim();
    if (!name) name = `HO${state.hos.length + 1}`;
    const ho: Ho = { id: uid("h"), name };
    state.hos.push(ho);
    saveState(state);
    return json(res, 200, { ho });
  }

  // PATCH /api/hos/:id  { name }
  if (method === "PATCH" && seg.length === 3 && seg[1] === "hos") {
    const ho = state.hos.find((h) => h.id === decodeURIComponent(seg[2]));
    if (!ho) return json(res, 404, { error: "栏目不存在" });
    if (typeof body.name === "string" && body.name.trim()) ho.name = body.name.trim();
    saveState(state);
    return json(res, 200, { ho });
  }

  // DELETE /api/hos/:id
  if (method === "DELETE" && seg.length === 3 && seg[1] === "hos") {
    const hoId = decodeURIComponent(seg[2]);
    state.hos = state.hos.filter((h) => h.id !== hoId);
    for (const m of state.modules) for (const p of m.pcs) if (p.hoId === hoId) p.hoId = null;
    saveState(state);
    return json(res, 200, { ok: true });
  }

  // PUT /api/hos/order  { hoIds: string[] }
  if (method === "PUT" && seg.length === 3 && seg[1] === "hos" && seg[2] === "order") {
    const ids: string[] = Array.isArray(body.hoIds) ? body.hoIds.map((x: unknown) => String(x)) : [];
    const ranked = new Map<string, number>(ids.map((id, i) => [id, i] as [string, number]));
    state.hos.sort((a, b) => (ranked.get(a.id) ?? 999) - (ranked.get(b.id) ?? 999));
    saveState(state);
    return json(res, 200, { hos: state.hos });
  }

  // POST /api/modules
  if (method === "POST" && seg.length === 2 && seg[1] === "modules") {
    const name = String(body.name || "").trim() || "未命名模组";
    const status = STATUSES.includes(body.status) ? (body.status as Status) : "planned";
    const mod: Module = { id: uid("m"), name, status, pcs: [] };
    state.modules.push(mod);
    saveState(state);
    return json(res, 200, { module: mod });
  }

  // PATCH /api/modules/:id  { status?, name? }
  if (method === "PATCH" && seg.length === 3 && seg[1] === "modules") {
    const m = findModule(state, decodeURIComponent(seg[2]));
    if (!m) return json(res, 404, { error: "模组不存在" });
    if (body.status && STATUSES.includes(body.status)) m.status = body.status;
    if (typeof body.name === "string" && body.name.trim()) m.name = body.name.trim();
    saveState(state);
    return json(res, 200, { module: m });
  }

  // DELETE /api/modules/:id
  if (method === "DELETE" && seg.length === 3 && seg[1] === "modules") {
    const id = decodeURIComponent(seg[2]);
    const m = findModule(state, id);
    if (m) {
      for (const p of m.pcs) {
        if (p.card) {
          const f = path.join(UPLOAD_DIR, path.basename(p.card.storedName));
          try { fs.unlinkSync(f); } catch { /* ignore */ }
        }
      }
    }
    state.modules = state.modules.filter((x) => x.id !== id);
    saveState(state);
    return json(res, 200, { ok: true });
  }

  // POST /api/modules/:id/pcs
  if (method === "POST" && seg.length === 4 && seg[1] === "modules" && seg[3] === "pcs") {
    const m = findModule(state, decodeURIComponent(seg[2]));
    if (!m) return json(res, 404, { error: "模组不存在" });
    const name = String(body.name || "").trim() || "未命名 PC";
    const pc: Pc = { id: uid("p"), name, photo: null, card: null, hoId: null };
    m.pcs.push(pc);
    saveState(state);
    return json(res, 200, { pc });
  }

  // PATCH /api/modules/:id/pcs/:pcId  { name?, hoId? }
  if (method === "PATCH" && seg.length === 5 && seg[1] === "modules") {
    const m = findModule(state, decodeURIComponent(seg[2]));
    const p = m?.pcs.find((x) => x.id === decodeURIComponent(seg[4]));
    if (!m || !p) return json(res, 404, { error: "PC 不存在" });
    if (typeof body.name === "string" && body.name.trim()) p.name = body.name.trim();
    if (body.hoId === null) p.hoId = null;
    else if (typeof body.hoId === "string" && state.hos.some((h) => h.id === body.hoId)) {
      p.hoId = body.hoId;
    }
    saveState(state);
    return json(res, 200, { pc: p });
  }

  // DELETE /api/modules/:id/pcs/:pcId
  if (method === "DELETE" && seg.length === 5 && seg[1] === "modules") {
    const m = findModule(state, decodeURIComponent(seg[2]));
    const p = m?.pcs.find((x) => x.id === decodeURIComponent(seg[4]));
    if (!m || !p) return json(res, 404, { error: "PC 不存在" });
    if (p.card) {
      const f = path.join(UPLOAD_DIR, path.basename(p.card.storedName));
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
    m.pcs = m.pcs.filter((x) => x.id !== p.id);
    saveState(state);
    return json(res, 200, { ok: true });
  }

  // PUT /api/modules/:id/pcs/:pcId/photo  { photo: dataURL | null }
  if (method === "PUT" && seg.length === 6 && seg[5] === "photo") {
    const m = findModule(state, decodeURIComponent(seg[2]));
    const p = m?.pcs.find((x) => x.id === decodeURIComponent(seg[4]));
    if (!p) return json(res, 404, { error: "PC 不存在" });
    p.photo = typeof body.photo === "string" && body.photo ? body.photo : null;
    saveState(state);
    return json(res, 200, { ok: true });
  }

  // PUT /api/modules/:id/pcs/:pcId/card
  // raw binary body (Content-Type: application/octet-stream, X-File-Name header)
  // or legacy JSON { name, data(base64) }
  if (method === "PUT" && seg.length === 6 && seg[5] === "card") {
    const m = findModule(state, decodeURIComponent(seg[2]));
    const p = m?.pcs.find((x) => x.id === decodeURIComponent(seg[4]));
    if (!p) return json(res, 404, { error: "PC 不存在" });
    let name: string;
    let buf: Buffer;
    if (ct.includes("application/octet-stream")) {
      const rawBody = await readBody(req);
      if (!rawBody.length) return json(res, 400, { error: "缺少文件内容" });
      const hdr = String(req.headers["x-file-name"] || "card.xlsx");
      try {
        name = decodeURIComponent(hdr) || "card.xlsx";
      } catch {
        name = "card.xlsx";
      }
      buf = rawBody;
    } else {
      name = String(body.name || "card.xlsx");
      const data = String(body.data || "");
      if (!data) return json(res, 400, { error: "缺少文件内容" });
      buf = Buffer.from(data, "base64");
    }
    const storedName = p.id + "_" + Date.now() + "_" + path.basename(name).replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
    fs.writeFileSync(path.join(UPLOAD_DIR, storedName), buf);
    if (p.card) {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(p.card.storedName))); } catch { /* ignore */ }
    }
    p.card = { name, sizeBytes: buf.length, storedName };
    saveState(state);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "未知接口" });
}

export function cocApi(): Plugin {
  return {
    name: "coc-modules-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || "").split("?")[0];
        if (!url.startsWith("/api/")) return next();
        handle(req, res, url).catch((err) => {
          res.statusCode = 500;
          json(res, 500, { error: String((err && err.message) || err) });
        });
      });
    },
  };
}
