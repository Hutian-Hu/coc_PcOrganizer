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
  addPc,
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
        return { name, rows: rows.slice(0, 300).map((r) => r.slice(0, 30)) };
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
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8 flex flex-col gap-4">
        <header className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-xl font-medium flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            CoC 模组团务
          </h1>
          <span className="text-xs text-muted-foreground ml-auto">
            卫星 {counts.planned} · 进行 {counts.ongoing} · 结团 {counts.finished}
          </span>
          {busy && <span className="text-xs text-muted-foreground">保存中…</span>}
        </header>

        {msg && (
          <div
            className={`text-sm rounded-md px-3 py-2 ${
              msg.kind === "error"
                ? "text-destructive bg-destructive/10"
                : "text-muted-foreground bg-muted"
            }`}
          >
            {msg.text}
          </div>
        )}

        <div className="flex gap-1 flex-wrap">
          {([{ key: "all", label: "全部" }] as { key: "all" | Status; label: string }[])
            .concat(ORDER.map((s) => ({ key: s as "all" | Status, label: STATUS[s] })))
            .map((t) => (
              <Badge
                key={t.key}
                variant={filter === t.key ? "default" : "outline"}
                className="cursor-pointer select-none"
                onClick={() => setFilter(t.key)}
              >
                {t.label}
              </Badge>
            ))}
        </div>

        <form
          className="flex gap-2 items-center border rounded-xl p-2"
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
            placeholder="新模组名称，例如：不宜照射之光"
            className="flex-1"
          />
          <Select value={newStatus} onValueChange={(v) => setNewStatus(v as Status)}>
            <SelectTrigger className="w-28">
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
            <div className="text-sm text-muted-foreground text-center py-10">
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
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center cursor-zoom-out"
          onClick={() => setViewer(null)}
        >
          <img src={viewer.src} alt={viewer.name} className="max-w-[86%] max-h-[86%] rounded-xl" />
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
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-background border rounded-xl w-full max-w-3xl max-h-[86vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <FileSpreadsheet className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium truncate flex-1">{preview.pcName} 的卡背</span>
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="关闭" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {preview.sheets.length > 1 && (
          <div className="flex gap-1 px-4 py-2 border-b flex-wrap">
            {preview.sheets.map((s, i) => (
              <Badge
                key={s.name || i}
                variant={i === tab ? "default" : "outline"}
                className="cursor-pointer select-none"
                onClick={() => setTab(i)}
              >
                {s.name || `表 ${i + 1}`}
              </Badge>
            ))}
          </div>
        )}
        <div className="overflow-auto flex-1 p-4">
          <table className="w-full text-xs border-collapse">
            <tbody>
              {sheet.rows.map((row, ri) => (
                <tr key={ri} className={ri === 0 ? "font-medium" : ""}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="border border-border px-2 py-1 whitespace-nowrap max-w-56 overflow-hidden text-ellipsis"
                    >
                      {String(cell ?? "")}
                    </td>
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
  run: (fn: () => Promise<unknown>, note?: string) => Promise<void>;
  onViewPhoto: (src: string, name: string) => void;
  onPreview: (pc: Pc) => void;
}) {
  const [pcName, setPcName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(m.name);

  return (
    <div className="group border rounded-xl p-3 flex flex-col gap-2 transition-colors hover:border-foreground/30">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`h-2 w-2 rounded-full shrink-0 ${
            m.status === "planned"
              ? "bg-amber-500"
              : m.status === "ongoing"
                ? "bg-green-600"
                : "bg-muted-foreground/50"
          }`}
        />
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

        <div className="flex border rounded-lg overflow-hidden shrink-0">
          {ORDER.map((s, i) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              className={`px-2.5 py-1 text-xs transition-colors ${i > 0 ? "border-l" : ""} ${
                m.status === s
                  ? s === "planned"
                    ? "bg-amber-500/15"
                    : s === "ongoing"
                      ? "bg-green-600/15"
                      : "bg-muted"
                  : "text-muted-foreground hover:bg-muted/60"
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

      <div className="flex flex-col gap-2 mt-1">
        {m.pcs.length === 0 && <div className="text-[13px] text-muted-foreground">还没有 PC</div>}
        {m.pcs.map((p) => (
          <PcRow
            key={p.id}
            moduleId={m.id}
            pc={p}
            busy={busy}
            run={run}
            onViewPhoto={onViewPhoto}
            onPreview={onPreview}
          />
        ))}
      </div>

      <form
        className="flex gap-2 mt-1"
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
          className="flex-1 h-9"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={busy}>
          <Plus className="h-4 w-4 mr-1" />
          添加 PC
        </Button>
      </form>
    </div>
  );
}

function PcRow({
  moduleId,
  pc: p,
  busy,
  run,
  onViewPhoto,
  onPreview,
}: {
  moduleId: string;
  pc: Pc;
  busy: boolean;
  run: (fn: () => Promise<unknown>, note?: string) => Promise<void>;
  onViewPhoto: (src: string, name: string) => void;
  onPreview: (pc: Pc) => void;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLInputElement>(null);

  async function onPhoto(file: File) {
    try {
      const raw = await readFile(file, true);
      const small = (await downscale(raw)) || raw;
      await run(() => setPhoto(moduleId, p.id, small), "照片已更新");
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function onCard(file: File) {
    try {
      const bin = await readFile(file, false);
      const data = btoa(bin);
      await run(
        () => setCard(moduleId, p.id, { name: file.name, data, sizeBytes: file.size }),
        `已关联卡背「${file.name}」`
      );
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function downloadCard() {
    try {
      const buf = await getCardArrayBuffer(p.id!);
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
              run(() => setPhoto(moduleId, p.id, null), "已移除照片");
            }}
          >
            <X className="h-4 w-4" />
          </span>
        </button>
      ) : (
        <div className="h-10 w-10 rounded-full border bg-muted flex items-center justify-center text-sm text-muted-foreground shrink-0">
          {(p.name || "?").slice(0, 1)}
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-sm truncate">{p.name}</span>
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
          onClick={() => run(() => removePc(moduleId, p.id), "已移除 PC")}
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
