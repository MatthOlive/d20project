import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Users, Crown } from "lucide-react";

type Member = { user_id: string; role: string; display_name: string | null };

export function OnlinePresence({
  gameId,
  userId,
  isNarrator,
}: { gameId: string; userId: string; isNarrator: boolean }) {
  const qc = useQueryClient();
  const [nameOpen, setNameOpen] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [online, setOnline] = useState<Record<string, { name: string }>>({});

  const { data: members } = useQuery({
    queryKey: ["game-members", gameId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_members")
        .select("user_id, role, display_name")
        .eq("game_id", gameId);
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const me = members?.find((m) => m.user_id === userId);

  // Ask for display name on first entry per game (if not yet set).
  useEffect(() => {
    if (!members) return;
    if (me && !me.display_name) {
      setNameInput(isNarrator ? "Narrador" : "");
      setNameOpen(true);
    }
  }, [members, me, isNarrator]);

  async function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    const { error } = await supabase
      .from("game_members")
      .update({ display_name: trimmed })
      .eq("game_id", gameId)
      .eq("user_id", userId);
    if (error) return;
    setNameOpen(false);
    qc.invalidateQueries({ queryKey: ["game-members", gameId] });
  }

  // Presence channel — broadcasts who is currently online.
  useEffect(() => {
    if (!me?.display_name) return;
    const channel = supabase.channel(`presence:${gameId}`, {
      config: { presence: { key: userId } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, Array<{ name: string }>>;
        const flat: Record<string, { name: string }> = {};
        for (const key of Object.keys(state)) {
          const meta = state[key]?.[0];
          if (meta) flat[key] = { name: meta.name };
        }
        setOnline(flat);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ name: me.display_name });
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, userId, me?.display_name]);

  // Sort: narrator first, then alphabetical.
  const onlineList = (members ?? [])
    .filter((m) => online[m.user_id])
    .map((m) => ({
      ...m,
      shownName: online[m.user_id]?.name || m.display_name || "Player",
    }))
    .sort((a, b) => {
      if (a.role === "narrator" && b.role !== "narrator") return -1;
      if (b.role === "narrator" && a.role !== "narrator") return 1;
      return a.shownName.localeCompare(b.shownName);
    });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-2 text-xs">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-semibold text-muted-foreground">Online:</span>
        {onlineList.length === 0 ? (
          <span className="text-muted-foreground italic">só você</span>
        ) : (
          onlineList.map((m, i) => (
            <span key={m.user_id} className="inline-flex items-center gap-1">
              {m.role === "narrator" && <Crown className="h-3 w-3 text-primary" />}
              <span className={m.user_id === userId ? "font-semibold" : ""}>
                {m.shownName}
              </span>
              {i < onlineList.length - 1 && <span className="text-muted-foreground">,</span>}
            </span>
          ))
        )}
        {me?.display_name && (
          <button
            onClick={() => {
              setNameInput(me.display_name || "");
              setNameOpen(true);
            }}
            className="ml-auto text-[10px] text-muted-foreground underline hover:text-foreground"
          >
            mudar nome
          </button>
        )}
      </div>

      <Dialog open={nameOpen} onOpenChange={(o) => {
        // Block close when first-time set (no display name yet).
        if (!o && !me?.display_name) return;
        setNameOpen(o);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Como você quer ser chamado nessa mesa?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dn">Nome de exibição</Label>
            <Input
              id="dn"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={isNarrator ? "Narrador" : "Jogador 1"}
              maxLength={40}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
              }}
            />
          </div>
          <DialogFooter>
            <Button onClick={saveName} disabled={!nameInput.trim()}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
