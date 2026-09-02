import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dices } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { MoveReactionTarget, MoveRollMessage, MoveRollTarget } from "@/components/MoveCard";
import { emitEngineActionRolled } from "@/lib/game-engine/action-events";
import type { EngineSession } from "@/lib/game-engine/types";
import {
  digiRoleAttributeModifier,
  digiRoleFieldAccuracyModifier,
  rollDigiRole,
  type DigiRoleNumbers,
} from "@/lib/digirole";

type Technique = {
  id: string;
  name: string;
  grade: string;
  ds_cost: number;
  field: string;
  category: string;
  target: string;
  accuracy_formula: string;
  damage_formula: string | null;
  description: string;
};

type TokenRow = {
  id: string;
  owner_id: string;
  character_id: string;
  character_kind: "digirole_tamer" | "digirole_digimon";
  label: string;
  layer?: string | null;
};

type TargetInfo = {
  tokenId: string;
  characterId: string;
  kind: TokenRow["character_kind"];
  name: string;
  controllerIds: string[];
  def: number;
  res: number;
  fields: string[];
  digiAttribute: string;
  clashPhysical: number;
  clashEnergy: number;
  evadePool: number;
};

type CharacterRow = {
  id: string;
  owner_id: string;
  allowed_editors: string[] | null;
  name?: string | null;
  nickname?: string | null;
  attrs: DigiRoleNumbers | null;
  skills: DigiRoleNumbers | null;
  species?: { name?: string | null; digi_attribute?: string | null; fields?: string[] | null } | Array<{ name?: string | null; digi_attribute?: string | null; fields?: string[] | null }> | null;
};

function table(name: string) {
  // DigiRole tables are introduced by the pending local migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase.from(name as never) as any;
}

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message ?? error);
  return String(error);
}

function isEnergy(category: string): boolean {
  return /energia|energy/i.test(category);
}

function useCurrentPage(gameId: string, userId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["current-map-page", gameId, userId],
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const [gameResult, memberResult] = await Promise.all([
        supabase.from("games").select("active_page_id,narrator_id").eq("id", gameId).single(),
        supabase.from("game_members").select("viewing_page_id").eq("game_id", gameId).eq("user_id", userId).maybeSingle(),
      ]);
      if (gameResult.error) throw gameResult.error;
      if (memberResult.error) throw memberResult.error;
      const game = gameResult.data as { active_page_id: string | null; narrator_id: string };
      const member = memberResult.data as { viewing_page_id?: string | null } | null;
      return game.narrator_id === userId ? game.active_page_id : member?.viewing_page_id ?? game.active_page_id;
    },
  });
}

