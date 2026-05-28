import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerFn } from "@tanstack/react-start";
import { ingestKnowledge, deleteKnowledgeSource } from "@/lib/knowledge.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Settings as SettingsIcon, Loader2, Plus, BookOpen, Upload, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";

export type RpgSystem = { id: string; label: string; available: boolean };

export const RPG_SYSTEMS: RpgSystem[] = [
  { id: "pokerole", label: "Pokérole 2.0", available: true },
  { id: "dnd", label: "D&D", available: false },
  { id: "t20", label: "Tormenta 20", available: false },
];

async function extractPdfText(file: File): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workerMod: any = await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += (content.items as { str: string }[]).map((it) => it.str).join(" ") + "\n\n";
  }
  return text;
}

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="h-7">
          <SettingsIcon className="mr-1 h-3.5 w-3.5" /> Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Settings</DialogTitle></DialogHeader>
        <RulesSection />
      </DialogContent>
    </Dialog>
  );
}

function RulesSection() {
  const qc = useQueryClient();
  const ingest = useServerFn(ingestKnowledge);
  const delSource = useServerFn(deleteKnowledgeSource);

  const { data: sources } = useQuery({
    queryKey: ["knowledge-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_chunks")
        .select("source")
        .limit(1000);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const r of data ?? []) map.set(r.source, (map.get(r.source) ?? 0) + 1);
      return Array.from(map.entries()).map(([id, count]) => ({ id, count }));
    },
  });

  const [adding, setAdding] = useState(false);
  const [system, setSystem] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(files: FileList | File[]) {
    if (!system) { toast.error("Selecione um sistema"); return; }
    const list = Array.from(files).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (list.length === 0) { toast.error("Envie ao menos um PDF"); return; }
    setBusy(true);
    try {
      for (const f of list) {
        toast.info(`Lendo ${f.name}…`);
        const text = await extractPdfText(f);
        if (text.trim().length < 100) { toast.error(`Não foi possível extrair texto de ${f.name}`); continue; }
        const res = await ingest({ data: { source: system, text, replace: false } });
        toast.success(`${f.name}: ${res.inserted} trechos indexados`);
      }
      qc.invalidateQueries({ queryKey: ["knowledge-sources"] });
      setAdding(false);
      setSystem("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao indexar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4" /> Regras para a IA
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Adicione PDFs por sistema. A IA Narradora usará esses documentos como base de regras.
          </p>
        </div>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
          </Button>
        )}
      </div>

      {adding && (
        <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/30 p-4">
          <div>
            <Label className="text-xs">Sistema</Label>
            <Select value={system} onValueChange={setSystem} disabled={busy}>
              <SelectTrigger><SelectValue placeholder="Selecione um sistema" /></SelectTrigger>
              <SelectContent>
                {RPG_SYSTEMS.map((s) => (
                  <SelectItem key={s.id} value={s.id} disabled={!s.available}>
                    {s.label}{!s.available ? " — em breve" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-8 text-center transition ${
              dragOver ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            {busy ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="h-6 w-6 text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground">
              Arraste PDFs aqui ou
            </p>
            <label>
              <input
                type="file"
                accept="application/pdf"
                multiple
                disabled={busy || !system}
                className="hidden"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
              />
              <Button asChild size="sm" variant="outline" disabled={busy || !system}>
                <span className="cursor-pointer">Selecionar PDFs</span>
              </Button>
            </label>
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setSystem(""); }} disabled={busy}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(sources ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum sistema indexado ainda.</p>
        ) : (
          sources!.map((s) => {
            const meta = RPG_SYSTEMS.find((r) => r.id === s.id);
            return (
              <div key={s.id} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-semibold">{meta?.label ?? s.id}</p>
                    <p className="text-xs text-muted-foreground">{s.count} trechos indexados</p>
                  </div>
                </div>
                <Button
                  size="sm" variant="ghost"
                  onClick={async () => {
                    if (!confirm(`Remover regras de ${meta?.label ?? s.id}?`)) return;
                    const { error } = await supabase.from("knowledge_chunks").delete().eq("source", s.id);
                    if (error) { toast.error(error.message); return; }
                    toast.success("Removido");
                    qc.invalidateQueries({ queryKey: ["knowledge-sources"] });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
