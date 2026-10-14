// One-click export of the HO board as a long PNG image.
// Only HO columns that actually contain PCs are exported (plus 未分配 if non-empty).
// HO columns are laid out 2–3 per row (side by side); within a column, cards are
// stacked in the column's display order and a module line is drawn whenever
// consecutive cards belong to different modules.

import type { State, Status } from "./storage";

const STATUS_TEXT: Record<Status, string> = {
  planned: "卫星中",
  ongoing: "进行中",
  paused: "暂停中",
  disbanded: "已散桌",
  finished: "已结团",
};

const STATUS_DOT: Record<Status, string> = {
  planned: "9 20% 66%",
  ongoing: "96 14% 45%",
  paused: "205 16% 66%",
  disbanded: "285 9% 60%",
  finished: "40 6% 58%",
};

const STATUS_TEXT_COLOR: Record<Status, string> = {
  planned: "#8f4a3e",
  ongoing: "#3f5a37",
  paused: "#3d5566",
  disbanded: "#574a63",
  finished: "#5f584c",
};

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

const W = 680;
const PAD = 24;
const GAP = 12;
const CARD_H = 72;
const PHOTO = 48;
const S = 2; // retina scale

export async function exportBoardImage(state: State): Promise<boolean> {
  type Entry = {
    key: string;
    name: string;
    photo: string | null;
    cardName: string | null;
    moduleName: string;
    moduleStatus: Status;
  };
  type Col = {
    title: string;
    color: string;
    pcs: Entry[];
  };

  const rank = new Map<string, number>();
  (state.pcOrder ?? []).forEach((id, i) => rank.set(id, i));
  const rankOf = (id: string) => rank.get(id) ?? 99999;

  // flat list of PCs for a predicate, in global display order
  const flatOf = (pred: (hoId: string | null) => boolean): Entry[] =>
    state.modules
      .flatMap((m) =>
        m.pcs
          .filter((p) => pred(p.hoId))
          .map((p) => ({
            key: p.id,
            name: p.name,
            photo: p.photo,
            cardName: p.card?.name ?? null,
            moduleName: m.name,
            moduleStatus: m.status,
          }))
      )
      .sort((a, b) => rankOf(a.key) - rankOf(b.key));

  const cols: Col[] = [];
  state.hos.forEach((ho, i) => {
    const pcs = flatOf((hoId) => hoId === ho.id);
    if (pcs.length > 0) {
      cols.push({
        title: ho.name,
        color: `hsl(${cssVar(`--ho-${(i % 4) + 1}`)})`,
        pcs,
      });
    }
  });
  const un = flatOf((hoId) => !hoId);
  if (un.length > 0) {
    cols.push({ title: "未分配", color: cssVar("--border") || "#ccc", pcs: un });
  }
  if (!cols.length) return false;

  // pre-load photos
  const photos = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    cols.flatMap((c) =>
      c.pcs.map(async (p) => {
        if (p.photo) photos.set(p.key, await loadImg(p.photo));
      })
    )
  );

  const font = (size: number, weight = 400) => `${weight} ${size}px 'PingFang SC','Hiragino Sans GB',sans-serif`;

  // 2–3 HO columns per row, side by side
  const perRow = cols.length >= 3 ? 3 : cols.length >= 2 ? 2 : 1;
  const COL_W = (W - PAD * 2 - GAP * (perRow - 1)) / perRow;

  // height of one HO column: header + stacked cards (+ module lines)
  const colHeight = (pcs: Entry[]): number => {
    let h = 38; // section header
    for (let i = 0; i < pcs.length; i++) {
      if (i === 0 || pcs[i].moduleName !== pcs[i - 1].moduleName) h += 24;
      h += CARD_H + 8;
    }
    return h + 8;
  };

  // group columns into rows and measure total height
  const rows: { cols: Col[]; height: number }[] = [];
  for (let i = 0; i < cols.length; i += perRow) {
    const slice = cols.slice(i, i + perRow);
    rows.push({ cols: slice, height: Math.max(...slice.map((c) => colHeight(c.pcs))) });
  }
  let H = PAD;
  for (const r of rows) H += r.height + 16;
  H += PAD - 16;

  const canvas = document.createElement("canvas");
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(S, S);

  const bg = `hsl(${cssVar("--background")})`;
  const cardBg = `hsl(${cssVar("--card")})`;
  const fg = `hsl(${cssVar("--foreground")})`;
  const muted = `hsl(${cssVar("--muted-foreground")})`;
  const border = `hsl(${cssVar("--border")})`;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const drawModuleLine = (x: number, y: number, name: string, st: Status) => {
    ctx.fillStyle = `hsl(${STATUS_DOT[st]})`;
    ctx.beginPath();
    ctx.arc(x + 5, y + 10, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.font = font(12, 600);
    ctx.fillText(name, x + 14, y + 11);
    const nameW = ctx.measureText(name).width;
    ctx.fillStyle = STATUS_TEXT_COLOR[st];
    ctx.font = font(10);
    ctx.fillText(`· ${STATUS_TEXT[st]}`, x + 14 + nameW + 5, y + 11);
  };

  const drawCard = (cx: number, cy: number, p: Entry) => {
    ctx.fillStyle = cardBg;
    rr(ctx, cx, cy, COL_W, CARD_H, 9);
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    rr(ctx, cx + 0.5, cy + 0.5, COL_W - 1, CARD_H - 1, 9);
    ctx.stroke();

    const img = p.photo ? photos.get(p.key) : null;
    const px = cx + 8;
    const py = cy + (CARD_H - PHOTO) / 2;
    if (img) {
      ctx.save();
      rr(ctx, px, py, PHOTO, PHOTO, 7);
      ctx.clip();
      const scale = Math.max(PHOTO / img.width, PHOTO / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, px + (PHOTO - dw) / 2, py + (PHOTO - dh) / 2, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = `hsl(${cssVar("--secondary")})`;
      rr(ctx, px, py, PHOTO, PHOTO, 7);
      ctx.fill();
      ctx.fillStyle = muted;
      ctx.font = font(16, 600);
      ctx.textAlign = "center";
      ctx.fillText(p.name.slice(0, 1) || "?", px + PHOTO / 2, py + PHOTO / 2 + 1);
      ctx.textAlign = "left";
    }

    ctx.fillStyle = fg;
    ctx.font = font(13, 600);
    const tx = px + PHOTO + 10;
    const maxW = COL_W - (tx - cx) - 8;
    let label = p.name;
    while (label.length > 1 && ctx.measureText(label).width > maxW) label = label.slice(0, -1);
    if (label !== p.name) label += "…";
    ctx.fillText(label, tx, cy + 24);
    ctx.font = font(10);
    ctx.fillStyle = muted;
    let sub = p.cardName ?? "未关联角色卡";
    while (sub.length > 1 && ctx.measureText(sub).width > maxW) sub = sub.slice(0, -1);
    if (sub !== (p.cardName ?? "未关联角色卡")) sub += "…";
    ctx.fillText(sub, tx, cy + 44);
  };

  let y = PAD;
  for (const row of rows) {
    row.cols.forEach((col, k) => {
      const x = PAD + k * (COL_W + GAP);
      let cy = y;
      // section header
      ctx.fillStyle = col.color;
      rr(ctx, x, cy, COL_W, 30, 9);
      ctx.fill();
      ctx.fillStyle = "#fdfcf8";
      ctx.font = font(14, 600);
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(col.title, x + 12, cy + 16);
      ctx.textAlign = "right";
      ctx.font = font(11);
      ctx.fillText(`${col.pcs.length} 个 PC`, x + COL_W - 10, cy + 16);
      ctx.textAlign = "left";
      cy += 38;

      for (let i = 0; i < col.pcs.length; i++) {
        if (i === 0 || col.pcs[i].moduleName !== col.pcs[i - 1].moduleName) {
          drawModuleLine(x + 2, cy, col.pcs[i].moduleName, col.pcs[i].moduleStatus);
          cy += 24;
        }
        drawCard(x, cy, col.pcs[i]);
        cy += CARD_H + 8;
      }
    });
    y += row.height + 16;
  }

  // footer
  ctx.fillStyle = muted;
  ctx.font = font(10);
  ctx.textAlign = "right";
  ctx.fillText(`TRPG PC整理工具 · ${new Date().toLocaleString()}`, W - PAD, H - 10);
  ctx.textAlign = "left";

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("图片生成失败");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `TRPG-PC看板-${new Date().toISOString().slice(0, 10)}.png`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
