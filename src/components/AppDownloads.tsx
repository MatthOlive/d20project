import { MonitorDown, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileInstall } from "@/components/MobileInstall";

export function AppDownloads() {
  return (
    <section aria-label="Downloads do aplicativo" className="my-5 rounded-xl border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-base font-bold">Leve sua mesa com você</h2>
      <p className="mt-1 text-sm text-muted-foreground">Instale no celular ou baixe a versão mais recente para Windows.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <MobileInstall showLabel />
        <Button asChild variant="outline"><a href="/download/pc"><MonitorDown className="mr-2 h-4 w-4" />Download no PC</a></Button>
      </div>
      <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Smartphone className="h-3 w-3" />No celular, o aplicativo é instalado pelo navegador.</p>
    </section>
  );
}