function useDigiRoleTargets(gameId: string, pageId: string | null | undefined, enabled: boolean) {
  const tokenQuery = useQuery({
    queryKey: ["tokens", gameId, pageId],
    enabled: enabled && !!pageId,
    queryFn: async (): Promise<TokenRow[]> => {
      const result = await supabase.from("tokens").select("id,owner_id,character_id,character_kind,label,layer").eq("game_id", gameId).eq("page_id", pageId!);
      if (result.error) throw result.error;
      return (result.data ?? []).filter((token): token is typeof token & TokenRow =>
        token.character_kind === "digirole_tamer" || token.character_kind === "digirole_digimon",
      );
    },
  });
  const tokens = useMemo(() => (tokenQuery.data ?? []).filter((token) => (token.layer ?? "tokens") === "tokens"), [tokenQuery.data]);
  const tamerIds = useMemo(() => [...new Set(tokens.filter((token) => token.character_kind === "digirole_tamer").map((token) => token.character_id))], [tokens]);
  const digimonIds = useMemo(() => [...new Set(tokens.filter((token) => token.character_kind === "digirole_digimon").map((token) => token.character_id))], [tokens]);
  const ids = useMemo(() => tokens.map((token) => `${token.character_kind}:${token.character_id}`).sort().join(","), [tokens]);
  const infoQuery = useQuery({
    queryKey: ["digirole-target-info", gameId, pageId, ids],
    enabled: enabled && !!pageId && tokens.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const [tamers, digimons] = await Promise.all([
        tamerIds.length ? table("digirole_tamers").select("id,owner_id,allowed_editors,name,attrs,skills").in("id", tamerIds) : Promise.resolve({ data: [], error: null }),
        digimonIds.length ? table("digirole_digimons").select("id,owner_id,allowed_editors,nickname,attrs,skills,species:species_id(name,digi_attribute,fields)").in("id", digimonIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (tamers.error) throw tamers.error;
      if (digimons.error) throw digimons.error;
      const characters = new Map<string, CharacterRow>();
      for (const row of (tamers.data ?? []) as CharacterRow[]) characters.set(`digirole_tamer:${row.id}`, row);
      for (const row of (digimons.data ?? []) as CharacterRow[]) characters.set(`digirole_digimon:${row.id}`, row);
      const result = new Map<string, TargetInfo>();
      for (const token of tokens) {
        const character = characters.get(`${token.character_kind}:${token.character_id}`);
        if (!character) continue;
        const attrs = character.attrs ?? {};
        const skills = character.skills ?? {};
        const species = relation(character.species);
        result.set(token.id, {
          tokenId: token.id,
          characterId: token.character_id,
          kind: token.character_kind,
          name: character.nickname || character.name || species?.name || token.label || "Alvo",
          controllerIds: [...new Set([character.owner_id, token.owner_id, ...(character.allowed_editors ?? [])].filter(Boolean))],
          def: Math.max(0, attrs.vitality ?? 0),
          res: Math.max(0, attrs.wisdom ?? 0),
          fields: species?.fields ?? [],
          digiAttribute: species?.digi_attribute ?? "None",
          clashPhysical: Math.max(0, (attrs.strength ?? 0) + (skills.Clash ?? 0)),
          clashEnergy: Math.max(0, (attrs.spirit ?? 0) + (skills.Clash ?? 0)),
          evadePool: Math.max(0, (attrs.dexterity ?? 0) + (skills.Evasion ?? 0)),
        });
      }
      return result;
    },
  });
  return { tokens, info: infoQuery.data ?? new Map<string, TargetInfo>(), loading: infoQuery.isFetching, error: infoQuery.error };
}

export function DigiRoleTechniqueRollDialog({
  technique,
  gameId,
  userId,
  digimonId,
  digimonName,
  imageUrl,
  digiAttribute,
  accuracyPool,
  damagePool,
  dsCurrent,
  onDsChanged,
}: {
  technique: Technique;
  gameId: string;
  userId: string;
  digimonId: string;
  digimonName: string;
  imageUrl: string | null;
  digiAttribute: string;
  accuracyPool: number;
  damagePool: number;
  dsCurrent: number;
  onDsChanged: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [accuracyBonus, setAccuracyBonus] = useState(0);
  const [damageBonus, setDamageBonus] = useState(0);
  const [manualDefense, setManualDefense] = useState(0);
  const [busy, setBusy] = useState(false);
  const pageQuery = useCurrentPage(gameId, userId, open);
  const targets = useDigiRoleTargets(gameId, pageQuery.data, open);
  const { data: engine = null } = useQuery<EngineSession | null>({
    queryKey: ["game-engine-session", gameId],
    enabled: open,
    retry: false,
    queryFn: async () => {
      const result = await table("game_engine_sessions").select("*").eq("game_id", gameId).maybeSingle();
      if (result.error) throw result.error;
      return (result.data as EngineSession | null) ?? null;
    },
  });
  const participant = engine?.state.participants.find((entry) => entry.characterId === digimonId && entry.kind === "digirole_digimon") ?? null;
  const actions = Math.max(0, participant?.actionsUsed ?? 0);
  const required = actions + 1;
  const energy = isEnergy(technique.category);
  const selectedReady = selected.every((tokenId) => targets.info.has(tokenId));
  const selectedInfo = selected.map((tokenId) => targets.info.get(tokenId)).filter(Boolean) as TargetInfo[];
  const fieldModifier = selectedInfo.length > 0
    ? Math.min(...selectedInfo.map((target) => digiRoleFieldAccuracyModifier(technique.field, target.fields)))
    : 0;
  const finalAccuracyPool = Math.max(0, accuracyPool + accuracyBonus + fieldModifier);

  useEffect(() => {
    if (!open) setSelected([]);
  }, [open]);

  async function publishResolution(payload: MoveRollMessage) {
    const result = await supabase.from("chat_messages").insert({
      game_id: gameId,
      user_id: userId,
      kind: "move",
      body: `${digimonName} usou ${technique.name} · Dano e efeitos`,
      roll_data: { ...payload, phase: "resolution", reactions: [] } as unknown as never,
    });
    if (result.error) throw result.error;
  }

  async function confirm() {
    if (busy) return;
    if (selected.length > 0 && !selectedReady) return toast.error("Aguarde os dados dos alvos carregarem.");
    setBusy(true);
    try {
      const accuracy = rollDigiRole(finalAccuracyPool, finalAccuracyPool <= 0 ? 1 : 0);
      const isHit = accuracy.successes >= required;
      const resolutionId = crypto.randomUUID();
      const requestIds = new Map(selected.map((tokenId) => [tokenId, crypto.randomUUID()]));
      const reactionTargets: MoveReactionTarget[] = isHit ? selectedInfo.map((target) => ({
        requestId: requestIds.get(target.tokenId)!,
        tokenId: target.tokenId,
        characterId: target.characterId,
        characterKind: target.kind,
        name: target.name,
        controllerIds: target.controllerIds,
        clashPool: energy ? target.clashEnergy : target.clashPhysical,
        evadePool: target.evadePool,
        painPenalty: 0,
      })) : [];
      let damage: MoveRollMessage["damage"] = null;
      if (isHit && technique.damage_formula) {
        let damageTargets: MoveRollTarget[] | undefined;
        let dice: number[] = [];
        let successes = 0;
        if (selectedInfo.length > 0) {
          damageTargets = selectedInfo.map((target) => {
            const defense = energy ? target.res : target.def;
            const pool = Math.max(0, damagePool + damageBonus - defense);
            const rolled = rollDigiRole(pool, 0);
            const typeDelta = digiRoleAttributeModifier(digiAttribute, target.digiAttribute);
            const finalDamage = Math.max(1, rolled.successes + typeDelta);
            return {
              requestId: requestIds.get(target.tokenId),
              tokenId: target.tokenId,
              name: target.name,
              def: defense,
              defStat: energy ? "spdef" : "def",
              effLabel: typeDelta > 0 ? "Vantagem +1" : typeDelta < 0 ? "Desvantagem -1" : "Neutro",
              effDelta: typeDelta,
              immune: false,
              finalDamage,
              dice: rolled.dice,
              successes: rolled.successes,
              basePool: Math.max(0, damagePool + damageBonus),
              pool,
              effectivenessMode: "successes",
            };
          });
        } else {
          const pool = Math.max(0, damagePool + damageBonus - manualDefense);
          const rolled = rollDigiRole(pool, 0);
          dice = rolled.dice;
          successes = Math.max(1, rolled.successes);
        }
        damage = {
          pool: Math.max(0, damagePool + damageBonus),
          dice,
          successes,
          penalty: 0,
          isStatus: false,
          targetDef: selectedInfo.length ? 0 : manualDefense,
          targets: damageTargets,
        };
      }
      const payload: MoveRollMessage = {
        v: "move-1",
        system: "digirole",
        phase: "accuracy",
        resolutionId,
        attacker: { characterId: digimonId, characterKind: "digirole_digimon", tokenId: participant?.tokenId ?? null },
        reactionTargets,
        pokemonName: digimonName,
        hasStab: false,
        imageUrl,
        card: {
          name: technique.name,
          type: technique.field,
          power: damagePool,
          accuracyText: technique.accuracy_formula,
          damagePoolText: technique.damage_formula ?? "Sem dano",
          effect: technique.description,
          category: technique.category,
        },
        accuracy: {
          pool: finalAccuracyPool,
          dice: accuracy.dice,
          chance: accuracy.chance,
          successes: accuracy.successes,
          penalty: 0,
          isHit,
          crit: { margin: 0, actions, required, critRequired: Number.MAX_SAFE_INTEGER, isCrit: false },
        },
        damage,
        chance: [],
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (supabase as any).rpc("use_digirole_technique", {
        p_digimon_id: digimonId,
        p_ds_cost: technique.ds_cost,
        p_body: `${digimonName} usou ${technique.name} · Accuracy`,
        p_roll_data: payload,
      });
      if (result.error) throw result.error;
      const rpcData = result.data as { dsCurrent?: number } | null;
      onDsChanged(rpcData?.dsCurrent ?? Math.max(0, dsCurrent - technique.ds_cost));
      emitEngineActionRolled({ gameId, tokenId: participant?.tokenId, characterId: digimonId, characterKind: "digirole_digimon", actionType: "move", label: technique.name, resultSuccesses: accuracy.successes });
      if (!isHit || reactionTargets.length === 0) await publishResolution(payload);
      setOpen(false);
      toast[isHit ? "success" : "error"](isHit ? `${technique.name} acertou.` : `${technique.name} falhou: ${accuracy.successes}/${required}.`);
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  const groups = [
    { key: "digimon", label: "Digimon", rows: targets.tokens.filter((token) => token.character_kind === "digirole_digimon") },
    { key: "tamer", label: "Tamers", rows: targets.tokens.filter((token) => token.character_kind === "digirole_tamer") },
  ].filter((group) => group.rows.length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" disabled={dsCurrent < technique.ds_cost}><Dices className="mr-1 h-3.5 w-3.5" /> Usar técnica</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{technique.name}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded border border-border p-2"><span className="block text-[10px] font-bold uppercase text-muted-foreground">Accuracy</span><strong>{finalAccuracyPool > 0 ? `${finalAccuracyPool}d6` : "Chance Die"}</strong><p className="text-[10px] text-muted-foreground">{technique.accuracy_formula}{fieldModifier ? ` · Field ${fieldModifier > 0 ? "+" : ""}${fieldModifier}` : ""}</p></div>
          <div className="rounded border border-border p-2"><span className="block text-[10px] font-bold uppercase text-muted-foreground">Dano</span><strong>{technique.damage_formula ? `${Math.max(0, damagePool + damageBonus)}d6` : "Sem dano"}</strong><p className="text-[10px] text-muted-foreground">{energy ? "RES" : "DEF"} remove dados</p></div>
          <div className="rounded border border-border p-2"><span className="block text-[10px] font-bold uppercase text-muted-foreground">Ação</span><strong>{required} sucesso(s)</strong><p className="text-[10px] text-muted-foreground">{actions} já realizada(s)</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1"><Label>Bônus de Accuracy</Label><Input type="number" value={accuracyBonus} onChange={(event) => setAccuracyBonus(Number.parseInt(event.target.value, 10) || 0)} /></label>
          <label className="space-y-1"><Label>Bônus de dano</Label><Input type="number" value={damageBonus} onChange={(event) => setDamageBonus(Number.parseInt(event.target.value, 10) || 0)} /></label>
          {selected.length === 0 && <label className="space-y-1"><Label>{energy ? "RES" : "DEF"} manual</Label><Input type="number" min={0} value={manualDefense} onChange={(event) => setManualDefense(Math.max(0, Number.parseInt(event.target.value, 10) || 0))} /></label>}
        </div>
        <section className="rounded-md border border-border p-3">
          <h3 className="text-xs font-black">Alvos no campo (opcional)</h3>
          <p className="mb-2 text-[10px] text-muted-foreground">Somente tokens na página atual. Field ajusta Accuracy; {energy ? "RES" : "DEF"} reduz a Pool de Dano.</p>
          {groups.map((group) => <div key={group.key} className="mb-2 last:mb-0"><p className="mb-1 text-[10px] font-black uppercase text-muted-foreground">{group.label}</p><div className="space-y-1">{group.rows.map((token) => { const info = targets.info.get(token.id); return <label key={token.id} className="flex items-center gap-2 rounded border border-border px-2 py-2 text-xs"><Checkbox checked={selected.includes(token.id)} onCheckedChange={(checked) => setSelected((current) => checked ? [...current, token.id] : current.filter((id) => id !== token.id))} /><strong className="min-w-0 flex-1 truncate">{info?.name ?? token.label}</strong>{info && <span className="text-[10px] text-muted-foreground">{energy ? `RES ${info.res}` : `DEF ${info.def}`} · {digiRoleFieldAccuracyModifier(technique.field, info.fields) >= 0 ? "+" : ""}{digiRoleFieldAccuracyModifier(technique.field, info.fields)} Acc</span>}</label>; })}</div></div>)}
          {targets.loading && <p className="text-xs text-muted-foreground">Carregando dados dos alvos...</p>}
          {targets.error && <p className="text-xs text-destructive">{messageOf(targets.error)}</p>}
          {!targets.loading && groups.length === 0 && <p className="text-xs text-muted-foreground">Nenhum alvo DigiRole nesta página.</p>}
        </section>
        <p className="text-xs leading-relaxed text-muted-foreground">{technique.description}</p>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={busy || dsCurrent < technique.ds_cost || (selected.length > 0 && !selectedReady)} onClick={() => void confirm()}><Dices className="mr-1 h-4 w-4" /> Rolar e enviar card · {technique.ds_cost} DS</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
