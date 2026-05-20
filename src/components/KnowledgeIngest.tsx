import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { ingestKnowledge } from "@/lib/knowledge.functions";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";

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

export function KnowledgeIngest() {
  const ingest = useServerFn(ingestKnowledge);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState("pokerole-core");
  const [pasted, setPasted] = useState("");

  async function handlePdf(file: File) {
    setBusy(true);
    try {
      toast.info(`Reading ${file.name}…`);
      const text = await extractPdfText(file);
      if (text.trim().length < 100) throw new Error("Could not extract text from this PDF.");
      const res = await ingest({ data: { source, text, replace: true } });
      toast.success(`Indexed ${res.inserted} chunks from ${file.name}`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to ingest PDF");
    } finally {
      setBusy(false);
    }
  }

  async function handlePasted() {
    if (pasted.trim().length < 50) { toast.error("Paste at least 50 characters."); return; }
    setBusy(true);
    try {
      const res = await ingest({ data: { source, text: pasted, replace: true } });
      toast.success(`Indexed ${res.inserted} chunks`);
      setPasted("");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="h-7">
          <BookOpen className="mr-1 h-3.5 w-3.5" /> Rules
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Train the AI Narrator</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload the Pokérole 2.0 PDF (or any rules document). It will be chunked,
            embedded and used as ground truth by the AI Narrator during the session.
          </p>
          <div>
            <Label className="text-xs">Source label</Label>
            <Input value={source} onChange={(e) => setSource(e.target.value)} disabled={busy} />
          </div>
          <div>
            <Label className="text-xs">PDF file</Label>
            <Input
              type="file" accept="application/pdf" disabled={busy}
              onChange={(e) => e.target.files?.[0] && handlePdf(e.target.files[0])}
            />
          </div>
          <div className="text-center text-xs text-muted-foreground">— or paste text —</div>
          <Textarea
            value={pasted} onChange={(e) => setPasted(e.target.value)} disabled={busy}
            placeholder="Paste rules text here…" rows={6}
          />
          <DialogFooter>
            <Button onClick={handlePasted} disabled={busy || pasted.trim().length < 50}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Index pasted text
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
