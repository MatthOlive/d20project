import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Shuffle, Hand, Eye, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

type Deck = { id: string; game_id: string; name: string; shuffled_order: string[] };
type CardRow = { id: string; deck_id: string; front: string; back: string; image_url: string | null };
type HandRow = { id: string; deck_id: string; user_id: string; card_ids: string[] };
type DiscardRow = { id: string; deck_id: string; card_id: string; public: boolean; created_at: string };

function shuffle(ids: string[]) {
  const arr = [...ids];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function DeckPanel({
  gameId,
  userId,
  isNarrator,
}: {
  gameId: string;
  userId: string;
  isNarrator: boolean;
}) {
  const qc = useQueryClient();
  const [selectedDeckId, setSelectedDeckId] = useState<string>("");
  const [newDeckName, setNewDeckName] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const { data: decks = [] } = useQuery({
    queryKey: ["decks", gameId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("decks" as never).select("*").eq("game_id", gameId).order("created_at") as unknown as Promise<{ data: Deck[] | null; error: { message: string } | null }>);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const deckId = selectedDeckId || decks[0]?.id || "";
  const selectedDeck = useMemo(() => decks.find((d) => d.id === deckId) ?? null, [decks, deckId]);

  const { data: cards = [] } = useQuery({
    queryKey: ["cards", deckId],
    enabled: !!deckId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("cards" as never).select("*").eq("deck_id", deckId).order("created_at") as unknown as Promise<{ data: CardRow[] | null; error: { message: string } | null }>);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const { data: hands = [] } = useQuery({
    queryKey: ["card_hands", deckId],
    enabled: !!deckId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("card_hands" as never).select("*").eq("deck_id", deckId) as unknown as Promise<{ data: HandRow[] | null; error: { message: string } | null }>);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const { data: discards = [] } = useQuery({
    queryKey: ["card_discards", deckId],
    enabled: !!deckId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("card_discards" as never).select("*").eq("deck_id", deckId).order("created_at", { ascending: false }) as unknown as Promise<{ data: DiscardRow[] | null; error: { message: string } | null }>);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const myHand = hands.find((h) => h.user_id === userId);
  const visibleHands = isNarrator ? hands : hands.filter((h) => h.user_id === userId);

  async function createDeck() {
    const name = newDeckName.trim();
    if (!name) return;
    const { error } = await (supabase.from("decks" as never).insert({ game_id: gameId, name, shuffled_order: [] } as never) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) { toast.error(error.message); return; }
    setNewDeckName("");
    qc.invalidateQueries({ queryKey: ["decks", gameId] });
  }

  async function addCard() {
    if (!deckId || !front.trim()) return;
    const { error } = await (supabase.from("cards" as never).insert({
      deck_id: deckId,
      front: front.trim(),
      back: back.trim(),
      image_url: imageUrl.trim() || null,
    } as never) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) { toast.error(error.message); return; }
    setFront("");
    setBack("");
    setImageUrl("");
    qc.invalidateQueries({ queryKey: ["cards", deckId] });
  }

  async function reshuffle() {
    if (!selectedDeck) return;
    const order = shuffle(cards.map((c) => c.id));
    const { error } = await (supabase.from("decks" as never).update({ shuffled_order: order } as never).eq("id", selectedDeck.id) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["decks", gameId] });
  }

  async function drawCard(kind: "private" | "public") {
    if (!selectedDeck || cards.length === 0) return;
    const order = selectedDeck.shuffled_order?.length ? [...selectedDeck.shuffled_order] : shuffle(cards.map((c) => c.id));
    const cardId = order.shift();
    if (!cardId) return;
    const deckUpdate = (supabase.from("decks" as never).update({ shuffled_order: order } as never).eq("id", selectedDeck.id) as unknown as Promise<{ error: { message: string } | null }>);
    if (kind === "public") {
      const [{ error: deckError }, { error: discardError }] = await Promise.all([
        deckUpdate,
        (supabase.from("card_discards" as never).insert({ deck_id: selectedDeck.id, card_id: cardId, public: true } as never) as unknown as Promise<{ error: { message: string } | null }>),
      ]);
      if (deckError || discardError) toast.error(deckError?.message || discardError?.message);
    } else {
      const nextHand = [...(myHand?.card_ids ?? []), cardId];
      const handWrite = myHand
        ? (supabase.from("card_hands" as never).update({ card_ids: nextHand } as never).eq("id", myHand.id) as unknown as Promise<{ error: { message: string } | null }>)
        : (supabase.from("card_hands" as never).insert({ deck_id: selectedDeck.id, user_id: userId, card_ids: nextHand } as never) as unknown as Promise<{ error: { message: string } | null }>);
      const [{ error: deckError }, { error: handError }] = await Promise.all([deckUpdate, handWrite]);
      if (deckError || handError) toast.error(deckError?.message || handError?.message);
    }
    qc.invalidateQueries({ queryKey: ["decks", gameId] });
    qc.invalidateQueries({ queryKey: ["card_hands", deckId] });
    qc.invalidateQueries({ queryKey: ["card_discards", deckId] });
  }

  async function discardFromHand(cardId: string) {
    if (!selectedDeck || !myHand) return;
    const next = myHand.card_ids.filter((id) => id !== cardId);
    const [{ error: handError }, { error: discardError }] = await Promise.all([
      (supabase.from("card_hands" as never).update({ card_ids: next } as never).eq("id", myHand.id) as unknown as Promise<{ error: { message: string } | null }>),
      (supabase.from("card_discards" as never).insert({ deck_id: selectedDeck.id, card_id: cardId, public: true } as never) as unknown as Promise<{ error: { message: string } | null }>),
    ]);
    if (handError || discardError) toast.error(handError?.message || discardError?.message);
    qc.invalidateQueries({ queryKey: ["card_hands", deckId] });
    qc.invalidateQueries({ queryKey: ["card_discards", deckId] });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex gap-1">
        <Input value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)} placeholder="Novo deck" className="h-8 text-xs" disabled={!isNarrator} />
        <Button size="sm" onClick={createDeck} disabled={!isNarrator || !newDeckName.trim()}><Plus className="h-3.5 w-3.5" /></Button>
      </div>
      <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={deckId} onChange={(e) => setSelectedDeckId(e.target.value)}>
        {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      {selectedDeck ? (
        <>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={reshuffle} disabled={!isNarrator}><Shuffle className="mr-1 h-3.5 w-3.5" /> Embaralhar</Button>
            <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={() => drawCard("private")}><Hand className="mr-1 h-3.5 w-3.5" /> Comprar</Button>
            <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={() => drawCard("public")}><Eye className="mr-1 h-3.5 w-3.5" /> Publica</Button>
          </div>
          {isNarrator && (
            <Card className="space-y-1 p-2">
              <Input value={front} onChange={(e) => setFront(e.target.value)} placeholder="Frente da carta" className="h-8 text-xs" />
              <Input value={back} onChange={(e) => setBack(e.target.value)} placeholder="Verso / descricao" className="h-8 text-xs" />
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="URL da imagem" className="h-8 text-xs" />
              <Button size="sm" className="h-8 w-full text-xs" onClick={addCard} disabled={!front.trim()}>Adicionar carta</Button>
            </Card>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto space-y-2">
            <section>
              <h4 className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">Mao</h4>
              <div className="grid gap-1">
                {visibleHands.flatMap((h) => h.card_ids.map((id) => ({ hand: h, card: cardsById.get(id) }))).map(({ hand, card }, i) => card ? (
                  <Card key={`${hand.id}-${card.id}-${i}`} className="flex items-center gap-2 p-2 text-xs">
                    {card.image_url && <img src={card.image_url} alt="" className="h-10 w-10 rounded object-cover" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{card.front}</div>
                      {card.back && <div className="truncate text-muted-foreground">{card.back}</div>}
                    </div>
                    {hand.user_id === userId && (
                      <button className="rounded p-1 hover:bg-accent" onClick={() => discardFromHand(card.id)} title="Descartar">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </Card>
                ) : null)}
              </div>
            </section>
            <section>
              <h4 className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">Descartes</h4>
              <div className="grid gap-1">
                {discards.map((d) => {
                  const card = cardsById.get(d.card_id);
                  if (!card) return null;
                  return (
                    <Card key={d.id} className="flex items-center gap-2 p-2 text-xs">
                      {card.image_url && <img src={card.image_url} alt="" className="h-10 w-10 rounded object-cover" />}
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{card.front}</div>
                        {card.back && <div className="truncate text-muted-foreground">{card.back}</div>}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          </div>
        </>
      ) : (
        <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">Crie um deck para comecar.</p>
      )}
    </div>
  );
}
