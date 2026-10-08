import type { Plugin } from "vite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "server-data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

type Status = "planned" | "ongoing" | "finished";
type CardMeta = { name: string; sizeBytes: number; storedName: string };
type Ho = { id: string; name: string };
type Pc = { id: string; name: string; photo: string | null; card: CardMeta | null; hoId: string | null };
type Module = { id: string; name: string; status: Status; hos: Ho[]; pcs: Pc[] };
type State = { modules: Module[]; updatedAt: string };

const STATUSES: Status[] = ["planned", "ongoing", "finished"];

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

function ensureDirs() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function loadState(): State {
  ensureDirs();
  try {
    return migrate(JSON.parse(fs.readFileSync(STATE_FILE, "utf8")));
  } catch {
    return { modules: [], updatedAt: "" };
  }
}

function saveState(s: State) {
  ensureDirs();
  s.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

// strip internal storage names before sending state to the client
function publicState(s: State) {
  return {
    updatedAt: s.updatedAt,
    modules: s.modules.map((m) => ({
      id: m.id,
      name: m.name,
      status: m.status,
      hos: m.hos,
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

function uid(prefix: string) {
  return prefix + "_" + crypto.randomBytes(5).toString("hex");
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
function findPc(state: State, moduleId: string, pcId: string) {
  const m = findModule(state, moduleId);
  if (!m) return { m: undefined, p: undefined };
  return { m, p: m.pcs.find((p) => p.id === pcId) };
}

async function handle(req: any, res: any, url: string) {
  const method = req.method || "GET";
  const seg = url.split("/").filter(Boolean); // ["api", ...]
  const body = method === "GET" || method === "DELETE" ? {} : await readJson(req);
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

  // POST /api/modules
  if (method === "POST" && seg.length === 2 && seg[1] === "modules") {
    const name = String(body.name || "").trim() || "未命名模组";
    const status = STATUSES.includes(body.status) ? (body.status as Status) : "planned";
    const mod: Module = { id: uid("m"), name, status, hos: defaultHos(), pcs: [] };
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

  // POST /api/modules/:id/hos  { name? } — add an HO column
  if (method === "POST" && seg.length === 4 && seg[1] === "modules" && seg[3] === "hos") {
    const m = findModule(state, decodeURIComponent(seg[2]));
    if (!m) return json(res, 404, { error: "模组不存在" });
    let name = String(body.name || "").trim();
    if (!name) name = `HO${m.hos.length + 1}`;
    const ho: Ho = { id: uid("h"), name };
    m.hos.push(ho);
    saveState(state);
    return json(res, 200, { ho });
  }

  // PATCH /api/modules/:id/hos/:hoId  { name }
  if (method === "PATCH" && seg.length === 5 && seg[1] === "modules" && seg[3] === "hos") {
    const m = findModule(state, decodeURIComponent(seg[2]));
    const ho = m?.hos.find((h) => h.id === decodeURIComponent(seg[4]));
    if (!m || !ho) return json(res, 404, { error: "栏目不存在" });
    if (typeof body.name === "string" && body.name.trim()) ho.name = body.name.trim();
    saveState(state);
    return json(res, 200, { ho });
  }

  // DELETE /api/modules/:id/hos/:hoId
  if (method === "DELETE" && seg.length === 5 && seg[1] === "modules" && seg[3] === "hos") {
    const m = findModule(state, decodeURIComponent(seg[2]));
    if (!m) return json(res, 404, { error: "模组不存在" });
    const hoId = decodeURIComponent(seg[4]);
    m.hos = m.hos.filter((h) => h.id !== hoId);
    for (const p of m.pcs) if (p.hoId === hoId) p.hoId = null;
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
    else if (typeof body.hoId === "string" && m.hos.some((h) => h.id === body.hoId)) {
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
    const { p } = findPc(state, decodeURIComponent(seg[2]), decodeURIComponent(seg[4]));
    if (!p) return json(res, 404, { error: "PC 不存在" });
    p.photo = typeof body.photo === "string" && body.photo ? body.photo : null;
    saveState(state);
    return json(res, 200, { ok: true });
  }

  // PUT /api/modules/:id/pcs/:pcId/card  { name, data(base64), sizeBytes }
  if (method === "PUT" && seg.length === 6 && seg[5] === "card") {
    const { p } = findPc(state, decodeURIComponent(seg[2]), decodeURIComponent(seg[4]));
    if (!p) return json(res, 404, { error: "PC 不存在" });
    const name = String(body.name || "card.xlsx");
    const data = String(body.data || "");
    if (!data) return json(res, 400, { error: "缺少文件内容" });
    const buf = Buffer.from(data, "base64");
    const storedName = p.id + "_" + Date.now() + "_" + path.basename(name).replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
    fs.writeFileSync(path.join(UPLOAD_DIR, storedName), buf);
    if (p.card) {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(p.card.storedName))); } catch { /* ignore */ }
    }
    p.card = { name, sizeBytes: buf.length, storedName };
    saveState(state);
    return json(res, 200, { ok: true });
  }

  // DELETE /api/modules/:id/pcs/:pcId/card
  if (method === "DELETE" && seg.length === 6 && seg[5] === "card") {
    const { p } = findPc(state, decodeURIComponent(seg[2]), decodeURIComponent(seg[4]));
    if (!p) return json(res, 404, { error: "PC 不存在" });
    if (p.card) {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(p.card.storedName))); } catch { /* ignore */ }
    }
    p.card = null;
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
