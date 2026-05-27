import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ShoppingCart, Coins } from "lucide-react";

// Hardcoded item catalog (Pokérole 2.0 — Items chapter).
// `battle` items go to trainer.battle_items_list; the rest go to bag_list.
type ShopItem = {
  key: string;
  name: string;
  price: number;
  category: "balls" | "potions" | "berries" | "battle" | "evolution" | "tm" | "misc";
  battle?: boolean;
  desc?: string;
};

const ITEMS: ShopItem[] = [
  // Pokéballs
  { key: "pokeball",     name: "Pokéball",        price: 200,  category: "balls", desc: "Standard ball (pool 4)" },
  { key: "greatball",    name: "Greatball",       price: 600,  category: "balls", desc: "Pool 6" },
  { key: "ultraball",    name: "Ultraball",       price: 1200, category: "balls", desc: "Pool 8" },
  { key: "premier",      name: "Premier Ball",    price: 200,  category: "balls" },
  { key: "netball",      name: "Net Ball",        price: 1000, category: "balls", desc: "+2 vs Water/Bug" },
  { key: "diveball",     name: "Dive Ball",       price: 1000, category: "balls", desc: "+2 underwater" },
  { key: "nestball",     name: "Nest Ball",       price: 1000, category: "balls", desc: "+2 vs weaker pokémon" },
  { key: "repeatball",   name: "Repeat Ball",     price: 1000, category: "balls", desc: "+2 vs already-caught species" },
  { key: "timerball",    name: "Timer Ball",      price: 1000, category: "balls", desc: "+1 per round (max +3)" },
  { key: "luxuryball",   name: "Luxury Ball",     price: 1000, category: "balls", desc: "+1 happiness on capture" },
  { key: "duskball",     name: "Dusk Ball",       price: 1000, category: "balls", desc: "+2 at night / in caves" },
  { key: "healball",     name: "Heal Ball",       price: 300,  category: "balls", desc: "Full heal on capture" },
  { key: "quickball",    name: "Quick Ball",      price: 1000, category: "balls", desc: "+3 on first round" },

  // Potions
  { key: "potion",       name: "Potion",          price: 300,  category: "potions", desc: "Heals 2 HP" },
  { key: "superpotion",  name: "Super Potion",    price: 700,  category: "potions", desc: "Heals 4 HP" },
  { key: "hyperpotion",  name: "Hyper Potion",    price: 1500, category: "potions", desc: "Full heal" },
  { key: "maxpotion",    name: "Max Potion",      price: 2500, category: "potions", desc: "Full HP & Will" },
  { key: "revive",       name: "Revive",          price: 1500, category: "potions", desc: "Revives fainted pokémon at ½ HP" },
  { key: "maxrevive",    name: "Max Revive",      price: 4000, category: "potions", desc: "Full revive" },
  { key: "antidote",     name: "Antidote",        price: 100,  category: "potions", desc: "Cures Poison" },
  { key: "burnheal",     name: "Burn Heal",       price: 250,  category: "potions", desc: "Cures Burn" },
  { key: "iceheal",      name: "Ice Heal",        price: 250,  category: "potions", desc: "Cures Frozen" },
  { key: "awakening",    name: "Awakening",       price: 250,  category: "potions", desc: "Cures Sleep" },
  { key: "paralyzeheal", name: "Paralyze Heal",   price: 200,  category: "potions", desc: "Cures Paralysis" },
  { key: "fullheal",     name: "Full Heal",       price: 600,  category: "potions", desc: "Cures all status" },

  // Berries (battle items)
  { key: "oranberry",    name: "Oran Berry",      price: 200,  category: "berries", battle: true, desc: "Heals 2 HP when held & low" },
  { key: "sitrusberry",  name: "Sitrus Berry",    price: 600,  category: "berries", battle: true, desc: "Heals 4 HP" },
  { key: "lumberry",     name: "Lum Berry",       price: 600,  category: "berries", battle: true, desc: "Cures any status" },
  { key: "chestoberry",  name: "Chesto Berry",    price: 250,  category: "berries", battle: true, desc: "Cures Sleep" },
  { key: "pechaberry",   name: "Pecha Berry",     price: 250,  category: "berries", battle: true, desc: "Cures Poison" },
  { key: "rawstberry",   name: "Rawst Berry",     price: 250,  category: "berries", battle: true, desc: "Cures Burn" },
  { key: "cheriberry",   name: "Cheri Berry",     price: 250,  category: "berries", battle: true, desc: "Cures Paralysis" },
  { key: "aspearberry",  name: "Aspear Berry",    price: 250,  category: "berries", battle: true, desc: "Cures Frozen" },
  { key: "leppaberry",   name: "Leppa Berry",     price: 800,  category: "berries", battle: true, desc: "Restores Will" },

  // Battle items
  { key: "xattack",      name: "X Attack",        price: 500,  category: "battle", battle: true, desc: "+1 Strength die" },
  { key: "xdefense",     name: "X Defense",       price: 550,  category: "battle", battle: true, desc: "+1 Defense" },
  { key: "xspatk",       name: "X Sp. Atk",       price: 500,  category: "battle", battle: true, desc: "+1 Special die" },
  { key: "xspdef",       name: "X Sp. Def",       price: 350,  category: "battle", battle: true, desc: "+1 Sp. Defense" },
  { key: "xspeed",       name: "X Speed",         price: 350,  category: "battle", battle: true, desc: "+1 Dexterity die" },
  { key: "xaccuracy",    name: "X Accuracy",      price: 950,  category: "battle", battle: true, desc: "+1 to accuracy rolls" },
  { key: "dirisle",      name: "Dire Hit",        price: 650,  category: "battle", battle: true, desc: "+1 crit chance" },
  { key: "guardspec",    name: "Guard Spec.",     price: 700,  category: "battle", battle: true, desc: "Prevents stat drops" },

  // Evolution / hold items
  { key: "firestone",    name: "Fire Stone",      price: 3000, category: "evolution" },
  { key: "waterstone",   name: "Water Stone",     price: 3000, category: "evolution" },
  { key: "thunderstone", name: "Thunder Stone",   price: 3000, category: "evolution" },
  { key: "leafstone",    name: "Leaf Stone",      price: 3000, category: "evolution" },
  { key: "moonstone",    name: "Moon Stone",      price: 3000, category: "evolution" },
  { key: "sunstone",     name: "Sun Stone",       price: 3000, category: "evolution" },
  { key: "dawnstone",    name: "Dawn Stone",      price: 3000, category: "evolution" },
  { key: "duskstone",    name: "Dusk Stone",      price: 3000, category: "evolution" },
  { key: "shinystone",   name: "Shiny Stone",     price: 3000, category: "evolution" },
  { key: "iceiston",     name: "Ice Stone",       price: 3000, category: "evolution" },

  // Misc
  { key: "escaperope",   name: "Escape Rope",     price: 550,  category: "misc" },
  { key: "repel",        name: "Repel",           price: 350,  category: "misc" },
  { key: "superrepel",   name: "Super Repel",     price: 500,  category: "misc" },
  { key: "maxrepel",     name: "Max Repel",       price: 700,  category: "misc" },
];

