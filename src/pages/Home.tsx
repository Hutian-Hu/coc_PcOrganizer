import { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
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
  ChevronLeft,
  ChevronRight,
  Users,
} from "lucide-react";
import {
  type Status,
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
  getCardArrayBuffer,
} from "@/lib/storage";

const STATUS: Record<Status, string> = {
  planned: "卫星中",
  ongoing: "进行中",
  paused: "暂停中",
  disbanded: "已散桌",
  finished: "已结团",
};
const ORDER: Status[] = ["planned", "ongoing", "paused", "disbanded", "finished"];

type SheetView = { name: string; rows: unknown[][] };
type Run = (fn: () => Promise<unknown>, note?: string) => Promise<void>;

function fmtSize(n?: number) {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function Home() {
  const [state, setState] = useState<State>({ modules: [], updatedAt: "" });
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: "error" | "info" } | null>(null);
  const [viewer, setViewer] = useState<{ src: string; name: string } | null>(null);
  const [preview, setPreview] = useState<{ pcName: string; sheets: SheetView[] } | null>(null);
  const [crop, setCrop] = useState<{ moduleId: string; pcId: string; file: File } | null>(null);
  const [newName, setNewName] = useState("");
  const [newStatus, setNewStatus] = useState<Status>("planned");
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

  async function openPreview(pc: Pc) {
    if (!pc.card) return;
    try {
      const buf = await getCardArrayBuffer(pc.id);
      const wb = XLSX.read(buf, { type: "array" });
      const sheets: SheetView[] = wb.SheetNames.map((name) => {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
          header: 1,
          defval: "",
        });
        return { name, rows: rows.slice(0, 500).map((r) => r.slice(0, 40)) };
      }).filter((s) => s.rows.length > 0);
      if (!sheets.length) {
        say("这个表格是空的", "error");
        return;
      }
      setPreview({ pcName: pc.name, sheets });
    } catch (e) {
      say(`卡背打开失败：${(e as Error).message}`, "error");
    }
  }

  const counts: Record<Status, number> = { planned: 0, ongoing: 0, paused: 0, disbanded: 0, finished: 0 };
  state.modules.forEach((m) => counts[m.status]++);
  const visible = state.modules.filter((m) => filter === "all" || m.status === filter);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-10 flex flex-col gap-4">
        <header className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-xl font-medium flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            TRPG PC整理工具
          </h1>
          <span className="text-xs text-muted-foreground ml-auto">
            {ORDER.map((s) => `${STATUS[s]} ${counts[s]}`).join(" · ")}
          </span>
          {busy && <span className="text-xs text-muted-foreground">保存中…</span>}
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

        <div className="flex flex-col gap-4">
          {visible.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-12">
              {state.modules.length ? "该状态下暂无模组" : "还没有模组，先在上方添加一个吧"}
            </div>
          )}
          {visible.map((m) => (
            <ModuleCard
              key={m.id}
              module={m}
              busy={busy}
              run={run}
              onViewPhoto={(src, name) => setViewer({ src, name })}
              onPreview={openPreview}
              onCrop={(pcId, file) => setCrop({ moduleId: m.id, pcId, file })}
            />
          ))}
        </div>

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
          onConfirm={async (dataUrl) => {
            const { moduleId, pcId } = crop;
            setCrop(null);
            await run(() => setPhoto(moduleId, pcId, dataUrl), "照片已更新");
          }}
        />
      )}
    </div>
  );
}

/* ================= card preview ================= */

