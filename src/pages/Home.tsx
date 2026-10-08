import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Image as ImageIcon,
  FileSpreadsheet,
  Download,
  Eye,
  X,
  GripVertical,
  ChevronDown,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Users,
  Palette,
  FolderOpen,
  Sun,
  Moon,
  ImageDown,
} from "lucide-react";
import {
  type Status,
  type Ho,
  type Pc,
  type Module,
  type State,
  getState,
  addModule,
  setModuleStatus,
  renameModule,
  removeModule,
  addHo,
  renameHo,
  removeHo,
  reorderHos,
  addPc,
  renamePc,
  setPcHo,
  removePc,
  setPhoto,
  setCard,
  setPcAttrs,
  getCardArrayBuffer,
} from "@/lib/storage";
import { THEMES, applyTheme, getTheme, getMode, setMode, type ThemeName } from "@/lib/theme";
import { exportBoardImage } from "@/lib/exportImage";
import {
  loadBook,
  buildSheetRender,
  extractAttrs,
  type Book,
  type PcAttr,
  type SheetRender,
} from "@/lib/sheet";

const STATUS: Record<Status, string> = {
  planned: "卫星中",
  ongoing: "进行中",
  paused: "暂停中",
  disbanded: "已散桌",
  finished: "已结团",
};
const ORDER: Status[] = ["planned", "ongoing", "paused", "disbanded", "finished"];

type Run = (fn: () => Promise<unknown>, note?: string) => Promise<void>;

