import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";

/**
 * Generic dialog to choose an image source: file upload or URL.
 * Calls `onPick(dataUrlOrUrl)` with either a data: URL (from file) or the typed URL.
 */
export function ImageSourceDialog({
  trigger,
  title = "Definir imagem",
  maxBytes = 5_000_000,
  onPick,
}: {
  trigger?: React.ReactNode;
  title?: string;
  maxBytes?: number;
  onPick: (url: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Selecione um arquivo de imagem."); return; }
    if (file.size > maxBytes) { toast.error(`Imagem deve ser menor que ${Math.round(maxBytes / 1_000_000)} MB.`); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await onPick(reader.result as string);
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível salvar a imagem.");
      }
    };
    reader.readAsDataURL(file);
  }

  async function applyUrl() {
    const u = url.trim();
    if (!u) { toast.error("Cole uma URL de imagem."); return; }
    try {
      await onPick(u);
      setUrl("");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a imagem.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="h-7">
            <ImagePlus className="mr-1 h-3 w-3" /> Imagem
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Arquivo de imagem</Label>
            <Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
          <div className="relative flex items-center"><div className="flex-1 border-t border-border" /><span className="px-2 text-[10px] uppercase text-muted-foreground">ou</span><div className="flex-1 border-t border-border" /></div>
          <div className="space-y-1.5">
            <Label className="text-xs">URL da imagem</Label>
            <div className="flex gap-1.5">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
              <Button onClick={applyUrl}>Usar</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
