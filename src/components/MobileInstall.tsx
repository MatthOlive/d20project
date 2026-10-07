import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function MobileInstall({ showLabel = false }: { showLabel?: boolean }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(true);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(standalone.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone || "__TAURI_INTERNALS__" in window);
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    update();
    standalone.addEventListener("change", update);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      standalone.removeEventListener("change", update);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  if (installed && !showLabel) return null;
  async function install() {
    if (!prompt) { setHelp(true); return; }
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch { setHelp(true); }
    finally { setPrompt(null); }
  }
  return <>
    <Button variant="secondary" size="sm" disabled={installed} onClick={() => void install()} aria-label="Instalar aplicativo no celular">
      <Download className="h-4 w-4 sm:mr-2" /><span className={showLabel ? "ml-2" : "hidden sm:inline"}>{showLabel ? (installed ? "Mobile instalado" : "Download mobile") : "Instalar"}</span>
    </Button>
    <Dialog open={help} onOpenChange={setHelp}>
      <DialogContent>
        <DialogHeader><DialogTitle>D20 Project no celular</DialogTitle>
          <DialogDescription>Abra o aplicativo diretamente pela tela inicial.</DialogDescription></DialogHeader>
        <p className="text-sm">No iPhone ou iPad, abra este site no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”.</p>
        <p className="text-sm">No Android, abra o menu do Chrome e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.</p>
        <p className="text-sm text-muted-foreground">As mesas, o chat e a sincronização precisam de conexão com a internet.</p>
      </DialogContent>
    </Dialog>
  </>;
}
