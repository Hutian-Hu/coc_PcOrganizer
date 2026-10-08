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
  BookOpen,
  LayoutGrid,
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
  finished: "已结团",
};
const ORDER: Status[] = ["planned", "ongoing", "finished"];

type SheetView = { name: string; rows: unknown[][] };

type Run = (fn: () => Promise<unknown>, note?: string) => Promise<void>;

function fmtSize(n?: number) {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function downscale(dataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const max = 320;
        const s = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * s));
        c.height = Math.max(1, Math.round(img.height * s));
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.82));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function readFile(file: File, asDataUrl: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("文件读取失败"));
    if (asDataUrl) r.readAsDataURL(file);
    else r.readAsBinaryString(file);
  });
}

export default function Home() {
  const [state, setState] = useState<State>({ modules: [], updatedAt: "" });
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: "error" | "info" } | null>(null);
  const [viewer, setViewer] = useState<{ src: string; name: string } | null>(null);
  const [preview, setPreview] = useState<{ pcName: string; sheets: SheetView[] } | null>(null);
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
      say("正在解析卡背…");
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
      say(`卡背解析失败：${(e as Error).message}`, "error");
    }
  }

  const counts = { planned: 0, ongoing: 0, finished: 0 };
  state.modules.forEach((m) => counts[m.status]++);
  const visible = state.modules.filter((m) => filter === "all" || m.status === filter);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-10 flex flex-col gap-4">
        <header className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-xl font-medium flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            CoC 模组团务
          </h1>
          <span className="text-xs text-muted-foreground ml-auto">
            卫星 {counts.planned} · 进行 {counts.ongoing} · 结团 {counts.finished}
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

        <div className="flex flex-col gap-3">
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
    </div>
  );
}

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