function PreviewModal({
  preview,
  onClose,
}: {
  preview: { pcName: string; sheets: SheetView[] };
  onClose: () => void;
}) {
  const [tab, setTab] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sheet = preview.sheets[Math.min(tab, preview.sheets.length - 1)];
  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border rounded-2xl w-full max-w-3xl max-h-[86vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b bg-secondary/40">
          <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-primary/15 text-primary">
            <FileSpreadsheet className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{preview.pcName} 的卡背</div>
            <div className="text-xs text-muted-foreground">共 {preview.sheets.length} 个工作表</div>
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="关闭" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {preview.sheets.length > 1 && (
          <div className="flex gap-1.5 px-5 py-2.5 border-b flex-wrap">
            {preview.sheets.map((s, i) => (
              <button
                key={s.name || i}
                type="button"
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  i === tab
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
        <div className="overflow-auto flex-1 p-4">
          <table className="card-preview-table">
            <tbody>
              {sheet.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{String(cell ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
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
    setOffset((o) =>
      clamp({ x: cx - (cx - o.x) * ratio, y: cy - (cy - o.y) * ratio })
    );
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
            setOffset(
              clamp({ x: d.ox + e.clientX - d.px, y: d.oy + e.clientY - d.py })
            );
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

/* ================= module card with HO columns ================= */

function ModuleCard({
  module: m,
  busy,
  run,
  onViewPhoto,
  onPreview,
  onCrop,
}: {
  module: Module;
  busy: boolean;
  run: Run;
  onViewPhoto: (src: string, name: string) => void;
  onPreview: (pc: Pc) => void;
  onCrop: (pcId: string, file: File) => void;
}) {
  const [pcName, setPcName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(m.name);
  const dragHo = useRef<string | null>(null);

  function movePc(pc: Pc, dir: -1 | 1) {
    const cols: (string | null)[] = [...m.hos.map((h) => h.id), null];
    const idx = cols.indexOf(pc.hoId ?? null);
    const next = cols[idx + dir];
    if (idx === -1 || next === undefined) return;
    const label = next === null ? "未分配" : (m.hos.find((h) => h.id === next)?.name ?? "");
    run(() => setPcHo(m.id, pc.id, next), `已移动到「${label}」`);
  }

  function onDropHo(targetId: string) {
    const srcId = dragHo.current;
    dragHo.current = null;
    if (!srcId || srcId === targetId) return;
    const ids = m.hos.map((h) => h.id);
    const from = ids.indexOf(srcId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    run(() => reorderHos(m.id, ids), "已调整栏目顺序");
  }

  return (
    <div className="group bg-card border rounded-2xl p-4 flex flex-col gap-3 shadow-sm transition-colors hover:border-primary/40">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`h-2 w-2 rounded-full shrink-0 dot-${m.status}`} />
        {renaming ? (
          <form
            className="flex-1 flex gap-2 min-w-0"
            onSubmit={(e) => {
              e.preventDefault();
              const n = nameDraft.trim();
              setRenaming(false);
              if (n && n !== m.name) run(() => renameModule(m.id, n), "已重命名模组");
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
            className="text-[15px] font-medium flex-1 min-w-0 text-left truncate hover:underline decoration-dotted underline-offset-4"
            title="点击重命名"
            onClick={() => {
              setNameDraft(m.name);
              setRenaming(true);
            }}
          >
            {m.name}
          </button>
        )}

        <div className="flex border rounded-full overflow-hidden shrink-0 flex-wrap rounded-xl">
          {ORDER.map((s, i) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              className={`px-2.5 py-1 text-xs transition-colors ${i > 0 ? "border-l" : ""} ${
                m.status === s ? `st-${s}` : "text-muted-foreground hover:bg-secondary/70"
              }`}
              onClick={() => {
                if (m.status !== s) run(() => setModuleStatus(m.id, s), `已切换为「${STATUS[s]}」`);
              }}
            >
              {STATUS[s]}
            </button>
          ))}
        </div>

        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label="删除模组"
          onClick={() => run(() => removeModule(m.id), "已删除模组")}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 items-start">
        {m.hos.map((ho) => (
          <HoColumn
            key={ho.id}
            module={m}
            ho={ho}
            busy={busy}
            run={run}
            onViewPhoto={onViewPhoto}
            onPreview={onPreview}
            onCrop={onCrop}
            onMovePc={movePc}
            dragHo={dragHo}
            onDropHo={onDropHo}
          />
        ))}
        <HoColumn
          key="unassigned"
          module={m}
          ho={null}
          busy={busy}
          run={run}
          onViewPhoto={onViewPhoto}
          onPreview={onPreview}
          onCrop={onCrop}
          onMovePc={movePc}
          dragHo={dragHo}
          onDropHo={onDropHo}
        />
        <div className="shrink-0 w-40">
          <AddHoButton module={m} busy={busy} run={run} />
        </div>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = pcName.trim();
          if (!n) return;
          setPcName("");
          run(() => addPc(m.id, n), `已添加 PC「${n}」`);
        }}
      >
        <Input
          value={pcName}
          onChange={(e) => setPcName(e.target.value)}
          placeholder="PC 名字"
          className="flex-1 h-9 bg-background/60"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={busy}>
          <Plus className="h-4 w-4 mr-1" />
          添加 PC
        </Button>
      </form>
    </div>
  );
}

function AddHoButton({ module: m, busy, run }: { module: Module; busy: boolean; run: Run }) {
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
        run(() => addHo(m.id, name || undefined), name ? `已添加栏目「${name}」` : "已添加栏目");
      }}
    >
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={`HO${m.hos.length + 1}`}
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
  module: m,
  ho,
  busy,
  run,
  onViewPhoto,
  onPreview,
  onCrop,
  onMovePc,
  dragHo,
  onDropHo,
}: {
  module: Module;
  ho: import("@/lib/storage").Ho | null;
  busy: boolean;
  run: Run;
  onViewPhoto: (src: string, name: string) => void;
  onPreview: (pc: Pc) => void;
  onCrop: (pcId: string, file: File) => void;
  onMovePc: (pc: Pc, dir: -1 | 1) => void;
  dragHo: React.MutableRefObject<string | null>;
  onDropHo: (targetId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(ho?.name || "");
  const [dragOver, setDragOver] = useState(false);

  const pcs = ho
    ? m.pcs.filter((p) => p.hoId === ho.id)
    : m.pcs.filter((p) => !p.hoId || !m.hos.some((h) => h.id === p.hoId));

  return (
    <div
      className={`shrink-0 w-44 flex flex-col gap-2 rounded-xl border p-2 transition-colors ${
        dragOver ? "border-primary/60 bg-primary/5" : "bg-secondary/40 border-border/70"
      }`}
      onDragOver={(e) => {
        if (ho && dragHo.current) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (ho) onDropHo(ho.id);
      }}
    >
      <div className="flex items-center gap-1 min-h-7">
        {ho ? (
          <>
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
                  if (n && n !== ho.name) run(() => renameHo(m.id, ho.id, n), "已重命名栏目");
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
            <span className="text-[10px] text-muted-foreground/70 shrink-0">{pcs.length}</span>
            <button
              type="button"
              className="text-muted-foreground/50 hover:text-destructive opacity-0 group-hover/col:opacity-100 transition-opacity shrink-0"
              aria-label={`删除栏目 ${ho.name}`}
              disabled={busy}
              onClick={() => run(() => removeHo(m.id, ho.id), `已删除栏目「${ho.name}」`)}
            >
              <X className="h-3 w-3" />
            </button>
          </>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">未分配</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {pcs.length === 0 && (
          <div className="text-[11px] text-muted-foreground/70 text-center py-3">
            {ho ? "空" : "新 PC 会出现在这里"}
          </div>
        )}
        {pcs.map((p, i) => (
          <PcEntry
            key={p.id}
            module={m}
            pc={p}
            busy={busy}
            run={run}
            onViewPhoto={onViewPhoto}
            onPreview={onPreview}
            onCrop={onCrop}
            onMoveLeft={() => onMovePc(p, -1)}
            onMoveRight={() => onMovePc(p, 1)}
            canLeft={ho !== null || i > 0}
            canRight={ho === null || m.hos.findIndex((h) => h.id === ho?.id) < m.hos.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function PcEntry({
  module: m,
  pc: p,
  busy,
  run,
  onViewPhoto,
  onPreview,
  onCrop,
  onMoveLeft,
  onMoveRight,
  canLeft,
  canRight,
}: {
  module: Module;
  pc: Pc;
  busy: boolean;
  run: Run;
  onViewPhoto: (src: string, name: string) => void;
  onPreview: (pc: Pc) => void;
  onCrop: (pcId: string, file: File) => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  canLeft: boolean;
  canRight: boolean;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.name);

  async function onPhotoPicked(file: File) {
    onCrop(p.id, file);
  }

  async function onCard(file: File) {
    try {
      await run(() => setCard(m.id, p.id, file), `已关联卡背「${file.name}」`);
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
    <div className="group/pc bg-card border rounded-xl p-2 flex flex-col gap-1.5 transition-colors hover:border-primary/40">
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
                if (n && n !== p.name) run(() => renamePc(m.id, p.id, n), "已重命名 PC");
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
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          aria-label="左移"
          disabled={busy || !canLeft}
          onClick={onMoveLeft}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          aria-label="右移"
          disabled={busy || !canRight}
          onClick={onMoveRight}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
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
          onClick={() => run(() => removePc(m.id, p.id), "已移除 PC")}
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
          if (f) onPhotoPicked(f);
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
