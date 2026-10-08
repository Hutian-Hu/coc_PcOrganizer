// exceljs-based xlsx handling:
// - buildSheetRender: turn a worksheet into a style-preserving grid model
//   (fills, fonts, borders, alignment, merges, column widths / row heights)
// - extractAttrs: pull the 9 CoC characteristics out of a character sheet
// exceljs is imported dynamically so it lands in its own async chunk.

import type ExcelJS from "exceljs";

export type PcAttr = { label: string; value: number; half: number; fifth: number };

export type CellStyle = Record<string, string | number>;
export type CellView = { v: string; style?: CellStyle; colspan?: number; rowspan?: number };
export type RowView = { h?: number; cells: (CellView | null)[] };
export type SheetRender = { name: string; cols: number[]; rows: RowView[]; truncated: boolean };

export type Book = ExcelJS.Workbook;

const MAX_COLS = 120;
const MAX_ROWS = 220;

// 估算文本渲染宽度：CJK 全角 ≈ fontSize，ASCII ≈ 0.56 fontSize
function textWidthPx(s: string, fontSize: number): number {
  let w = 0;
  for (const ch of s) {
    w += /[\u2e80-\u9fff\u3000-\u303f\uf900-\ufaff\uff00-\uffef]/.test(ch) ? fontSize : fontSize * 0.56;
  }
  return w;
}