function fmtSize(n?: number) {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function Home() {
  const [state, setState] = useState<State>({ hos: [], modules: [], updatedAt: "" });
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: "error" | "info" } | null>(null);
  const [viewer, setViewer] = useState<{ src: string; name: string } | null>(null);
  const [preview, setPreview] = useState<{ pcName: string; book: Book } | null>(null);
  const [crop, setCrop] = useState<{ moduleId: string; pcId: string; file: File } | null>(null);
  const [newName, setNewName] = useState("");
  const [newStatus, setNewStatus] = useState<Status>("planned");
  const [dark, setDark] = useState(getMode() === "dark");
  const [exporting, setExporting] = useState(false);
  const msgTimer = useRef<number | null>(null);

  const say = useCallback((text: string, kind: "error" | "info" = "info") => {
    if (msgTimer.current) window.clearTimeout(msgTimer.current);
    setMsg({ text, kind });
    msgTimer.current = window.setTimeout(() => setMsg(null), 6000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setState(await getState());
    } catch (e) {
      say((e as Error).message, "error");
    }
  }, [say]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function run(fn: () => Promise<unknown>, note?: string) {
    setBusy(true);
    try {
      await fn();
      await refresh();
      if (note) say(note);
    } catch (e) {
      say((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function onExportImage() {
    if (exporting) return;
    setExporting(true);
    try {
      const ok = await exportBoardImage(state);
      say(ok ? "已导出长图（只含有内容的栏目）" : "看板还是空的，先添加一些 PC 吧");
    } catch (e) {
      say(`导出失败：${(e as Error).message}`, "error");
    } finally {
      setExporting(false);
    }
  }

  async function openPreview(pc: Pc) {
    if (!pc.card) return;
    try {
      const buf = await getCardArrayBuffer(pc.id);
      const book = await loadBook(buf);
      if (!book.worksheets.length) {
        say("这个表格是空的", "error");
        return;
      }
      setPreview({ pcName: pc.name, book });
    } catch (e) {
      say(`卡背打开失败：${(e as Error).message}`, "error");
    }
  }

  // one-time backfill: read attributes from already-uploaded cards
  const backfilled = useRef(new Set<string>());
  useEffect(() => {
    if (busy) return;
    (async () => {
      for (const m of state.modules) {
        for (const p of m.pcs) {
          if (!p.card || p.attrs || backfilled.current.has(p.id)) continue;
          backfilled.current.add(p.id);
          try {
            const attrs = await extractAttrs(await getCardArrayBuffer(p.id));
            if (attrs) {
              await setPcAttrs(m.id, p.id, attrs);
              await refresh();
            }
          } catch {
            /* 读取失败则跳过 */
          }
        }
      }
    })();
  }, [state, busy, refresh]);

  const counts: Record<Status, number> = { planned: 0, ongoing: 0, paused: 0, disbanded: 0, finished: 0 };
  state.modules.forEach((m) => counts[m.status]++);
  const visibleModules = state.modules.filter((m) => filter === "all" || m.status === filter);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-10 flex flex-col gap-4">
        <header className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-medium flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            TRPG PC整理工具
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {ORDER.map((s) => `${STATUS[s]} ${counts[s]}`).join(" · ")}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label={dark ? "切换为浅色模式" : "切换为深色模式"}
              title={dark ? "切换为浅色模式" : "切换为深色模式"}
              onClick={() => {
                const next = !dark;
                setDark(next);
                setMode(next ? "dark" : "light");
              }}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label="导出长图"
              title="导出有内容的 HO 栏目为长图"
              disabled={exporting}
              onClick={() => void onExportImage()}
            >
              <ImageDown className="h-4 w-4" />
            </Button>
            <ThemePicker />
            {busy && <span className="text-xs text-muted-foreground">保存中…</span>}
          </div>
        </header>

        {msg && (
          <div
            className={`text-sm rounded-lg px-3 py-2 ${
              msg.kind === "error"
                ? "text-destructive bg-destructive/10"
                : "text-muted-foreground bg-secondary/70"
            }`}
          >
            {msg.text}
          </div>
        )}

        <div className="flex gap-1.5 flex-wrap">
          {([{ key: "all", label: "全部" }] as { key: "all" | Status; label: string }[])
            .concat(ORDER.map((s) => ({ key: s as "all" | Status, label: STATUS[s] })))
            .map((t) => (
              <Badge
                key={t.key}
                variant={filter === t.key ? "default" : "outline"}
                className="cursor-pointer select-none rounded-full px-3 py-1"
                onClick={() => setFilter(t.key)}
              >
                {t.label}
              </Badge>
            ))}
        </div>

        <form
          className="flex gap-2 items-center bg-card border rounded-xl p-2 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newName.trim();
            if (!name) return;
            setNewName("");
            run(() => addModule(name, newStatus), `已添加模组「${name}」`);
          }}
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="输入模组名称"
            className="flex-1 bg-background/60"
          />
          <Select value={newStatus} onValueChange={(v) => setNewStatus(v as Status)}>
            <SelectTrigger className="w-28 bg-background/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={busy}>
            <Plus className="h-4 w-4 mr-1" />
            添加模组
          </Button>
        </form>

        <HoBoard
          hos={state.hos}
          modules={visibleModules}
          busy={busy}
          run={run}
          onViewPhoto={(src, name) => setViewer({ src, name })}
          onPreview={openPreview}
          onCrop={(moduleId, pcId, file) => setCrop({ moduleId, pcId, file })}
        />

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <FolderOpen className="h-4 w-4" />
            模组管理
          </h2>
          {visibleModules.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-6">
              {state.modules.length ? "该状态下暂无模组" : "还没有模组"}
            </div>
          )}
          {visibleModules.map((m) => (
            <ModuleRow key={m.id} module={m} hos={state.hos} busy={busy} run={run} onPreview={openPreview} />
          ))}
        </section>

        <footer className="text-xs text-muted-foreground">
          数据更新于 {state.updatedAt ? new Date(state.updatedAt).toLocaleString() : "—"}
        </footer>
      </div>

      {viewer && (
        <div
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center cursor-zoom-out"
          onClick={() => setViewer(null)}
        >
          <img src={viewer.src} alt={viewer.name} className="max-w-[86%] max-h-[86%] rounded-xl shadow-2xl" />
        </div>
      )}

      {preview && <PreviewModal preview={preview} onClose={() => setPreview(null)} />}

      {crop && (
        <CropModal
          file={crop.file}
          onCancel={() => setCrop(null)}
          onConfirm={(dataUrl) => {
            const { moduleId, pcId } = crop;
            setCrop(null);
            void run(() => setPhoto(moduleId, pcId, dataUrl), "照片已更新");
          }}
        />
      )}
    </div>
  );
}

/* ================= theme picker ================= */

function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<ThemeName>(getTheme());

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-theme-panel]")) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" data-theme-panel>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        aria-label="更换配色"
        title="更换配色"
        onClick={() => setOpen((v) => !v)}
      >
        <Palette className="h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-9 z-40 bg-popover border rounded-xl shadow-lg p-2 flex flex-col gap-1 w-36">
          <div className="text-[11px] text-muted-foreground px-1.5 py-0.5">网站配色</div>
          {(Object.keys(THEMES) as ThemeName[]).map((name) => {
            const t = THEMES[name];
            const active = name === current;
            return (
              <button
                key={name}
                type="button"
                className={`flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-xs transition-colors ${
                  active ? "bg-secondary font-medium" : "hover:bg-secondary/70"
                }`}
                onClick={() => {
                  applyTheme(name);
                  setCurrent(name);
                  setOpen(false);
                }}
              >
                <span
                  className="h-5 w-5 rounded-full border shrink-0"
                  style={{
                    background: `linear-gradient(135deg, hsl(${t.swatch[0]}) 50%, hsl(${t.swatch[1]}) 50%)`,
                  }}
                />
                {t.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================= card preview ================= */

function PreviewModal({
  preview,
  onClose,
}: {
  preview: { pcName: string; book: Book };
  onClose: () => void;
}) {
  const sheets = useMemo(
    () => preview.book.worksheets.filter((w) => !w.state || w.state === "visible"),
    [preview.book]
  );
  const [tab, setTab] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [building, setBuilding] = useState(true);
  const cache = useRef(new Map<number, SheetRender>());
  const scrollRef = useRef<HTMLDivElement>(null);
  const fitted = useRef(new Set<number>());

  const safeTab = Math.min(tab, Math.max(0, sheets.length - 1));
  const sheet = sheets[safeTab];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!sheet) return;
    const cached = cache.current.get(safeTab);
    if (cached) {
      setBuilding(false);
      return;
    }
    setBuilding(true);
    const t = window.setTimeout(() => {
      cache.current.set(safeTab, buildSheetRender(sheet));
      setBuilding(false);
      // auto fit-to-width the first time a sheet is rendered
      if (!fitted.current.has(safeTab)) {
        fitted.current.add(safeTab);
        const el = scrollRef.current;
        const v = cache.current.get(safeTab);
        if (el && v) {
          const natural = v.cols.reduce((a, b) => a + b, 0);
          if (natural > el.clientWidth - 48) {
            setZoom(Math.min(2.2, Math.max(0.3, (el.clientWidth - 48) / natural)));
          }
        }
      }
    }, 30);
    return () => window.clearTimeout(t);
  }, [sheet, safeTab]);

  const view = cache.current.get(safeTab);
  const naturalWidth = view ? view.cols.reduce((a, b) => a + b, 0) : 0;

  function fitWidth() {
    const el = scrollRef.current;
    if (!el || !naturalWidth) return;
    setZoom(Math.min(2.2, Math.max(0.3, (el.clientWidth - 48) / naturalWidth)));
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border rounded-2xl w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-5 py-3 border-b bg-secondary/40">
          <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-primary/15 text-primary shrink-0">
            <FileSpreadsheet className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{preview.pcName} 的卡背</div>
            <div className="text-xs text-muted-foreground">共 {sheets.length} 个工作表</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="缩小" onClick={() => setZoom((z) => Math.max(0.3, Math.round((z - 0.1) * 10) / 10))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <input
              type="range"
              min={0.3}
              max={2.2}
              step={0.05}
              value={zoom}
              aria-label="缩放"
              className="w-24"
              onChange={(e) => setZoom(Number(e.target.value))}
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="放大" onClick={() => setZoom((z) => Math.min(2.2, Math.round((z + 0.1) * 10) / 10))}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground w-11 text-right tabular-nums">{Math.round(zoom * 100)}%</span>
            <Button size="sm" variant="secondary" className="h-8 px-2 text-xs" onClick={fitWidth}>
              适应宽度
            </Button>
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="关闭" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {sheets.length > 1 && (
          <div className="flex gap-1.5 px-4 py-2 border-b flex-wrap max-h-36 overflow-y-auto">
            {sheets.map((s, i) => (
              <button
                key={s.name || i}
                type="button"
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs transition-colors ${
                  i === safeTab
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
                onClick={() => setTab(i)}
              >
                {s.name || `表 ${i + 1}`}
              </button>
            ))}
          </div>
        )}
        <div ref={scrollRef} className="overflow-auto flex-1 p-4 bg-[hsl(var(--secondary)/0.35)]">
          {building || !view ? (
            <div className="text-sm text-muted-foreground py-10 text-center">正在渲染表格…</div>
          ) : (
            <>
              <div
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "top left",
                  width: naturalWidth ? naturalWidth * zoom : undefined,
                }}
              >
                <table className="card-grid">
                  <colgroup>
                    {view.cols.map((w, i) => (
                      <col key={i} style={{ width: w }} />
                    ))}
                  </colgroup>
                  <tbody>
                    {view.rows.map((row, ri) => (
                      <tr key={ri} style={row.h ? { height: row.h } : undefined}>
                        {row.cells.map((cell, ci) =>
                          cell === null ? null : (
                            <td
                              key={ci}
                              style={cell.style}
                              colSpan={cell.colspan}
                              rowSpan={cell.rowspan}
                              title={cell.v.length > 12 ? cell.v : undefined}
                            >
                              {cell.v}
                            </td>
                          )
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {view.truncated && (
                <div className="text-xs text-muted-foreground mt-2">
                  表格过大，仅显示前 {view.cols.length} 列 / 前 {view.rows.length} 行
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= photo cropper ================= */

const CROP_BOX = 260;
const CROP_OUT = 400;

function CropModal({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const f = Math.max(CROP_BOX / im.width, CROP_BOX / im.height);
      setImg(im);
      setOffset({ x: (CROP_BOX - im.width * f) / 2, y: (CROP_BOX - im.height * f) / 2 });
    };
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const fit = img ? Math.max(CROP_BOX / img.width, CROP_BOX / img.height) : 1;
  const dispW = img ? img.width * fit * scale : 0;
  const dispH = img ? img.height * fit * scale : 0;

  const clamp = (o: { x: number; y: number }) => ({
    x: Math.max(Math.min(0, CROP_BOX - dispW), Math.min(0, o.x)),
    y: Math.max(Math.min(0, CROP_BOX - dispH), Math.min(0, o.y)),
  });

  function zoom(next: number) {
    const prev = scale;
    const cx = CROP_BOX / 2;
    const cy = CROP_BOX / 2;
    const ratio = next / prev;
    setOffset((o) => clamp({ x: cx - (cx - o.x) * ratio, y: cy - (cy - o.y) * ratio }));
    setScale(next);
  }

  function confirm() {
    if (!img) return;
    const k = fit * scale;
    const sx = -offset.x / k;
    const sy = -offset.y / k;
    const sw = CROP_BOX / k;
    const c = document.createElement("canvas");
    c.width = c.height = CROP_OUT;
    c.getContext("2d")!.drawImage(img, sx, sy, sw, sw, 0, 0, CROP_OUT, CROP_OUT);
    onConfirm(c.toDataURL("image/jpeg", 0.85));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border rounded-2xl p-5 flex flex-col gap-4 shadow-2xl w-80">
        <div className="text-sm font-medium">裁剪头像</div>
        <div
          className="relative mx-auto rounded-xl overflow-hidden border bg-secondary/50 touch-none select-none"
          style={{ width: CROP_BOX, height: CROP_BOX, cursor: "grab" }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const d = drag.current;
            setOffset(clamp({ x: d.ox + e.clientX - d.px, y: d.oy + e.clientY - d.py }));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          {img && (
            <img
              src={img.src}
              alt="裁剪预览"
              draggable={false}
              className="absolute max-w-none"
              style={{ width: dispW, height: dispH, transform: `translate(${offset.x}px, ${offset.y}px)` }}
            />
          )}
          <div className="absolute inset-0 pointer-events-none rounded-xl ring-1 ring-inset ring-foreground/20" />
        </div>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={scale}
          aria-label="缩放"
          onChange={(e) => zoom(Number(e.target.value))}
        />
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button size="sm" onClick={confirm} disabled={!img}>
            确定
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ================= HO board: HO slots -> modules -> PCs ================= */

function HoBoard({
  hos,
  modules,
  busy,
  run,
  onViewPhoto,
  onPreview,
  onCrop,
}: {
  hos: Ho[];
  modules: Module[];
  busy: boolean;
  run: Run;
  onViewPhoto: (src: string, name: string) => void;
  onPreview: (pc: Pc) => void;
  onCrop: (moduleId: string, pcId: string, file: File) => void;
}) {
  const dragHo = useRef<string | null>(null);
  const dragPc = useRef<{ moduleId: string; pcId: string } | null>(null);

  function onDropHo(targetId: string) {
    const srcId = dragHo.current;
    dragHo.current = null;
    if (!srcId || srcId === targetId) return;
    const ids = hos.map((h) => h.id);
    const from = ids.indexOf(srcId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    void run(() => reorderHos(ids), "已调整栏目顺序");
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 items-start">
      {hos.map((ho, i) => (
        <HoColumn
          key={ho.id}
          ho={ho}
          colIndex={i}
          modules={modules}
          busy={busy}
          run={run}
          onViewPhoto={onViewPhoto}
          onPreview={onPreview}
          onCrop={onCrop}
          dragHo={dragHo}
          dragPc={dragPc}
          onDropHo={onDropHo}
        />
      ))}
      <HoColumn
        key="unassigned"
        ho={null}
        colIndex={hos.length}
        modules={modules}
        busy={busy}
        run={run}
        onViewPhoto={onViewPhoto}
        onPreview={onPreview}
        onCrop={onCrop}
        dragHo={dragHo}
        dragPc={dragPc}
        onDropHo={onDropHo}
      />
      <div className="shrink-0 w-40">
        <AddHoButton busy={busy} run={run} hos={hos} />
      </div>
    </div>
  );
}

function AddHoButton({ busy, run, hos }: { busy: boolean; run: Run; hos: Ho[] }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  return adding ? (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const name = draft.trim();
        setAdding(false);
        setDraft("");
        void run(() => addHo(name || undefined), name ? `已添加栏目「${name}」` : "已添加栏目");
      }}
    >
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={`HO${hos.length + 1}`}
        className="h-8 w-24 px-2 text-xs"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setAdding(false);
            setDraft("");
          }
        }}
      />
      <Button type="submit" size="sm" variant="secondary" className="h-8 px-2 text-xs" disabled={busy}>
        确定
      </Button>
    </form>
  ) : (
    <button
      type="button"
      className="w-full inline-flex items-center justify-center gap-1 rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
      onClick={() => setAdding(true)}
    >
      <Plus className="h-3.5 w-3.5" />
      添加 HO 栏目
    </button>
  );
}

function HoColumn({
  ho,
  colIndex,
  modules,
  busy,
  run,
  onViewPhoto,
  onPreview,
  onCrop,
  dragHo,
  dragPc,
  onDropHo,
}: {
  ho: Ho | null;
  colIndex: number;
  modules: Module[];
  busy: boolean;
  run: Run;
  onViewPhoto: (src: string, name: string) => void;
  onPreview: (pc: Pc) => void;
  onCrop: (moduleId: string, pcId: string, file: File) => void;
  dragHo: React.MutableRefObject<string | null>;
  dragPc: React.MutableRefObject<{ moduleId: string; pcId: string } | null>;
  onDropHo: (targetId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(ho?.name || "");
  const [dragOver, setDragOver] = useState(false);

  const hoVar = ho ? `var(--ho-${(colIndex % 4) + 1})` : "var(--border)";

  const groups = modules
    .map((m) => ({
      module: m,
      pcs: ho ? m.pcs.filter((p) => p.hoId === ho.id) : m.pcs.filter((p) => !p.hoId),
    }))
    .filter((g) => g.pcs.length > 0);
  const total = groups.reduce((n, g) => n + g.pcs.length, 0);

  return (
    <div
      className={`shrink-0 w-48 flex flex-col gap-2 rounded-xl border p-2 transition-colors ${
        dragOver ? "border-primary/60 bg-primary/5" : "bg-secondary/40 border-border/70"
      }`}
      style={{ borderTop: `3px solid hsl(${hoVar})` }}
      onDragOver={(e) => {
        if (dragHo.current || dragPc.current) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const pcDrag = dragPc.current;
        dragPc.current = null;
        if (pcDrag) {
          const target = ho ? ho.id : null;
          const cur = modules
            .flatMap((m) => m.pcs)
            .find((p) => p.id === pcDrag.pcId)?.hoId ?? null;
          if (cur !== target) {
            const label = ho ? ho.name : "未分配";
            void run(() => setPcHo(pcDrag.moduleId, pcDrag.pcId, target), `已移动到「${label}」`);
          }
          return;
        }
        if (ho) onDropHo(ho.id);
      }}
    >
      <div
        className="flex items-center gap-1 min-h-7 rounded-lg px-1"
        style={ho ? { background: `hsl(${hoVar} / 0.14)` } : undefined}
      >
        {ho ? (
          <>
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ background: `hsl(${hoVar})` }}
            />
            <span
              className="text-muted-foreground/50 cursor-grab shrink-0"
              title="拖动排序"
              draggable
              onDragStart={() => (dragHo.current = ho.id)}
              onDragEnd={() => (dragHo.current = null)}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>
            {editing ? (
              <form
                className="flex items-center gap-1 flex-1 min-w-0"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = draft.trim();
                  setEditing(false);
                  if (n && n !== ho.name) void run(() => renameHo(ho.id, n), "已重命名栏目");
                }}
              >
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="h-6 px-1.5 text-xs flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditing(false);
                  }}
                />
              </form>
            ) : (
              <button
                type="button"
                className="text-xs font-medium truncate flex-1 text-left hover:underline decoration-dotted underline-offset-2"
                title="点击重命名，拖动左侧手柄排序"
                onClick={() => {
                  setDraft(ho.name);
                  setEditing(true);
                }}
              >
                {ho.name}
              </button>
            )}
            <span className="text-[10px] text-muted-foreground/70 shrink-0">{total}</span>
            <button
              type="button"
              className="text-muted-foreground/50 hover:text-destructive opacity-0 group-hover/col:opacity-100 transition-opacity shrink-0"
              aria-label={`删除栏目 ${ho.name}`}
              disabled={busy}
              onClick={() => void run(() => removeHo(ho.id), `已删除栏目「${ho.name}」`)}
            >
              <X className="h-3 w-3" />
            </button>
          </>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">未分配</span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {groups.length === 0 && (
          <div className="text-[11px] text-muted-foreground/70 text-center py-3">
            {ho ? "把 PC 拖到这里" : "在下方模组管理中添加 PC"}
          </div>
        )}
        {groups.map(({ module: m, pcs }) => (
          <div key={m.id} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 px-0.5">
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 dot-${m.status}`} />
              <span
                className="h-1.5 flex-1 rounded-full"
                style={{ background: `hsl(var(--morandi-${m.status}) / 0.45)` }}
              />
            </div>
            {pcs.map((p) => (
              <PcEntry
                key={p.id}
                module={m}
                pc={p}
                busy={busy}
                run={run}
                onViewPhoto={onViewPhoto}
                onPreview={onPreview}
                onCrop={onCrop}
                dragPc={dragPc}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= module management rows ================= */

function ModuleRow({
  module: m,
  hos,
  busy,
  run,
  onPreview,
}: {
  module: Module;
  hos: Ho[];
  busy: boolean;
  run: Run;
  onPreview: (pc: Pc) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(m.name);
  const [pcName, setPcName] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <div className="group bg-card border rounded-xl px-3 py-2 flex items-center gap-2 flex-wrap shadow-sm transition-colors hover:border-primary/40">
      <button
        type="button"
        className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors"
        aria-label={open ? "收起 PC 详情" : "展开 PC 详情"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      <span className={`h-2 w-2 rounded-full shrink-0 dot-${m.status}`} />
      {renaming ? (
        <form
          className="flex-1 flex gap-2 min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            const n = nameDraft.trim();
            setRenaming(false);
            if (n && n !== m.name) void run(() => renameModule(m.id, n), "已重命名模组");
          }}
        >
          <Input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            className="flex-1 h-8"
            autoFocus
          />
          <Button type="submit" size="sm" variant="secondary">
            确定
          </Button>
        </form>
      ) : (
        <button
          className="text-sm font-medium min-w-0 text-left truncate hover:underline decoration-dotted underline-offset-4"
          title="点击重命名"
          onClick={() => {
            setNameDraft(m.name);
            setRenaming(true);
          }}
        >
          {m.name}
        </button>
      )}

      <span className="text-[11px] text-muted-foreground shrink-0">{m.pcs.length} 个 PC</span>

      <div className="flex border rounded-full overflow-hidden shrink-0 ml-auto">
        {ORDER.map((s, i) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            className={`px-2 py-1 text-[11px] transition-colors ${i > 0 ? "border-l" : ""} ${
              m.status === s ? `st-${s}` : "text-muted-foreground hover:bg-secondary/70"
            }`}
            onClick={() => {
              if (m.status !== s) void run(() => setModuleStatus(m.id, s), `已切换为「${STATUS[s]}」`);
            }}
          >
            {STATUS[s]}
          </button>
        ))}
      </div>

      <form
        className="flex gap-1.5 shrink-0"
        onSubmit={(e) => {
          e.preventDefault();
          const n = pcName.trim();
          if (!n) return;
          setPcName("");
          void run(() => addPc(m.id, n), `已添加 PC「${n}」（在未分配栏）`);
        }}
      >
        <Input
          value={pcName}
          onChange={(e) => setPcName(e.target.value)}
          placeholder="PC 名字"
          className="h-8 w-32 px-2 text-xs"
        />
        <Button type="submit" variant="secondary" size="sm" className="h-8 px-2 text-xs" disabled={busy}>
          <Plus className="h-3.5 w-3.5 mr-0.5" />
          PC
        </Button>
      </form>

      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        aria-label="删除模组"
        onClick={() => void run(() => removeModule(m.id), "已删除模组")}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      {open && (
        <div className="w-full mt-1 flex flex-col gap-1.5">
          {m.pcs.length === 0 && <div className="text-xs text-muted-foreground py-1">暂无 PC</div>}
          {m.pcs.map((p) => (
            <PcDetailItem key={p.id} module={m} pc={p} hos={hos} onPreview={onPreview} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= PC detail (module management) ================= */

function PcDetailItem({
  pc: p,
  hos,
  onPreview,
}: {
  module: Module;
  pc: Pc;
  hos: Ho[];
  onPreview: (pc: Pc) => void;
}) {
  const [open, setOpen] = useState(false);
  const hoName = hos.find((h) => h.id === p.hoId)?.name ?? "未分配";

  return (
    <div className="rounded-lg border bg-background/50 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-secondary/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        {p.photo ? (
          <img src={p.photo} alt={p.name} className="h-7 w-7 rounded-md object-cover border shrink-0" />
        ) : (
          <span className="h-7 w-7 rounded-md border bg-secondary/60 flex items-center justify-center shrink-0">
            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        )}
        <span className="text-sm font-medium truncate">{p.name}</span>
        <span className="text-[10px] text-muted-foreground/80 shrink-0">{hoName}</span>
        <span className="text-[10px] text-muted-foreground/70 truncate ml-auto shrink-0">
          {p.card ? p.card.name : "无卡背"}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 pt-1 flex flex-col gap-2">
          {p.attrs ? (
            <AttrGrid attrs={p.attrs} />
          ) : (
            <div className="text-xs text-muted-foreground">
              {p.card ? "未能从卡背中读取到属性" : "上传卡背后自动读取九项属性"}
            </div>
          )}
          {p.card && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{p.card.name}</span>
              {p.card.sizeBytes > 0 && <span className="shrink-0">{fmtSize(p.card.sizeBytes)}</span>}
              <Button size="sm" variant="secondary" className="h-7 px-2 text-xs ml-auto shrink-0" onClick={() => onPreview(p)}>
                <Eye className="h-3.5 w-3.5 mr-1" />
                查看卡背
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AttrGrid({ attrs }: { attrs: PcAttr[] }) {
  return (
    <div className="grid grid-cols-3 md:grid-cols-5 xl:grid-cols-9 gap-1.5">
      {attrs.map((a) => (
        <div key={a.label} className="rounded-lg border bg-card px-1 py-1 text-center min-w-0">
          <div className="text-[10px] text-muted-foreground truncate" title={a.label}>
            {a.label}
          </div>
          <div className="text-lg font-semibold leading-tight tabular-nums">{a.value}</div>
          <div className="text-[9px] text-muted-foreground/80 tabular-nums">
            {a.half} / {a.fifth}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================= PC entry ================= */

function PcEntry({
  module: m,
  pc: p,
  busy,
  run,
  onViewPhoto,
  onPreview,
  onCrop,
  dragPc,
}: {
  module: Module;
  pc: Pc;
  busy: boolean;
  run: Run;
  onViewPhoto: (src: string, name: string) => void;
  onPreview: (pc: Pc) => void;
  onCrop: (moduleId: string, pcId: string, file: File) => void;
  dragPc: React.MutableRefObject<{ moduleId: string; pcId: string } | null>;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.name);
  const [dragging, setDragging] = useState(false);

  async function onCard(file: File) {
    try {
      await run(async () => {
        await setCard(m.id, p.id, file);
        try {
          const attrs = await extractAttrs(await file.arrayBuffer());
          if (attrs) await setPcAttrs(m.id, p.id, attrs);
        } catch {
          /* 属性读取失败不阻塞上传 */
        }
      }, `已关联卡背「${file.name}」`);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function downloadCard() {
    try {
      const buf = await getCardArrayBuffer(p.id);
      const blob = new Blob([buf], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = p.card?.name || "card.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div
      className={`group/pc bg-card border rounded-xl p-2 flex flex-col gap-1.5 transition-all hover:border-primary/40 ${
        dragging ? "opacity-40 scale-95 rotate-1" : "cursor-grab active:cursor-grabbing"
      }`}
      draggable
      onDragStart={(e) => {
        dragPc.current = { moduleId: m.id, pcId: p.id };
        e.dataTransfer.setData("text/plain", p.id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => {
        dragPc.current = null;
        setDragging(false);
      }}
    >
      <div className="flex items-center gap-2">
        {p.photo ? (
          <button
            type="button"
            className="relative h-14 w-14 rounded-xl overflow-hidden border shrink-0 cursor-zoom-in"
            aria-label={`查看 ${p.name} 的照片`}
            onClick={() => onViewPhoto(p.photo!, p.name)}
          >
            <img src={p.photo} alt={p.name} className="h-full w-full object-cover" />
            <span
              role="button"
              aria-label="更换照片"
              className="absolute inset-0 hidden group-hover/pc:flex items-center justify-center bg-black/45 text-white cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                photoRef.current?.click();
              }}
            >
              <ImageIcon className="h-4 w-4" />
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="h-14 w-14 rounded-xl border bg-secondary/60 flex items-center justify-center text-lg text-muted-foreground shrink-0 hover:border-primary/40"
            aria-label="上传照片"
            onClick={() => photoRef.current?.click()}
          >
            <ImageIcon className="h-5 w-5" />
          </button>
        )}

        <div className="flex-1 min-w-0">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const n = draft.trim();
                setEditing(false);
                if (n && n !== p.name) void run(() => renamePc(m.id, p.id, n), "已重命名 PC");
              }}
            >
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="h-7 px-1.5 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditing(false);
                }}
              />
            </form>
          ) : (
            <button
              type="button"
              className="text-sm font-medium truncate text-left w-full hover:underline decoration-dotted underline-offset-2"
              title="点击重命名"
              onClick={() => {
                setDraft(p.name);
                setEditing(true);
              }}
            >
              {p.name}
            </button>
          )}
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground min-w-0 mt-0.5">
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 dot-${m.status}`} />
            <span className="truncate">{m.name}</span>
            <span className={`shrink-0 rounded px-1 py-px text-[9px] st-${m.status}`}>{STATUS[m.status]}</span>
          </div>
          {p.card && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground max-w-full"
              title="点击预览卡背"
              onClick={() => onPreview(p)}
            >
              <FileSpreadsheet className="h-3 w-3 shrink-0" />
              <span className="truncate">{p.card.name}</span>
              {p.card.sizeBytes > 0 && (
                <span className="text-muted-foreground/60 shrink-0">{fmtSize(p.card.sizeBytes)}</span>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover/pc:opacity-100 focus-within:opacity-100 transition-opacity">
        {!p.photo && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            aria-label="上传照片"
            disabled={busy}
            onClick={() => photoRef.current?.click()}
          >
            <ImageIcon className="h-3.5 w-3.5" />
          </Button>
        )}
        {p.card ? (
          <>
            <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="预览卡背" onClick={() => onPreview(p)}>
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="下载角色卡" onClick={downloadCard}>
              <Download className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            aria-label="关联卡背"
            disabled={busy}
            onClick={() => cardRef.current?.click()}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 hover:text-destructive ml-auto"
          aria-label="移除该 PC"
          disabled={busy}
          onClick={() => void run(() => removePc(m.id, p.id), "已移除 PC")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onCrop(m.id, p.id, f);
        }}
      />
      <input
        ref={cardRef}
        type="file"
        accept=".xlsx,.xls,.xlsm"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onCard(f);
        }}
      />
    </div>
  );
}