const CAT_LABEL: Record<ShopItem["category"], string> = {
  balls: "Pokéballs",
  potions: "Potions & Medicine",
  berries: "Berries",
  battle: "Battle items",
  evolution: "Evolution stones",
  tm: "TMs",
  misc: "Misc",
};

type InventoryItem = { name: string; qty: number };

export function Shop({ trainerId }: { trainerId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: trainer } = useQuery({
    queryKey: ["trainer-shop", trainerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainers")
        .select("id, money, bag_list, battle_items_list")
        .eq("id", trainerId)
        .single();
      if (error) throw error;
      return data as { id: string; money: number; bag_list: InventoryItem[]; battle_items_list: InventoryItem[] };
    },
  });

  const money = trainer?.money ?? 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ITEMS;
    return ITEMS.filter((it) => it.name.toLowerCase().includes(q));
  }, [search]);

  const byCat = useMemo(() => {
    const m = new Map<ShopItem["category"], ShopItem[]>();
    for (const it of filtered) {
      const arr = m.get(it.category) ?? [];
      arr.push(it);
      m.set(it.category, arr);
    }
    return m;
  }, [filtered]);

  async function buy(item: ShopItem) {
    if (!trainer) return;
    if (money < item.price) {
      toast.error(`Você precisa de ${item.price - money}₽ a mais.`);
      return;
    }
    const targetList = item.battle ? "battle_items_list" : "bag_list";
    const existing = (trainer[targetList] ?? []) as InventoryItem[];
    const idx = existing.findIndex((i) => i.name.toLowerCase() === item.name.toLowerCase());
    const next = existing.slice();
    if (idx >= 0) next[idx] = { ...next[idx], qty: (next[idx].qty ?? 1) + 1 };
    else next.push({ name: item.name, qty: 1 });

    const { error } = await supabase
      .from("trainers")
      .update({ money: money - item.price, [targetList]: next })
      .eq("id", trainerId);
    if (error) { toast.error(error.message); return; }
    toast.success(`Comprado: ${item.name}`);
    qc.invalidateQueries({ queryKey: ["trainer-shop", trainerId] });
    qc.invalidateQueries({ queryKey: ["trainer", trainerId] });
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <ShoppingCart className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold">Pokémart</h3>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">
          <Coins className="h-3 w-3" /> {money.toLocaleString()}₽
        </span>
      </div>

      <Input
        placeholder="Buscar item…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8"
      />

      {Array.from(byCat.entries()).map(([cat, items]) => (
        <section key={cat} className="space-y-1.5">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {CAT_LABEL[cat]}
          </h4>
          <div className="grid gap-1.5">
            {items.map((it) => {
              const canAfford = money >= it.price;
              return (
                <div
                  key={it.key}
                  className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold">{it.name}</span>
                      {it.battle && (
                        <span className="rounded bg-destructive/15 px-1 text-[9px] font-bold uppercase text-destructive">
                          battle
                        </span>
                      )}
                    </div>
                    {it.desc && (
                      <p className="text-[11px] text-muted-foreground">{it.desc}</p>
                    )}
                  </div>
                  <span className="text-xs font-bold tabular-nums text-amber-600 dark:text-amber-400">
                    {it.price.toLocaleString()}₽
                  </span>
                  <Button
                    size="sm"
                    variant={canAfford ? "default" : "outline"}
                    disabled={!canAfford}
                    onClick={() => buy(it)}
                    className="h-7 px-2"
                  >
                    Buy
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