export async function loadBook(buf: ArrayBuffer): Promise<Book> {
  const ExcelJSMod = (await import("exceljs")).default;
  const wb = new ExcelJSMod.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

/* ---------- helpers ---------- */

function colToNum(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function decodeAddr(addr: string): { c: number; r: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(addr.trim());
  if (!m) return { c: 1, r: 1 };
  return { c: colToNum(m[1]), r: parseInt(m[2], 10) };
}

function argbToCss(color: unknown): string | undefined {
  if (!color) return undefined;
  let hex = typeof color === "string" ? color : (color as { argb?: string }).argb;
  if (!hex || typeof hex !== "string") return undefined;
  hex = hex.replace(/^#/, "");
  if (hex.length === 8) {
    if (hex.slice(0, 2) === "00") return undefined; // "auto" color
    hex = hex.slice(2);
  }
  if (hex.length !== 6) return undefined;
  return "#" + hex.toLowerCase();
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return `${v.getFullYear()}/${v.getMonth() + 1}/${v.getDate()}`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((t) => t.text ?? "").join("");
    }
    if ("result" in o) {
      const r = o.result;
      if (typeof r === "number") return String(Math.round(r * 1000) / 1000);
      return r === null || r === undefined ? "" : String(r);
    }
    if (typeof o.text === "string") return o.text;
    if (typeof o.error === "string") return o.error;
    if ("formula" in o || "sharedFormula" in o) return "";
  }
  if (typeof v === "number") return String(Math.round(v * 1000) / 1000);
  return String(v);
}

function cellStyle(cell: ExcelJS.Cell): CellStyle | undefined {
  const st = cell.style as ExcelJS.Style | undefined;
  if (!st) return undefined;
  const parts: CellStyle = {};

  const fill = st.fill as ExcelJS.Fill | undefined;
  if (fill && fill.type === "pattern") {
    const f = fill as ExcelJS.FillPattern;
    if (f.pattern === "solid") {
      const bg = argbToCss(f.fgColor);
      if (bg) parts.background = bg;
    }
  }

  const font = st.font as ExcelJS.Font | undefined;
  if (font) {
    const c = argbToCss(font.color);
    if (c) parts.color = c;
    if (font.bold) parts.fontWeight = 700;
    if (font.italic) parts.fontStyle = "italic";
    if (typeof font.size === "number" && font.size > 0) {
      parts.fontSize = Math.round((font.size * 4) / 3 * 10) / 10;
    }
    if (font.name) parts.fontFamily = `'${font.name}','PingFang SC',sans-serif`;
  }

  const al = st.alignment as ExcelJS.Alignment | undefined;
  if (al) {
    if (al.horizontal) parts.textAlign = al.horizontal as string;
    if (al.vertical) parts.verticalAlign = al.vertical === "distributed" ? "middle" : (al.vertical as string);
    if (al.wrapText) parts.whiteSpace = "pre-wrap";
  }

  const b = st.border as { left?: { style?: string; color?: unknown }; right?: { style?: string; color?: unknown }; top?: { style?: string; color?: unknown }; bottom?: { style?: string; color?: unknown } } | undefined;
  if (b) {
    const sides: [string, { style?: string; color?: unknown } | undefined][] = [
      ["left", b.left],
      ["right", b.right],
      ["top", b.top],
      ["bottom", b.bottom],
    ];
    for (const [side, bd] of sides) {
      if (!bd || !bd.style) continue;
      const c = argbToCss(bd.color) || "#a0a0a0";
      const w =
        bd.style === "thick" ? 2 : bd.style === "medium" ? 1.5 : bd.style === "double" ? 2 : bd.style === "thin" ? 1 : 0.5;
      const dash = bd.style === "dashed" || bd.style === "dashDot" || bd.style === "dashDotDot" ? "dashed" : bd.style === "dotted" || bd.style === "hair" ? "dotted" : "solid";
      parts["border" + side[0].toUpperCase() + side.slice(1)] = `${w}px ${dash} ${c}`;
    }
  }

  return Object.keys(parts).length ? parts : undefined;
}

/* ---------- styled sheet rendering ---------- */

export function buildSheetRender(ws: ExcelJS.Worksheet): SheetRender {
  const lastRow = Math.min(ws.rowCount || 0, MAX_ROWS);
  const lastCol = Math.min(ws.columnCount || 0, MAX_COLS);

  const covered = new Set<string>();
  const spans = new Map<string, { cs: number; rs: number }>();
  const merges: string[] = ((ws.model as { merges?: string[] })?.merges) ?? [];
  for (const m of merges) {
    const [a, b] = m.split(":");
    if (!a || !b) continue;
    const tl = decodeAddr(a);
    const br = decodeAddr(b);
    if (tl.r > lastRow || tl.c > lastCol) continue;
    spans.set(`${tl.r}:${tl.c}`, {
      cs: Math.min(br.c, lastCol) - tl.c + 1,
      rs: Math.min(br.r, lastRow) - tl.r + 1,
    });
    for (let r = tl.r; r <= Math.min(br.r, lastRow); r++) {
      for (let c = tl.c; c <= Math.min(br.c, lastCol); c++) {
        if (r !== tl.r || c !== tl.c) covered.add(`${r}:${c}`);
      }
    }
  }

  const cols: number[] = [];
  for (let c = 1; c <= lastCol; c++) {
    const col = ws.getColumn(c);
    const w = typeof col.width === "number" && col.width > 0 ? Math.round(col.width * 7) + 5 : 64;
    cols.push(Math.min(w, 280));
  }

  const rows: RowView[] = [];
  const contentW: number[] = new Array(lastCol).fill(0); // 每列内容实际所需宽度
  for (let r = 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const h = typeof row.height === "number" && row.height > 0 ? Math.round((row.height * 4) / 3) : undefined;
    const cells: (CellView | null)[] = [];
    for (let c = 1; c <= lastCol; c++) {
      if (covered.has(`${r}:${c}`)) {
        cells.push(null); // absorbed by a rowspan/colspan master
        continue;
      }
      const cell = row.getCell(c);
      const span = spans.get(`${r}:${c}`);
      const view: CellView = { v: cellText(cell) };
      const st = cellStyle(cell);
      if (st) view.style = st;
      if (view.v) {
        const fs = typeof st?.fontSize === "number" ? st.fontSize : 12;
        const cs = span ? span.cs : 1;
        const per = (textWidthPx(view.v, fs) + 14) / cs;
        for (let k = 0; k < cs && c - 1 + k < lastCol; k++) {
          if (per > contentW[c - 1 + k]) contentW[c - 1 + k] = per;
        }
      }
      if (span) {
        view.colspan = span.cs;
        view.rowspan = span.rs;
      }
      cells.push(view);
    }
    rows.push({ h, cells });
  }

  // 列宽按内容收缩：空列/内容短的列不再占用文件里声明的超大宽度，
  // 避免整张表被空白列拉宽（超出部分由单元格省略号折叠）
  for (let c = 0; c < lastCol; c++) {
    const want = contentW[c];
    cols[c] = want <= 0 ? Math.min(cols[c], 12) : Math.max(26, Math.min(cols[c], Math.max(want, 40)));
  }

  // 裁掉尾部连续空列（文本层面，留 1 列余量），空白不再把整张表撑宽
  let lastContent = -1;
  for (const row of rows) {
    for (let i = 0; i < row.cells.length; i++) {
      const cell = row.cells[i];
      if (cell && cell.v.trim()) lastContent = Math.max(lastContent, i);
    }
  }
  const keep = Math.min(lastCol, Math.max(lastContent + 2, 1));
  if (keep < lastCol) {
    cols.length = keep;
    for (const row of rows) row.cells.length = keep;
  }

  const truncated = (ws.rowCount || 0) > lastRow || (ws.columnCount || 0) > lastCol;
  return { name: ws.name, cols, rows, truncated };
}

/* ---------- characteristic extraction ---------- */

const ATTR_KEYS: { en: string; zh: string; alt?: string }[] = [
  { en: "STR", zh: "力量" },
  { en: "CON", zh: "体质" },
  { en: "SIZ", zh: "体型" },
  { en: "DEX", zh: "敏捷" },
  { en: "APP", zh: "外貌" },
  { en: "INT", zh: "智力", alt: "灵感" },
  { en: "POW", zh: "意志" },
  { en: "EDU", zh: "教育" },
  { en: "Luck", zh: "幸运" },
];

function matchKey(label: string): number {
  const t = label.toLowerCase();
  for (let i = 0; i < ATTR_KEYS.length; i++) {
    const k = ATTR_KEYS[i];
    if (t.includes(k.en.toLowerCase()) || label.includes(k.zh) || (k.alt && label.includes(k.alt))) return i;
  }
  return 99;
}

export function extractAttrsFromBook(wb: Book): PcAttr[] | null {
  let best: PcAttr[] = [];
  for (const ws of wb.worksheets) {
    if ((ws.state as string | undefined) && ws.state !== "visible") continue;
    const found = new Map<number, PcAttr>();
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const t = cellText(cell).replace(/\s+/g, " ").trim();
        if (!t || t.length > 30) return;
        const ki = matchKey(t);
        if (ki === 99 || found.has(ki)) return;
        // value: first numeric cell within 3 columns to the right of the label
        let value: number | null = null;
        const labelCol = Number(cell.col);
        for (let cc = labelCol + 1; cc <= labelCol + 3 && value === null; cc++) {
          const v = row.getCell(cc).value as unknown;
          let n: number | null = null;
          if (typeof v === "number") n = v;
          else if (v && typeof v === "object" && typeof (v as { result?: unknown }).result === "number") {
            n = (v as { result: number }).result;
          }
          if (n !== null && Number.isFinite(n)) value = n;
        }
        if (value === null) return;
        found.set(ki, { label: t, value, half: Math.floor(value / 2), fifth: Math.floor(value / 5) });
      });
    });
    if (found.size > best.length) best = [...found.values()];
  }
  // 兜底：部分卡片的幸运没有「幸运/Luck」标签，数值放在 N10:O11 区域
  if (!best.some((a) => /luck|幸运/i.test(a.label))) {
    for (const ws of wb.worksheets) {
      if ((ws.state as string | undefined) && ws.state !== "visible") continue;
      let luck: number | null = null;
      for (let r = 10; r <= 11 && luck === null; r++) {
        for (let c = 14; c <= 15 && luck === null; c++) {
          const v = ws.getRow(r).getCell(c).value as unknown;
          let n: number | null = null;
          if (typeof v === "number") n = v;
          else if (v && typeof v === "object" && typeof (v as { result?: unknown }).result === "number") {
            n = (v as { result: number }).result;
          }
          if (n !== null && Number.isFinite(n)) luck = n;
        }
      }
      if (luck !== null) {
        best.push({ label: "幸运", value: luck, half: Math.floor(luck / 2), fifth: Math.floor(luck / 5) });
        break;
      }
    }
  }
  best.sort((a, b) => matchKey(a.label) - matchKey(b.label));
  return best.length >= 5 ? best : null;
}

export async function extractAttrs(buf: ArrayBuffer): Promise<PcAttr[] | null> {
  try {
    const wb = await loadBook(buf);
    return extractAttrsFromBook(wb);
  } catch {
    return null;
  }
}
