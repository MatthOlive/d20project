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
  category: "balls" | "potions" | "heals" | "revives" | "berries" | "herbal" | "drinks" | "protection" | "travel" | "gear";
  battle?: boolean;
  desc?: string;
  effect?: string;
};

const ITEMS: ShopItem[] = [
  // Pokéballs (battle items)
  { key: "pokeball",   name: "Pokéball",   price: 200,  category: "balls", battle: true, desc: "A basic ball for catching Pokémon and carrying heavy items.", effect: "Seal potency: 4 dice" },
  { key: "greatball",  name: "Greatball",  price: 600,  category: "balls", battle: true, desc: "A sturdier barrier protects the seal allowing an easier catch.", effect: "Seal potency: 6 dice" },
  { key: "ultraball",  name: "Ultraball",  price: 1200, category: "balls", battle: true, desc: "The best seal in the market to ensure the catch of stronger Pokémon.", effect: "Seal potency: 8 dice" },

  // Potions
  { key: "potion",      name: "Potion",       price: 400,  category: "potions", battle: true, desc: "Pocket sized spray potion to relieve pain and heal bruises.", effect: "2 units" },
  { key: "superpotion", name: "Super Potion", price: 700,  category: "potions", battle: true, desc: "Concentrated formula. Closes wounds and heals cracked bones.", effect: "4 units" },
  { key: "hyperpotion", name: "Hyper Potion", price: 1200, category: "potions", battle: true, desc: "Best value pack. Can be rationed or used all at once.", effect: "14 units" },
  { key: "maxpotion",   name: "Max Potion",   price: 1700, category: "potions", desc: "Single-use capsule. Pokémon won't restore until next day.", effect: "Recover full HP" },
  { key: "fullrestore", name: "Full Restore", price: 2000, category: "potions", desc: "Deluxe single-use capsule. Pokémon won't restore until next day.", effect: "Recover full HP & heal status" },

  // Heals
  { key: "antidote",     name: "Antidote",      price: 100, category: "heals", battle: true, desc: "Quickly reduces the fever and relieves the pain.", effect: "Heals Poison / Poison+" },
  { key: "awakening",    name: "Awakening",     price: 250, category: "heals", battle: true, desc: "Water-based solution to awake a drowsy Pokémon.", effect: "Heals Sleep" },
  { key: "burnheal",     name: "Burn Heal",     price: 250, category: "heals", battle: true, desc: "Powder that douses the fire and aids healing.", effect: "Heals Burn 1/2/3" },
  { key: "iceheal",      name: "Ice Heal",      price: 250, category: "heals", battle: true, desc: "Recovers normal temperature and heals frost biting.", effect: "Heals Frozen Solid" },
  { key: "paralyzeheal", name: "Paralyze Heal", price: 200, category: "heals", battle: true, desc: "Relaxes the muscles and stops cramping.", effect: "Heals Paralysis" },
  { key: "fullheal",     name: "Full Heal",     price: 600, category: "heals", battle: true, desc: "Superior spray formula that cures any status in a second.", effect: "Heals all status ailments" },

  // Revives
  { key: "revive", name: "Revive", price: 1500, category: "revives", desc: "Small energy shard that brings a fainted Human or Pokémon back to consciousness.", effect: "Recover 1 HP & restore awareness" },

  // Berries (battle)
  { key: "aspearberry", name: "Aspear Berry", price: 0, category: "berries", battle: true, desc: "Rare. Rises body temperature, thawing ice.", effect: "Heals Frozen Solid" },
  { key: "cheriberry",  name: "Cheri Berry",  price: 0, category: "berries", battle: true, desc: "Uncommon. Spicy flavor reinvigorates the muscles.", effect: "Heals Paralysis" },
  { key: "chestoberry", name: "Chesto Berry", price: 0, category: "berries", battle: true, desc: "Common. Tough and dry, heals drowsiness.", effect: "Heals Sleep" },
  { key: "oranberry",   name: "Oran Berry",   price: 0, category: "berries", battle: true, desc: "Uncommon. Delicious citric berry that numbs pain.", effect: "Heals 1 damage" },
  { key: "pechaberry",  name: "Pecha Berry",  price: 0, category: "berries", battle: true, desc: "Uncommon. Sweet pulp absorbs simple poison.", effect: "Heals Poison" },
  { key: "persimberry", name: "Persim Berry", price: 0, category: "berries", battle: true, desc: "Common. Strong flavored berry to snap out of confusion.", effect: "Heals Confusion" },
  { key: "rawstberry",  name: "Rawst Berry",  price: 0, category: "berries", battle: true, desc: "Uncommon. Liquid pulp stops fire from spreading.", effect: "Heals Burn 1/2" },
  { key: "sitrusberry", name: "Sitrus Berry", price: 0, category: "berries", battle: true, desc: "Rare. Bigger, sweeter Oran family berry.", effect: "Heals 3 damage or 1 lethal" },
  { key: "lumberry",    name: "Lum Berry",    price: 0, category: "berries", battle: true, desc: "Rare. Said to cure everything.", effect: "Heals all status ailments" },

  // Herbal medicine
  { key: "energyroot",   name: "Energy Root",   price: 800,  category: "herbal", desc: "Nasty tasting mystical root. Eaten whole or turned into powder.", effect: "Equals 14 units of potion" },
  { key: "energypowder", name: "Energy Powder", price: 450,  category: "herbal", desc: "Horrid aftertaste, but stops the pain.", effect: "Equals 4 units of potion" },
  { key: "healpowder",   name: "Heal Powder",   price: 500,  category: "herbal", desc: "Mix of foul herbs makes a cure-all powder.", effect: "Heals any status ailment" },
  { key: "revivalherb",  name: "Revival Herb",  price: 2800, category: "herbal", desc: "Awful flavor but gets you back to consciousness. Extremely rare.", effect: "Recover full HP & restore awareness" },

  // Energy drinks
  { key: "berryjuice", name: "Berry Juice", price: 100, category: "drinks", desc: "Mixed drink of various berries, quite refreshing.", effect: "Restores up to 2 HP" },
  { key: "freshwater", name: "Fresh Water", price: 200, category: "drinks", desc: "Full of electrolytes, restores vitality.", effect: "Restores up to 4 HP" },
  { key: "sodapop",    name: "Sodapop",     price: 250, category: "drinks", desc: "Sugary drink gives a quick shot of energy.", effect: "Restores up to 5 HP" },
  { key: "lemonade",   name: "Lemonade",    price: 300, category: "drinks", desc: "Citric boost and vitamins. Favorite after exercise.", effect: "Restores up to 6 HP" },
  { key: "moomoomilk", name: "MooMoo Milk", price: 350, category: "drinks", desc: "Organic farm milk full of calcium, right out of the Miltank.", effect: "Restores up to 7 HP" },

  // Protection
  { key: "pokedoll",     name: "Pokédoll",         price: 1000, category: "protection", desc: "Life-size decoy used to escape wild Pokémon." },
  { key: "pokemonrepel", name: "Pokémon Repel",    price: 350,  category: "protection", desc: "Pokémon won't come near you for a whole day. Machine-washable." },
  { key: "pepperspray",  name: "Pepper Spray Can", price: 50,   category: "protection", desc: "Scares small Pokémon, may enrage bigger ones. 5 uses." },

  // Travel
  { key: "mountainbike",   name: "Mountain Bike",   price: 1500, category: "travel", desc: "Travel twice as fast with this awesome all-terrain bike." },
  { key: "inflatableboat", name: "Inflatable Boat", price: 1000, category: "travel", desc: "Small boat for one person. Pokémon may pull you through water." },
  { key: "fishingrod",     name: "Fishing Rod",     price: 300,  category: "travel", desc: "Catch Pokémon living underwater." },
  { key: "saddle",         name: "Saddle",          price: 500,  category: "travel", desc: "Never worry about falling from your Pokémon again." },
  { key: "sled",           name: "Sled",            price: 400,  category: "travel", desc: "Pulls you through snow, sand or smooth surfaces." },

  // Trainer gear
  { key: "bigtent",        name: "Big Camping Tent",        price: 2500, category: "gear", desc: "Spacious tent for a cozy night. Sprayed with Wild Pokémon repellent." },
  { key: "smalltent",      name: "Small Camping Tent",      price: 800,  category: "gear", desc: "Comfortable space for 1 person, or 2 if squeezing." },
  { key: "sleepingbag",    name: "Sleeping Bag",            price: 500,  category: "gear", desc: "Not too comfortable. After a few nights your back may hurt." },
  { key: "stovecookware",  name: "Camping Stove & Cookware",price: 2000, category: "gear", desc: "Always have a warm meal on the road." },
  { key: "cannedmeal",     name: "Canned Meal",             price: 15,   category: "gear", desc: "Enough to travel on. One can per day." },
  { key: "regionalmap",    name: "Regional Map",            price: 50,   category: "gear", desc: "Marked routes, cities and Pokémon Centers of the region." },
  { key: "compass",        name: "Compass",                 price: 100,  category: "gear", desc: "Points you in the right direction. Keep away from magnets." },
  { key: "pokedex",        name: "Pokédex",                 price: 5000, category: "gear", desc: "Digital encyclopedia with regional Pokémon info." },
  { key: "pokedexupgrade", name: "Pokédex Upgrade",         price: 2500, category: "gear", desc: "Add another region's Pokémon to your Pokédex." },
];

const CAT_LABEL: Record<ShopItem["category"], string> = {
  balls: "Pokéballs",
  potions: "Potions",
  heals: "Heals",
  revives: "Revives",
  berries: "Berries",
  herbal: "Herbal Medicine",
  drinks: "Energy Drinks",
  protection: "Protection Items",
  travel: "Items for Traveling",
  gear: "Trainer Gear",
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

    const patch = item.battle
      ? { money: money - item.price, battle_items_list: next }
      : { money: money - item.price, bag_list: next };
    const { error } = await supabase
      .from("trainers")
      .update(patch)
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