function ModuleCard({
  module: m,
  busy,
  run,
  onViewPhoto,
  onPreview,
}: {
  module: Module;
  busy: boolean;
  run: Run;
  onViewPhoto: (src: string, name: string) => void;
  onPreview: (pc: Pc) => void;
}) {
  const [pcName, setPcName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(m.name);

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

        <div className="flex border rounded-full overflow-hidden shrink-0">
          {ORDER.map((s, i) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              className={`px-3 py-1 text-xs transition-colors ${i > 0 ? "border-l" : ""} ${
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

      <HoBar module={m} busy={busy} run={run} />

      <div className="flex flex-col gap-2">
        {m.pcs.length === 0 && <div className="text-[13px] text-muted-foreground">还没有 PC</div>}
        {m.pcs.map((p) => (
          <PcRow
            key={p.id}
            module={m}
            pc={p}
            busy={busy}
            run={run}
            onViewPhoto={onViewPhoto}
            onPreview={onPreview}
          />
        ))}
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

function HoBar({ module: m, busy, run }: { module: Module; busy: boolean; run: Run }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  function commitAdd() {
    const name = draft.trim();
    setAdding(false);
    setDraft("");
    run(() => addHo(m.id, name || undefined), name ? `已添加栏目「${name}」` : "已添加栏目");
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-muted-foreground inline-flex items-center gap-1 mr-1">
        <LayoutGrid className="h-3.5 w-3.5" />
        HO 栏目
      </span>
      {m.hos.map((ho) =>
        editingId === ho.id ? (
          <form
            key={ho.id}
            className="inline-flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const n = editDraft.trim();
              setEditingId(null);
              if (n && n !== ho.name) run(() => renameHo(m.id, ho.id, n), "已重命名栏目");
            }}
          >
            <Input
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              className="h-7 w-24 px-2 text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditingId(null);
              }}
            />
            <Button type="submit" size="sm" variant="secondary" className="h-7 px-2 text-xs">
              确定
            </Button>
          </form>
        ) : (
          <span key={ho.id} className="ho-chip group/ho">
            <button
              type="button"
              className="hover:underline decoration-dotted underline-offset-2"
              title="点击重命名"
              onClick={() => {
                setEditingId(ho.id);
                setEditDraft(ho.name);
              }}
            >
              {ho.name}
            </button>
            <button
              type="button"
              className="text-muted-foreground/60 hover:text-destructive opacity-0 group-hover/ho:opacity-100 transition-opacity"
              aria-label={`删除栏目 ${ho.name}`}
              disabled={busy}
              onClick={() => run(() => removeHo(m.id, ho.id), `已删除栏目「${ho.name}」`)}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )
      )}
      {adding ? (
        <form
          className="inline-flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            commitAdd();
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`HO${m.hos.length + 1}`}
            className="h-7 w-24 px-2 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setAdding(false);
                setDraft("");
              }
            }}
          />
          <Button type="submit" size="sm" variant="secondary" className="h-7 px-2 text-xs">
            确定
          </Button>
        </form>
      ) : (
        <button
          type="button"
          className="ho-chip border-dashed hover:border-primary/50 hover:text-primary"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-3 w-3" />
          添加栏目
        </button>
      )}
    </div>
  );
}

function PcRow({
  module: m,
  pc: p,
  busy,
  run,
  onViewPhoto,
  onPreview,
}: {
  module: Module;
  pc: Pc;
  busy: boolean;
  run: Run;
  onViewPhoto: (src: string, name: string) => void;
  onPreview: (pc: Pc) => void;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLInputElement>(null);
  const ho = m.hos.find((h) => h.id === p.hoId);

  async function onPhoto(file: File) {
    try {
      const raw = await readFile(file, true);
      const small = (await downscale(raw)) || raw;
      await run(() => setPhoto(m.id, p.id, small), "照片已更新");
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function onCard(file: File) {
    try {
      const bin = await readFile(file, false);
      const data = btoa(bin);
      await run(
        () => setCard(m.id, p.id, { name: file.name, data, sizeBytes: file.size }),
        `已关联卡背「${file.name}」`
      );
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
    <div className="flex items-center gap-2 group min-h-[40px]">
      {p.photo ? (
        <button
          type="button"
          className="relative h-10 w-10 rounded-full overflow-hidden border shrink-0 cursor-zoom-in"
          aria-label={`查看 ${p.name} 的照片`}
          onClick={() => onViewPhoto(p.photo!, p.name)}
        >
          <img src={p.photo} alt={p.name} className="h-full w-full object-cover" />
          <span
            role="button"
            aria-label="移除照片"
            className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/50 text-white cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              run(() => setPhoto(m.id, p.id, null), "已移除照片");
            }}
          >
            <X className="h-4 w-4" />
          </span>
        </button>
      ) : (
        <div className="h-10 w-10 rounded-full border bg-secondary/60 flex items-center justify-center text-sm text-muted-foreground shrink-0">
          {(p.name || "?").slice(0, 1)}
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <PcName pc={p} moduleId={m.id} run={run} />
          {ho && (
            <Badge variant="outline" className="rounded-full px-2 py-0 text-[11px] shrink-0">
              {ho.name}
            </Badge>
          )}
        </div>
        {p.card && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground max-w-full text-left"
            title="点击预览卡背"
            onClick={() => onPreview(p)}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{p.card.name}</span>
            {p.card.sizeBytes > 0 && (
              <span className="text-muted-foreground/70 shrink-0">{fmtSize(p.card.sizeBytes)}</span>
            )}
          </button>
        )}
      </div>

      <Select
        value={p.hoId || "none"}
        onValueChange={(v) =>
          run(() => setPcHo(m.id, p.id, v === "none" ? null : v), "已更新 HO 归属")
        }
      >
        <SelectTrigger className="h-7 w-24 text-xs shrink-0 bg-background/60" aria-label="HO 归属">
          <SelectValue placeholder="未分配" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">未分配</SelectItem>
          {m.hos.map((h) => (
            <SelectItem key={h.id} value={h.id}>
              {h.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label={p.photo ? "更换照片" : "上传照片"}
          disabled={busy}
          onClick={() => photoRef.current?.click()}
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
        {p.card ? (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label="预览卡背"
              onClick={() => onPreview(p)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label="下载角色卡"
              onClick={downloadCard}
            >
              <Download className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            disabled={busy}
            onClick={() => cardRef.current?.click()}
          >
            <FileSpreadsheet className="h-4 w-4 mr-1" />
            卡背
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 hover:text-destructive"
          aria-label="移除该 PC"
          disabled={busy}
          onClick={() => run(() => removePc(m.id, p.id), "已移除 PC")}
        >
          <Trash2 className="h-4 w-4" />
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
          if (f) onPhoto(f);
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

function PcName({ pc: p, moduleId, run }: { pc: Pc; moduleId: string; run: Run }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.name);

  if (editing) {
    return (
      <form
        className="flex-1 min-w-0 flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const n = draft.trim();
          setEditing(false);
          if (n && n !== p.name) run(() => renamePc(moduleId, p.id, n), "已重命名 PC");
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-7 px-2 text-sm flex-1"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <Button type="submit" size="sm" variant="secondary" className="h-7 px-2 text-xs">
          确定
        </Button>
      </form>
    );
  }
  return (
    <button
      type="button"
      className="text-sm truncate text-left hover:underline decoration-dotted underline-offset-4"
      title="点击重命名"
      onClick={() => {
        setDraft(p.name);
        setEditing(true);
      }}
    >
      {p.name}
    </button>
  );
}
