// One-click export of the HO board as a long PNG image.
// Only HO columns that actually contain PCs are exported (plus 未分配 if non-empty).
// Cards are laid out flat in the column's display order; a module line is drawn
// whenever consecutive cards belong to different modules.

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
const CARD_W = (W - PAD * 2 - 16) / 3;
const CARD_H = 76;
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

  // measure height: walk rows; a module boundary costs 26px, each row CARD_H+10
  const colHeight = (pcs: Entry[]): number => {
    let h = 38; // section header
    let i = 0;
    while (i < pcs.length) {
      if (i === 0 || pcs[i].moduleName !== pcs[i - 1].moduleName) h += 26;
      const boundary = pcs[i].moduleName;
      let j = i;
      while (j < pcs.length && j - i < 3 && pcs[j].moduleName === boundary) j++;
      h += CARD_H + 10;
      i = j;
    }
    return h + 8 + 18;
  };
  let H = PAD;
  for (const col of cols) H += colHeight(col.pcs);
  H += PAD - 18;

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

  let y = PAD;
  for (const col of cols) {
    // section header
    ctx.fillStyle = col.color;
    rr(ctx, PAD, y, W - PAD * 2, 30, 9);
    ctx.fill();
    ctx.fillStyle = "#fdfcf8";
    ctx.font = font(15, 600);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(col.title, PAD + 14, y + 16);
    ctx.textAlign = "right";
    ctx.font = font(12);
    ctx.fillText(`${col.pcs.length} 个 PC`, W - PAD - 14, y + 16);
    ctx.textAlign = "left";
    y += 38;

    // draw cards row by row; module line at boundaries
    let i = 0;
    while (i < col.pcs.length) {
      if (i === 0 || col.pcs[i].moduleName !== col.pcs[i - 1].moduleName) {
        const st = col.pcs[i].moduleStatus;
        ctx.fillStyle = `hsl(${STATUS_DOT[st]})`;
        ctx.beginPath();
        ctx.arc(PAD + 6, y + 11, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = fg;
        ctx.font = font(13, 600);
        ctx.fillText(col.pcs[i].moduleName, PAD + 18, y + 12);
        const nameW = ctx.measureText(col.pcs[i].moduleName).width;
        ctx.fillStyle = STATUS_TEXT_COLOR[st];
        ctx.font = font(11);
        ctx.fillText(`· ${STATUS_TEXT[st]}`, PAD + 18 + nameW + 6, y + 12);
        y += 26;
      }
      const boundary = col.pcs[i].moduleName;
      let j = i;
      while (j < col.pcs.length && j - i < 3 && col.pcs[j].moduleName === boundary) j++;
      for (let k = i; k < j; k++) {
        const p = col.pcs[k];
        const cx = PAD + (k - i) * (CARD_W + 8);
        const cy = y;
        ctx.fillStyle = cardBg;
        rr(ctx, cx, cy, CARD_W, CARD_H, 10);
        ctx.fill();
        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        rr(ctx, cx + 0.5, cy + 0.5, CARD_W - 1, CARD_H - 1, 10);
        ctx.stroke();

        const img = p.photo ? photos.get(p.key) : null;
        const px = cx + 10;
        const py = cy + (CARD_H - 52) / 2;
        if (img) {
          ctx.save();
          rr(ctx, px, py, 52, 52, 8);
          ctx.clip();
          const scale = Math.max(52 / img.width, 52 / img.height);
          const dw = img.width * scale;
          const dh = img.height * scale;
          ctx.drawImage(img, px + (52 - dw) / 2, py + (52 - dh) / 2, dw, dh);
          ctx.restore();
        } else {
          ctx.fillStyle = `hsl(${cssVar("--secondary")})`;
          rr(ctx, px, py, 52, 52, 8);
          ctx.fill();
          ctx.fillStyle = muted;
          ctx.font = font(18, 600);
          ctx.textAlign = "center";
          ctx.fillText(p.name.slice(0, 1) || "?", px + 26, py + 28);
          ctx.textAlign = "left";
        }

        ctx.fillStyle = fg;
        ctx.font = font(14, 600);
        const tx = px + 62;
        const label = p.name.length > 9 ? p.name.slice(0, 9) + "…" : p.name;
        ctx.fillText(label, tx, cy + 26);
        ctx.font = font(11);
        ctx.fillStyle = muted;
        const sub = p.cardName
          ? p.cardName.length > 14
            ? p.cardName.slice(0, 14) + "…"
            : p.cardName
          : "未关联角色卡";
        ctx.fillText(sub, tx, cy + 48);
      }
      y += CARD_H + 10;
      i = j;
    }
    y += 8 + 18;
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
