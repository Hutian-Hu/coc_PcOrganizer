// One-click export of the HO board as a long PNG image.
// Only HO columns that actually contain PCs are exported (plus 未分配 if non-empty).

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
  type Col = {
    title: string;
    color: string; // css color or "hsl(var(--muted))"
    groups: { name: string; status: Status; pcs: { name: string; photo: string | null; cardName: string | null }[] }[];
  };

  const cols: Col[] = [];
  state.hos.forEach((ho, i) => {
    const groups = state.modules
      .map((m) => ({
        name: m.name,
        status: m.status,
        pcs: m.pcs
          .filter((p) => p.hoId === ho.id)
          .map((p) => ({ name: p.name, photo: p.photo, cardName: p.card?.name ?? null })),
      }))
      .filter((g) => g.pcs.length > 0);
    const total = groups.reduce((n, g) => n + g.pcs.length, 0);
    if (total > 0) {
      cols.push({
        title: ho.name,
        color: `hsl(${cssVar(`--ho-${(i % 4) + 1}`)})`,
        groups,
      });
    }
  });
  const un = state.modules
    .map((m) => ({
      name: m.name,
      status: m.status,
      pcs: m.pcs
        .filter((p) => !p.hoId)
        .map((p) => ({ name: p.name, photo: p.photo, cardName: p.card?.name ?? null })),
    }))
    .filter((g) => g.pcs.length > 0);
  if (un.length > 0) {
    cols.push({ title: "未分配", color: cssVar("--border") || "#ccc", groups: un });
  }
  if (!cols.length) return false;

  // pre-load photos
  const photos = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    cols.flatMap((c) =>
      c.groups.flatMap((g) =>
        g.pcs.map(async (p) => {
          if (p.photo) photos.set(p.name + p.cardName, await loadImg(p.photo));
        })
      )
    )
  );

  const font = (size: number, weight = 400) => `${weight} ${size}px 'PingFang SC','Hiragino Sans GB',sans-serif`;

  // measure height
  let H = PAD;
  for (const col of cols) {
    H += 38; // section header
    for (const g of col.groups) {
      H += 30; // module line
      H += Math.ceil(g.pcs.length / 3) * (CARD_H + 10) + 8;
    }
    H += 18;
  }
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
    const total = col.groups.reduce((n, g) => n + g.pcs.length, 0);
    ctx.textAlign = "right";
    ctx.font = font(12);
    ctx.fillText(`${total} 个 PC`, W - PAD - 14, y + 16);
    ctx.textAlign = "left";
    y += 38;

    for (const g of col.groups) {
      // module line: dot + name + status
      ctx.fillStyle = `hsl(${STATUS_DOT[g.status]})`;
      ctx.beginPath();
      ctx.arc(PAD + 6, y + 11, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.font = font(13, 600);
      ctx.fillText(g.name, PAD + 18, y + 12);
      const nameW = ctx.measureText(g.name).width;
      ctx.fillStyle = STATUS_TEXT_COLOR[g.status];
      ctx.font = font(11);
      ctx.fillText(`· ${STATUS_TEXT[g.status]}`, PAD + 18 + nameW + 6, y + 12);
      y += 26;

      // pc cards, 3 per row
      g.pcs.forEach((p, i) => {
        const cx = PAD + (i % 3) * (CARD_W + 8);
        const cy = y + Math.floor(i / 3) * (CARD_H + 10);
        ctx.fillStyle = cardBg;
        rr(ctx, cx, cy, CARD_W, CARD_H, 10);
        ctx.fill();
        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        rr(ctx, cx + 0.5, cy + 0.5, CARD_W - 1, CARD_H - 1, 10);
        ctx.stroke();

        const img = p.photo ? photos.get(p.name + p.cardName) : null;
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
      });
      y += Math.ceil(g.pcs.length / 3) * (CARD_H + 10) + 8;
    }
    y += 18;
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
