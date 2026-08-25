import { useMemo, useRef, useState } from "react";
import { BookOpen, FileArchive, PackageCheck, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseLcpFile } from "@/lib/lancer/content";
import type { LancerCompendiumItem, LancerContentPack, LancerContentType } from "@/lib/lancer/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Props = {
  gameId: string;
  isNarrator: boolean;
  packs: LancerContentPack[];
  items: LancerCompendiumItem[];
  onChanged: () => void;
};

const TYPE_LABELS: Partial<Record<LancerContentType, string>> = {
  frame: "Frames",
  weapon: "Weapons",
  system: "Systems",
  pilot_gear: "Pilot Gear",
  pilot_armor: "Pilot Armor",
  talent: "Talents",
  license: "Licenses",
  core_bonus: "Core Bonuses",
  npc_class: "NPC Classes",
  npc_template: "NPC Templates",
  npc_feature: "NPC Features",
  status: "Status",
  condition: "Conditions",
  reserve: "Reserves",
  other: "Other",
};

export function LancerContentManager({ gameId, isNarrator, packs, items, onChanged }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("all");
  const enabledPacks = useMemo(() => new Set(packs.filter((pack) => pack.enabled).map((pack) => pack.id)), [packs]);
  const visibleItems = useMemo(() => items.filter((item) => {
    if (item.pack_id && !enabledPacks.has(item.pack_id)) return false;
    if (type !== "all" && item.item_type !== type) return false;
    const needle = search.trim().toLowerCase();
    return !needle || `${item.name} ${item.description ?? ""} ${item.source_name ?? ""}`.toLowerCase().includes(needle);
  }), [enabledPacks, items, search, type]);

  async function importPack(file: File) {
    setBusy(true);
    try {
      const parsed = await parseLcpFile(file);
      const { error } = await supabase.rpc("import_lancer_content_pack" as never, {
        p_game_id: gameId,
        p_manifest: parsed.manifest,
        p_items: parsed.items,
      } as never);
      if (error) throw error;
      parsed.warnings.forEach((warning) => toast.warning(warning));
      toast.success(`${String(parsed.manifest.name)} importado com ${parsed.items.length} item(ns).`);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao importar o LCP.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function togglePack(pack: LancerContentPack, enabled: boolean) {
    const { error } = await (supabase.from("lancer_content_packs" as never) as never as {
      update: (value: object) => { eq: (column: string, value: string) => Promise<{ error: { message: string } | null }> };
    }).update({ enabled, updated_at: new Date().toISOString() }).eq("id", pack.id);
    if (error) toast.error(error.message);
    else onChanged();
  }

  async function deletePack(pack: LancerContentPack) {
    if (!window.confirm(`Excluir ${pack.name} e seus itens desta campanha?`)) return;
    const { error } = await (supabase.from("lancer_content_packs" as never) as never as {
      delete: () => { eq: (column: string, value: string) => Promise<{ error: { message: string } | null }> };
    }).delete().eq("id", pack.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Pacote removido.");
      onChanged();
    }
  }

  const availableTypes = [...new Set(items.map((item) => item.item_type))].sort();
  return (
    <div className="mx-auto grid h-full max-w-7xl gap-5 overflow-hidden lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-auto border border-border bg-[#0e151d] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black uppercase">Content Manager</h2>
            <p className="text-xs text-muted-foreground">Pacotes LCP da campanha</p>
          </div>
          {isNarrator && (
            <Button size="icon" className="h-9 w-9" disabled={busy} onClick={() => inputRef.current?.click()} title="Importar LCP">
              <Upload className="h-4 w-4" />
            </Button>
          )}
          <input ref={inputRef} hidden type="file" accept=".lcp" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importPack(file);
          }} />
        </div>
        <div className="mt-4 space-y-2">
          {packs.length ? packs.map((pack) => (
            <div key={pack.id} className="border-l-2 border-cyan-400/40 bg-background/40 p-3">
              <div className="flex items-start gap-2">
                <PackageCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-black uppercase">{pack.name}</div>
                  <div className="text-[10px] text-muted-foreground">v{pack.version}{pack.author ? ` · ${pack.author}` : ""}</div>
                </div>
                {isNarrator && <Switch checked={pack.enabled} onCheckedChange={(enabled) => void togglePack(pack, enabled)} />}
              </div>
              {pack.description && <p className="mt-2 line-clamp-3 text-[10px] text-muted-foreground">{pack.description}</p>}
              {isNarrator && (
                <Button variant="ghost" size="sm" className="mt-2 h-7 px-2 text-destructive" onClick={() => void deletePack(pack)}>
                  <Trash2 className="mr-1 h-3 w-3" /> Excluir
                </Button>
              )}
            </div>
          )) : (
            <div className="border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              <FileArchive className="mx-auto mb-2 h-5 w-5" /> Nenhum LCP importado.
            </div>
          )}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col overflow-hidden">
        <div className="grid gap-2 border-b border-border pb-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar o compêndio" className="pl-9" />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {availableTypes.map((itemType) => <SelectItem key={itemType} value={itemType}>{TYPE_LABELS[itemType] ?? itemType}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="py-2 text-[10px] font-bold uppercase text-muted-foreground">{visibleItems.length} item(ns) disponíveis</div>
        <ScrollArea className="min-h-0 flex-1 pr-3">
          <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {visibleItems.map((item) => (
              <article key={item.id} className="border border-border bg-[#0e151d] p-3">
                <div className="flex items-start gap-2">
                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-black uppercase">{item.name}</h3>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="outline" className="rounded-sm text-[9px]">{TYPE_LABELS[item.item_type] ?? item.item_type}</Badge>
                      <Badge variant="secondary" className="rounded-sm text-[9px]">{item.source_name ?? item.source_type}</Badge>
                    </div>
                  </div>
                </div>
                {item.description && <p className="mt-3 line-clamp-5 whitespace-pre-line text-[11px] leading-relaxed text-muted-foreground">{item.description}</p>}
              </article>
            ))}
          </div>
        </ScrollArea>
      </section>
    </div>
  );
}
