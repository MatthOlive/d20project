import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Cloud, Plus, Search, ShoppingCart, Users } from "lucide-react";
import type { DragCharacterPayload } from "@/components/MapBoard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { CharacterDragPreview, useCharacterPointerDrag } from "@/hooks/use-character-pointer-drag";
import { useDigiRoleRoster, type DigiRoleRosterEntry } from "@/hooks/use-digirole-roster";
import { DigiRoleImage } from "@/components/digirole/DigiRoleImage";

type ShopItem = {
  id: string;
  name: string;
  item_type: string;
  description: string;
  price: number;
};

function table(name: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase.from(name as never) as any;
}

function payloadFor(digimon: DigiRoleRosterEntry): DragCharacterPayload {
  return {
    kind: "digirole_digimon",
    id: digimon.id,
    label: digimon.nickname || digimon.species?.name || "Digimon",
    imageUrl: digimon.image_hidden ? null : digimon.image_url || digimon.species?.image_url || null,
    ownerId: digimon.owner_id,
  };
}

export function DigiRoleRoster({
  tamerId,
  gameId,
  view,
  canEdit,
  onAssign,
  onBuy,
  onOpenDigimon,
}: {
  tamerId: string;
  gameId: string;
  view: "team" | "cloud" | "shop";
  canEdit: boolean;
  onAssign: (digimonId: string, slot: number | null) => Promise<void>;
  onBuy: (item: ShopItem) => void;
  onOpenDigimon?: (digimonId: string) => void;
}) {
  const [cloudSearch, setCloudSearch] = useState("");
  const pointerDrag = useCharacterPointerDrag();
  const rosterQuery = useDigiRoleRoster(tamerId, gameId);
  const shopQuery = useQuery({
    queryKey: ["digirole-shop"],
    enabled: view === "shop",
    queryFn: async (): Promise<ShopItem[]> => {
      const result = await table("digirole_items")
        .select("id,name,item_type,description,price")
        .order("item_type")
        .order("name");
      if (result.error) throw result.error;
      return (result.data ?? []) as ShopItem[];
    },
  });

  const roster = rosterQuery.data ?? [];
  const groups = useMemo(
    () =>
      (shopQuery.data ?? []).reduce<Record<string, ShopItem[]>>((all, item) => {
        (all[item.item_type] ??= []).push(item);
        return all;
      }, {}),
    [shopQuery.data],
  );

  function DraggableDigimon({ digimon }: { digimon: DigiRoleRosterEntry }) {
    const payload = payloadFor(digimon);
    return (
      <article
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
        onMouseDown={canEdit ? (event) => pointerDrag.beginMouse(event, payload) : undefined}
        onPointerDown={
          canEdit
            ? (event) => {
                if (event.pointerType === "mouse") return;
                pointerDrag.begin(event, payload);
              }
            : undefined
        }
        onClick={() => {
          if (pointerDrag.consumeSuppressedClick()) return;
          onOpenDigimon?.(digimon.id);
        }}
        style={canEdit ? { touchAction: "none", userSelect: "none" } : undefined}
        className="flex min-w-0 cursor-pointer items-center gap-3 rounded-md border border-border bg-card p-3 text-left transition hover:bg-accent"
      >
        {payload.imageUrl ? (
          <DigiRoleImage
            src={payload.imageUrl}
            speciesName={digimon.species?.name}
            alt=""
            draggable={false}
            className="h-14 w-14 shrink-0 object-contain"
          />
        ) : (
          <div className="h-14 w-14 shrink-0 rounded bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-sm">{payload.label}</strong>
          <span className="block truncate text-[10px] text-muted-foreground">
            {digimon.species?.name} · {digimon.species?.stage}
          </span>
        </div>
        {canEdit && digimon.team_slot != null && (
          <Button
            size="icon"
            variant="ghost"
            title="Mover para a Nuvem"
            onClick={(event) => {
              event.stopPropagation();
              void onAssign(digimon.id, null);
            }}
          >
            <Cloud className="h-4 w-4" />
          </Button>
        )}
        {canEdit && digimon.team_slot == null && (
          <Button
            size="icon"
            variant="ghost"
            title="Adicionar ao primeiro espaço do Time"
            onClick={(event) => {
              event.stopPropagation();
              void onAssign(digimon.id, 0);
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </article>
    );
  }

  if (view === "team") {
    return (
      <section className="p-4" data-digirole-roster-drop-target="true">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-black uppercase">Time</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((slot) => {
            const digimon = roster.find((entry) => entry.team_slot === slot);
            return (
              <div
                key={slot}
                data-digirole-team-slot={slot}
                className="min-h-20 rounded-md border border-dashed border-border p-2"
              >
                {digimon ? (
                  <DraggableDigimon digimon={digimon} />
                ) : (
                  <div className="flex h-16 items-center justify-center text-xs text-muted-foreground">
                    Espaço {slot} vazio
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <CharacterDragPreview preview={pointerDrag.preview} />
      </section>
    );
  }

  if (view === "cloud") {
    const search = cloudSearch.trim().toLocaleLowerCase("pt-BR");
    const cloud = roster.filter((entry) => {
      if (entry.team_slot != null) return false;
      if (!search) return true;
      return [entry.nickname, entry.species?.name, entry.species?.stage]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(search));
    });
    const cloudTotal = roster.filter((entry) => entry.team_slot == null).length;
    return (
      <section
        className="p-4"
        data-digirole-roster-drop-target="true"
        data-digirole-cloud-target="true"
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Boxes className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-black uppercase">Nuvem</h3>
          <label className="relative ml-auto min-w-48 flex-1 sm:max-w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={cloudSearch}
              onChange={(event) => setCloudSearch(event.target.value)}
              placeholder="Buscar na Nuvem"
              className="h-9 pl-8"
            />
          </label>
        </div>
        <div className="grid max-h-[38rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {cloud.map((digimon) => (
            <DraggableDigimon key={digimon.id} digimon={digimon} />
          ))}
        </div>
        {!rosterQuery.isLoading && cloud.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
            {cloudTotal === 0
              ? "Arraste um Digimon para guardar na Nuvem."
              : "Nenhum Digimon encontrado."}
          </p>
        )}
        <CharacterDragPreview preview={pointerDrag.preview} />
      </section>
    );
  }

  return (
    <section className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShoppingCart className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-black uppercase">Loja</h3>
      </div>
      <div className="max-h-[42rem] space-y-4 overflow-y-auto pr-1">
        {Object.entries(groups).map(([type, items]) => (
          <div key={type}>
            <h4 className="mb-1 text-[10px] font-black uppercase text-primary">{type}</h4>
            <div className="space-y-1">
              {items.map((item) => (
                <article
                  key={item.id}
                  className="flex items-center gap-2 rounded border border-border p-2"
                >
                  <div className="min-w-0 flex-1">
                    <strong className="block text-xs">{item.name}</strong>
                    <p className="text-[10px] text-muted-foreground">{item.description}</p>
                  </div>
                  <span className="whitespace-nowrap text-xs font-bold">{item.price} B</span>
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={() => onBuy(item)}>
                      Comprar
                    </Button>
                  )}
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
