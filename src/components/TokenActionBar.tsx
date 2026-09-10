import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Activity,
  BookOpen,
  Crosshair,
  Dices,
  Heart,
  ScanLine,
  Shield,
  Sparkles,
  Swords,
  X,
  Zap,
} from "lucide-react";
import { GenericRollButton, painPenaltyFor, STATUS_CONDITIONS } from "@/components/SheetRolls";
import {
  POKEMON_ATTRS,
  ATTRS,
  SOCIAL_ATTRS,
  TRAINER_SKILLS,
  SKILLS,
  RANK_BONUS,
  preferredPokemonSprite,
} from "@/lib/pokerole";
import { MoveCard } from "@/components/MoveCard";
import { MoveRollDialog, computeMoveStats, type MoveData } from "@/components/MoveRollDialog";
import { T20_QUICK_ROLLS } from "@/lib/tormenta20";
import { useGameSpriteStyle } from "@/hooks/use-game-sprite-style";
import {
  DIGIROLE_ATTRS,
  DIGIROLE_CONDITIONS,
  DIGIROLE_SKILL_GROUPS,
  digiRoleFormulaPool,
  rollDigiRole,
  type DigiRoleNumbers,
  type DigiRoleRoll,
} from "@/lib/digirole";
import { DigiRoleTechniqueRollDialog } from "@/components/digirole/DigiRoleTechniqueRollDialog";
import { DigiRoleEvolutionPanel } from "@/components/digirole/DigiRoleProgression";
import {
  dedupeDigiRoleTechniques,
  fetchDigiRoleSpeciesTechniques,
} from "@/lib/digirole-techniques";
import { digiRoleFieldColor } from "@/lib/digirole-colors";
import { DigiRoleImage } from "@/components/digirole/DigiRoleImage";
import { emitEngineActionRolled } from "@/lib/game-engine/action-events";

type TokenKind = "trainer" | "pokemon" | "t20" | "digirole_tamer" | "digirole_digimon";

type Props = {
  kind: TokenKind;
  id: string;
  tokenId?: string | null;
  label: string;
  gameId: string;
  userId: string;
  onRoll: (
    label: string,
    n: number,
    penalty?: number,
    meta?: {
      characterKind: TokenKind;
      characterId: string;
      imageUrl?: string | null;
      tokenId?: string | null;
    },
  ) => void;
  onClose: () => void;
  onOpenSheet: () => void;
  showInitiative?: boolean;
  extra?: React.ReactNode;
};

export function TokenActionBar(p: Props) {
  if (p.kind === "t20") return <T20Bar {...p} />;
  if (p.kind === "digirole_tamer" || p.kind === "digirole_digimon") return <DigiRoleBar {...p} />;
  if (p.kind === "trainer") return <TrainerBar {...p} />;
  return <PokemonBar {...p} />;
}

type DigiRoleTokenData = {
  owner_id: string;
  attrs: DigiRoleNumbers;
  attr_points: DigiRoleNumbers;
  bonuses: DigiRoleNumbers;
  skills: DigiRoleNumbers;
  image_url: string | null;
  conditions: string[];
  equipment: Record<string, { name?: string; effects?: string; damagePool?: string }>;
  inventory: Array<{ name: string; quantity: number; description?: string }>;
  hybrid_state: { speciesId?: string; speciesName?: string; itemName?: string };
  ds_current: number;
  species_id: string | null;
  rank: string;
  pe: number;
  bond: number;
  battles: number;
  victories: number;
  training_successes: number;
  species: DigiRoleSpecies | null;
};

type DigiRoleSpecies = {
  id: string;
  name: string;
  stage: string;
  image_url: string | null;
  digi_attribute: string;
  fields: string[];
  base_attrs: DigiRoleNumbers;
  signature_technique: string | null;
  evolution_text: string | null;
};

type DigiRoleTechnique = {
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

type DigiRoleScanTarget = {
  id: string;
  nickname: string | null;
  species: { id: string; name: string; stage: string; image_url: string | null } | null;
};

function digiRoleTable(name: string) {
  // DigiRole catalog tables intentionally extend the generated client schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase.from(name as never) as any;
}

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? error);
  }
  return String(error);
}

function effectiveDigiRoleAttrs(
  attrs: DigiRoleNumbers,
  points: DigiRoleNumbers,
  bonuses: DigiRoleNumbers,
) {
  return Object.fromEntries(
    DIGIROLE_ATTRS.map((attr) => [
      attr.id,
      (attrs[attr.id] ?? 0) + (points[attr.id] ?? 0) + (bonuses[attr.id] ?? 0),
    ]),
  ) as DigiRoleNumbers;
}

function configuredDigiRoleDamagePool(
  value: string | undefined,
  attrs: DigiRoleNumbers,
  skills: DigiRoleNumbers,
) {
  const text = (value ?? "").trim();
  if (!text) return null;
  const dice = text.match(/^(\d+)\s*d6$/i);
  if (dice) return Math.max(0, Number.parseInt(dice[1], 10));
  if (/^\d+$/.test(text)) return Math.max(0, Number.parseInt(text, 10));
  return Math.max(0, digiRoleFormulaPool(text, attrs, skills));
}

async function sendDigiRoleTokenRoll({
  gameId,
  userId,
  kind,
  characterId,
  tokenId,
  label,
  pool,
  actionType,
}: {
  gameId: string;
  userId: string;
  kind: "digirole_tamer" | "digirole_digimon";
  characterId: string;
  tokenId?: string | null;
  label: string;
  pool: number;
  actionType?: "move" | "reaction" | "initiative";
}): Promise<DigiRoleRoll> {
  const result = rollDigiRole(pool, pool <= 0 ? 1 : 0);
  const inserted = await supabase.from("chat_messages").insert({
    game_id: gameId,
    user_id: userId,
    kind: "roll",
    body: label,
    roll_data: {
      ...result,
      label,
      system: "digirole",
      ones: result.dice.filter((die) => die === 1).length,
    },
  });
  if (inserted.error) throw inserted.error;
  if (actionType) {
    emitEngineActionRolled({
      gameId,
      tokenId,
      characterId,
      characterKind: kind,
      actionType,
      label,
      resultSuccesses: result.successes,
    });
  }
  return result;
}

function DigiRoleBar({
  kind,
  id,
  tokenId,
  label,
  gameId,
  userId,
  onRoll,
  onClose,
  onOpenSheet,
  extra,
  showInitiative = false,
}: Props) {
  const isDigimon = kind === "digirole_digimon";
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["token-digirole", kind, id],
    queryFn: async () => {
      const table = isDigimon ? "digirole_digimons" : "digirole_tamers";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from(table as never) as any)
        .select(
          isDigimon
            ? "owner_id,attrs,attr_points,bonuses,skills,image_url,conditions,equipment,ds_current,species_id,rank,pe,bond,battles,victories,training_successes,species:species_id(id,name,stage,image_url,digi_attribute,fields,base_attrs,signature_technique,evolution_text)"
            : "owner_id,attrs,attr_points,bonuses,skills,image_url,conditions,equipment,inventory,hybrid_state,ds_current",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return {
        attr_points: {},
        bonuses: {},
        conditions: [],
        equipment: {},
        inventory: [],
        hybrid_state: {},
        ds_current: 0,
        species_id: null,
        rank: "In-Training I",
        pe: 0,
        bond: 0,
        battles: 0,
        victories: 0,
        training_successes: 0,
        species: null,
        ...data,
      } as DigiRoleTokenData;
    },
  });
  const hybridSpeciesId = !isDigimon ? data?.hybrid_state?.speciesId : null;
  const { data: hybridSpecies = null } = useQuery({
    queryKey: ["token-digirole-tamer-hybrid", hybridSpeciesId],
    enabled: !!hybridSpeciesId,
    queryFn: async () => {
      const result = await digiRoleTable("digirole_species")
        .select("id,name,stage,image_url,digi_attribute,fields,base_attrs,signature_technique")
        .eq("id", hybridSpeciesId)
        .single();
      if (result.error) throw result.error;
      return result.data as DigiRoleSpecies;
    },
  });
  if (!data) return <Shell onClose={onClose} title={label} loading />;
  const character = data;
  const digiRoleKind = kind as "digirole_tamer" | "digirole_digimon";
  const combatAttrs = hybridSpecies?.base_attrs ?? data.attrs ?? {};
  const effectiveAttrs = effectiveDigiRoleAttrs(
    combatAttrs,
    data.attr_points ?? {},
    data.bonuses ?? {},
  );
  const dex = effectiveAttrs.dexterity ?? 1;
  const str = effectiveAttrs.strength ?? 1;
  const spr = effectiveAttrs.spirit ?? 1;
  const evasion = data.skills?.Evasion ?? 0;
  const clash = data.skills?.Clash ?? 0;
  const weapons = data.skills?.Weapons ?? 0;
  const initiativePool = dex + (data.skills?.Alert ?? 0) + (data.bonuses?.initiative ?? 0);
  const activeImage = hybridSpecies?.image_url ?? data.image_url;
  const meta = { characterKind: kind, characterId: id, imageUrl: activeImage, tokenId };
  const attrs = DIGIROLE_ATTRS.map((attr) => ({
    name: attr.label,
    value: effectiveAttrs[attr.id] ?? 1,
  }));
  const skills = Object.values(DIGIROLE_SKILL_GROUPS)
    .flat()
    .map((skill) => ({ name: skill, value: data.skills?.[skill] ?? 0 }));
  const rollToken = async (
    rollLabel: string,
    pool: number,
    actionType?: "move" | "reaction" | "initiative",
  ) => {
    try {
      return await sendDigiRoleTokenRoll({
        gameId,
        userId,
        kind: digiRoleKind,
        characterId: id,
        tokenId,
        label: rollLabel,
        pool,
        actionType,
      });
    } catch (error) {
      toast.error(messageOf(error));
      return null;
    }
  };

  async function rollWeaponAttack(attack: "Fight" | "Shoot", accuracy: number) {
    const damagePool = configuredDigiRoleDamagePool(
      character.equipment?.weapon?.damagePool,
      effectiveAttrs,
      character.skills,
    );
    if (damagePool == null) {
      toast.error("Preencha a Pool de dano da arma equipada na ficha.");
      return;
    }
    const accuracyResult = await rollToken(`${label} · ${attack} · Accuracy`, accuracy, "move");
    if (!accuracyResult) return;
    await rollToken(
      `${label} · ${attack} · Dano (${character.equipment?.weapon?.name || "Arma"})`,
      damagePool,
    );
  }

  function updateTamerCache(values: Partial<DigiRoleTokenData>) {
    qc.setQueryData(
      ["token-digirole", "digirole_tamer", id],
      (current: DigiRoleTokenData | undefined) => (current ? { ...current, ...values } : current),
    );
    qc.setQueryData(["digirole-tamer", id], (current: Record<string, unknown> | undefined) =>
      current ? { ...current, ...values } : current,
    );
    qc.setQueryData(
      ["token-digirole-stats", "digirole_tamer", id],
      (current: Record<string, unknown> | undefined) =>
        current ? { ...current, ...values } : current,
    );
    void qc.invalidateQueries({ queryKey: ["digirole-target-info", gameId] });
  }

  if (!isDigimon) {
    const clashPool = str + clash + (data.bonuses?.clash ?? 0);
    const evasionPool = dex + evasion + (data.bonuses?.evasion ?? 0);
    const fightPool = str + weapons;
    const shootPool = dex + weapons;
    return (
      <Shell onClose={onClose} title={label} onOpenSheet={onOpenSheet}>
        {showInitiative && (
          <ActionBtn
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Iniciativa"
            onClick={() => void rollToken(`${label} · Iniciativa`, initiativePool, "initiative")}
          />
        )}
        <ActionBtn
          icon={<Shield className="h-3.5 w-3.5" />}
          label="Clash"
          onClick={() => void rollToken(`${label} · Clash`, clashPool, "reaction")}
        />
        <ActionBtn
          icon={<Activity className="h-3.5 w-3.5" />}
          label="Evasion"
          onClick={() => void rollToken(`${label} · Evasion`, evasionPool, "reaction")}
        />
        <ActionBtn
          icon={<Swords className="h-3.5 w-3.5" />}
          label="Fight"
          onClick={() => void rollWeaponAttack("Fight", fightPool)}
        />
        <ActionBtn
          icon={<Crosshair className="h-3.5 w-3.5" />}
          label="Shoot"
          onClick={() => void rollWeaponAttack("Shoot", shootPool)}
        />
        <DigiRoleHybridButton
          gameId={gameId}
          userId={userId}
          tamerId={id}
          tamerName={label}
          inventory={data.inventory ?? []}
          activeSpecies={hybridSpecies}
          hybridState={data.hybrid_state ?? {}}
          onChanged={(hybrid_state) => updateTamerCache({ hybrid_state })}
        />
        {hybridSpecies && (
          <DigiRoleTechniquesButton
            gameId={gameId}
            userId={userId}
            characterId={id}
            characterKind="digirole_tamer"
            characterName={label}
            tokenId={tokenId}
            species={hybridSpecies}
            attrs={effectiveAttrs}
            skills={data.skills}
            dsCurrent={data.ds_current}
            onDsChanged={(ds_current) => updateTamerCache({ ds_current })}
          />
        )}
        <GenericRollButton
          characterName={label}
          attrs={attrs}
          skills={skills}
          painPenalty={0}
          onRoll={(rollLabel, pool, penalty) => onRoll(rollLabel, pool, penalty, meta)}
        />
        <DigiRoleConditionsButton
          id={id}
          label={label}
          gameId={gameId}
          conditions={data.conditions ?? []}
          onChanged={(conditions) => updateTamerCache({ conditions })}
        />
        <DigiRoleBonusesButton
          id={id}
          label={label}
          gameId={gameId}
          attrs={combatAttrs}
          points={data.attr_points ?? {}}
          skills={data.skills}
          bonuses={data.bonuses ?? {}}
          onChanged={(bonuses) => updateTamerCache({ bonuses })}
        />
        <DigiRoleDataScanButton
          gameId={gameId}
          userId={userId}
          tamerId={id}
          tamerName={label}
          tokenId={tokenId}
          scanPool={(effectiveAttrs.wisdom ?? 0) + (data.skills?.Science ?? 0)}
        />
        {extra}
      </Shell>
    );
  }

  const digimonSpecies = Array.isArray(data.species) ? (data.species[0] ?? null) : data.species;
  const digimonClashPool = Math.max(str, spr) + clash + (data.bonuses?.clash ?? 0);
  const digimonEvasionPool = dex + evasion + (data.bonuses?.evasion ?? 0);
  return (
    <Shell onClose={onClose} title={label} onOpenSheet={onOpenSheet}>
      {showInitiative && (
        <ActionBtn
          icon={<Zap className="h-3.5 w-3.5" />}
          label="Iniciativa"
          onClick={() => void rollToken(`${label} · Iniciativa`, initiativePool, "initiative")}
        />
      )}
      <GenericRollButton
        characterName={label}
        attrs={attrs}
        skills={skills}
        painPenalty={0}
        onRoll={(rollLabel, pool, penalty) => onRoll(rollLabel, pool, penalty, meta)}
      />
      <DigiRoleBonusesButton
        kind="digirole_digimon"
        id={id}
        label={label}
        gameId={gameId}
        attrs={data.attrs ?? {}}
        points={data.attr_points ?? {}}
        skills={data.skills}
        bonuses={data.bonuses ?? {}}
        onChanged={(bonuses) => {
          qc.setQueryData(
            ["token-digirole", "digirole_digimon", id],
            (current: DigiRoleTokenData | undefined) =>
              current ? { ...current, bonuses } : current,
          );
          qc.setQueryData(
            ["digirole-digimon", id],
            (current: Record<string, unknown> | undefined) =>
              current ? { ...current, bonuses } : current,
          );
          void qc.invalidateQueries({ queryKey: ["token-digirole-stats", "digirole_digimon", id] });
          void qc.invalidateQueries({ queryKey: ["digirole-target-info", gameId] });
        }}
      />
      {digimonSpecies && (
        <DigiRoleTechniquesButton
          gameId={gameId}
          userId={userId}
          characterId={id}
          characterKind="digirole_digimon"
          characterName={label}
          tokenId={tokenId}
          species={digimonSpecies}
          attrs={effectiveAttrs}
          skills={data.skills}
          dsCurrent={data.ds_current}
          onDsChanged={(ds_current) => {
            qc.setQueryData(
              ["token-digirole", "digirole_digimon", id],
              (current: DigiRoleTokenData | undefined) =>
                current ? { ...current, ds_current } : current,
            );
            qc.setQueryData(
              ["digirole-digimon", id],
              (current: Record<string, unknown> | undefined) =>
                current ? { ...current, ds_current } : current,
            );
            qc.setQueryData(
              ["token-digirole-stats", "digirole_digimon", id],
              (current: Record<string, unknown> | undefined) =>
                current ? { ...current, ds_current } : current,
            );
          }}
        />
      )}
      <ActionBtn
        icon={<Shield className="h-3.5 w-3.5" />}
        label="Clash"
        onClick={() => void rollToken(`${label} · Clash`, digimonClashPool, "reaction")}
      />
      <ActionBtn
        icon={<Activity className="h-3.5 w-3.5" />}
        label="Evasion"
        onClick={() => void rollToken(`${label} · Evasion`, digimonEvasionPool, "reaction")}
      />
      {digimonSpecies && (
        <DigiRoleEvolutionButton
          gameId={gameId}
          digimonId={id}
          currentSpecies={digimonSpecies}
          rank={data.rank}
          pe={data.pe}
          attrs={effectiveAttrs}
          skills={data.skills}
          bond={data.bond}
          battles={data.battles}
          victories={data.victories}
          trainingSuccesses={data.training_successes}
          onUpdated={async () => {
            await Promise.all([
              qc.invalidateQueries({ queryKey: ["token-digirole", "digirole_digimon", id] }),
              qc.invalidateQueries({ queryKey: ["digirole-digimon", id] }),
              qc.invalidateQueries({
                queryKey: ["token-digirole-techniques", "digirole_digimon", id],
              }),
            ]);
          }}
        />
      )}
      {extra}
    </Shell>
  );
}

function DigiRoleConditionsButton({
  id,
  label,
  gameId,
  conditions,
  onChanged,
}: {
  id: string;
  label: string;
  gameId: string;
  conditions: string[];
  onChanged: (conditions: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<string[]>(conditions);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  async function save(next: string[]) {
    setLocal(next);
    setBusy(true);
    const result = await digiRoleTable("digirole_tamers")
      .update({ conditions: next })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    setBusy(false);
    if (result.error) return toast.error(messageOf(result.error));
    if (!result.data) return toast.error("Você não tem permissão para alterar esta ficha.");
    onChanged(next);
    void qc.invalidateQueries({ queryKey: ["token-digirole_tamer-status", id] });
    void qc.invalidateQueries({ queryKey: ["digirole-target-info", gameId] });
  }

  function toggle(condition: string, checked: boolean) {
    const next = checked
      ? [...new Set([...local, condition])]
      : local.filter((entry) => entry !== condition);
    void save(next);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setLocal(conditions);
      }}
    >
      <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
        <Heart className="h-3.5 w-3.5" />
        <span className="ml-1">Condições</span>
        {local.length > 0 && (
          <span className="ml-1 rounded-full bg-destructive/20 px-1 text-[10px] text-destructive">
            {local.length}
          </span>
        )}
      </Button>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label} · Condições</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {DIGIROLE_CONDITIONS.map((condition) => (
            <label
              key={condition}
              className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-2 text-xs"
            >
              <Checkbox
                checked={local.includes(condition)}
                disabled={busy}
                onCheckedChange={(checked) => toggle(condition, checked === true)}
              />
              <span>{condition}</span>
            </label>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DigiRoleBonusesButton({
  kind = "digirole_tamer",
  id,
  label,
  gameId,
  attrs,
  points,
  skills,
  bonuses,
  onChanged,
}: {
  kind?: "digirole_tamer" | "digirole_digimon";
  id: string;
  label: string;
  gameId: string;
  attrs: DigiRoleNumbers;
  points: DigiRoleNumbers;
  skills: DigiRoleNumbers;
  bonuses: DigiRoleNumbers;
  onChanged: (bonuses: DigiRoleNumbers) => void;
}) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<DigiRoleNumbers>(bonuses);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const table = kind === "digirole_tamer" ? "digirole_tamers" : "digirole_digimons";
  const baseAttr = (key: string) => (attrs[key] ?? 0) + (points[key] ?? 0);
  const totalAttr = (key: string) => baseAttr(key) + (local[key] ?? 0);
  const secondary = [
    { id: "defense", label: "Defesa", base: totalAttr("vitality") },
    { id: "resistance", label: "Resistência", base: totalAttr("wisdom") },
    { id: "clash", label: "Clash", base: totalAttr("strength") + (skills.Clash ?? 0) },
    { id: "evasion", label: "Evasion", base: totalAttr("dexterity") + (skills.Evasion ?? 0) },
    { id: "initiative", label: "Iniciativa", base: totalAttr("dexterity") + (skills.Alert ?? 0) },
  ];

  async function save() {
    setBusy(true);
    const result = await digiRoleTable(table)
      .update({ bonuses: local })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    setBusy(false);
    if (result.error) return toast.error(messageOf(result.error));
    if (!result.data) return toast.error("Você não tem permissão para alterar esta ficha.");
    onChanged(local);
    void qc.invalidateQueries({ queryKey: ["token-digirole-stats", kind, id] });
    void qc.invalidateQueries({ queryKey: ["digirole-target-info", gameId] });
    toast.success("Bônus atualizados na ficha.");
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setLocal({ ...bonuses });
      }}
    >
      <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
        <Activity className="h-3.5 w-3.5" />
        <span className="ml-1">Bônus</span>
      </Button>
      <DialogContent className="flex max-h-[88vh] max-w-lg flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{label} · Bônus</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <section>
            <Label className="text-xs font-black uppercase text-muted-foreground">
              Atributos básicos
            </Label>
            <div className="mt-1 space-y-1">
              {DIGIROLE_ATTRS.map((attr) => (
                <BonusRow
                  key={attr.id}
                  name={attr.label}
                  base={baseAttr(attr.id)}
                  bonus={local[attr.id] ?? 0}
                  onBonus={(value) => setLocal((current) => ({ ...current, [attr.id]: value }))}
                />
              ))}
            </div>
          </section>
          <section>
            <Label className="text-xs font-black uppercase text-muted-foreground">
              Atributos secundários
            </Label>
            <div className="mt-1 space-y-1">
              {secondary.map((attr) => (
                <BonusRow
                  key={attr.id}
                  name={attr.label}
                  base={attr.base}
                  bonus={local[attr.id] ?? 0}
                  onBonus={(value) => setLocal((current) => ({ ...current, [attr.id]: value }))}
                />
              ))}
            </div>
          </section>
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            Salvar bônus
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DigiRoleHybridButton({
  gameId,
  userId,
  tamerId,
  tamerName,
  inventory,
  activeSpecies,
  hybridState,
  onChanged,
}: {
  gameId: string;
  userId: string;
  tamerId: string;
  tamerName: string;
  inventory: DigiRoleTokenData["inventory"];
  activeSpecies: DigiRoleSpecies | null;
  hybridState: DigiRoleTokenData["hybrid_state"];
  onChanged: (state: DigiRoleTokenData["hybrid_state"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const evolutionItems = inventory.filter(
    (item) => item.quantity > 0 && /digispirit|digi[ -]?spirit|esp[ií]rito/i.test(item.name),
  );
  const speciesQuery = useQuery({
    queryKey: ["token-digirole-hybrid-species"],
    enabled: open,
    queryFn: async () => {
      const result = await digiRoleTable("digirole_species")
        .select(
          "id,name,stage,image_url,digi_attribute,fields,base_attrs,signature_technique,evolution_text",
        )
        .eq("stage", "Hybrid")
        .order("name");
      if (result.error) throw result.error;
      return (result.data ?? []) as DigiRoleSpecies[];
    },
  });

  function itemFor(species: DigiRoleSpecies) {
    return evolutionItems.find((item) =>
      item.name.toLocaleLowerCase("pt-BR").includes(species.name.toLocaleLowerCase("pt-BR")),
    );
  }

  async function activate(species: DigiRoleSpecies) {
    const item = itemFor(species);
    if (!item) return;
    setBusy(true);
    const state = {
      speciesId: species.id,
      speciesName: species.name,
      itemName: item.name,
    };
    const updated = await digiRoleTable("digirole_tamers")
      .update({ hybrid_state: state })
      .eq("id", tamerId)
      .select("id")
      .maybeSingle();
    if (!updated.error && updated.data) {
      await supabase.from("chat_messages").insert({
        game_id: gameId,
        user_id: userId,
        kind: "system",
        body: `${tamerName} iniciou a Digievolução Hybrid para ${species.name} usando ${item.name}.`,
      });
      onChanged(state);
      void qc.invalidateQueries({
        queryKey: ["token-digirole_tamer-status", tamerId],
      });
      void qc.invalidateQueries({ queryKey: ["digirole-target-info", gameId] });
      toast.success(`Digievolução para ${species.name} ativada.`);
      setOpen(false);
    } else {
      toast.error(messageOf(updated.error ?? new Error("A alteração foi recusada.")));
    }
    setBusy(false);
  }

  async function deactivate() {
    setBusy(true);
    const updated = await digiRoleTable("digirole_tamers")
      .update({ hybrid_state: {} })
      .eq("id", tamerId)
      .select("id")
      .maybeSingle();
    if (!updated.error && updated.data) {
      await supabase.from("chat_messages").insert({
        game_id: gameId,
        user_id: userId,
        kind: "system",
        body: `${tamerName} voltou à forma normal.`,
      });
      onChanged({});
      void qc.invalidateQueries({
        queryKey: ["token-digirole_tamer-status", tamerId],
      });
      void qc.invalidateQueries({ queryKey: ["digirole-target-info", gameId] });
      toast.success(`${tamerName} voltou à forma normal.`);
    } else {
      toast.error(messageOf(updated.error ?? new Error("A alteração foi recusada.")));
    }
    setBusy(false);
  }

  if (hybridState.speciesId) {
    return (
      <ActionBtn
        icon={<Sparkles className="h-3.5 w-3.5" />}
        label={activeSpecies ? "Voltar ao normal" : "Digievolução"}
        onClick={() => void deactivate()}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        className="h-7"
        disabled={busy || evolutionItems.length === 0}
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="ml-1">Digievolução</span>
      </Button>
      <DialogContent className="flex max-h-[85vh] max-w-xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Digievolução Hybrid</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] min-h-0 flex-1 space-y-1 overflow-y-scroll pr-2 [scrollbar-gutter:stable]">
          {(speciesQuery.data ?? []).map((species) => {
            const item = itemFor(species);
            return (
              <button
                key={species.id}
                type="button"
                disabled={!item || busy}
                onClick={() => void activate(species)}
                className="flex w-full items-center gap-3 rounded border border-border p-2 text-left enabled:hover:bg-accent disabled:opacity-40"
              >
                {species.image_url ? (
                  <DigiRoleImage
                    src={species.image_url}
                    speciesName={species.name}
                    alt=""
                    className="h-12 w-12 object-contain"
                  />
                ) : (
                  <div className="h-12 w-12 rounded bg-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">{species.name}</strong>
                  <span className="block text-[10px] text-muted-foreground">
                    {item ? `Usa ${item.name}` : `Requer DigiSpirit de ${species.name}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DigiRoleTechniquesButton({
  gameId,
  userId,
  characterId,
  characterKind,
  characterName,
  species,
  attrs,
  skills,
  dsCurrent,
  onDsChanged,
}: {
  gameId: string;
  userId: string;
  characterId: string;
  characterKind: "digirole_tamer" | "digirole_digimon";
  characterName: string;
  tokenId?: string | null;
  species: DigiRoleSpecies;
  attrs: DigiRoleNumbers;
  skills: DigiRoleNumbers;
  dsCurrent: number;
  onDsChanged: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const techniquesQuery = useQuery({
    queryKey: ["token-digirole-techniques", characterKind, characterId, species.id],
    enabled: open,
    queryFn: async (): Promise<DigiRoleTechnique[]> => {
      if (characterKind === "digirole_tamer") {
        return fetchDigiRoleSpeciesTechniques({
          speciesId: species.id,
          signatureName: species.signature_technique,
          speciesName: species.name,
        });
      }
      const result = await digiRoleTable("digirole_digimon_techniques")
        .select(
          "source,technique:technique_id(id,name,grade,ds_cost,field,category,target,accuracy_formula,damage_formula,description)",
        )
        .eq("digimon_id", characterId)
        .order("created_at");
      if (result.error) throw result.error;
      return dedupeDigiRoleTechniques(
        (result.data ?? []).flatMap(
          (row: { technique: DigiRoleTechnique | DigiRoleTechnique[] | null }) =>
            Array.isArray(row.technique) ? row.technique : row.technique ? [row.technique] : [],
        ),
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
        <BookOpen className="h-3.5 w-3.5" />
        <span className="ml-1">Técnicas</span>
      </Button>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{characterName} · Técnicas</DialogTitle>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {(techniquesQuery.data ?? []).map((technique) => {
            const accuracy = digiRoleFormulaPool(technique.accuracy_formula, attrs, skills);
            const damage = technique.damage_formula
              ? digiRoleFormulaPool(technique.damage_formula, attrs, skills)
              : 0;
            return (
              <article
                key={technique.id}
                className="self-start rounded-md border border-border p-3"
                style={{ borderLeftColor: digiRoleFieldColor(technique.field), borderLeftWidth: 3 }}
              >
                <div className="flex flex-wrap items-center gap-1">
                  <strong className="min-w-0 flex-1 truncate text-sm">{technique.name}</strong>
                  <span
                    className="rounded px-1.5 py-0.5 text-[9px] font-bold text-white"
                    style={{ backgroundColor: digiRoleFieldColor(technique.field) }}
                  >
                    {technique.field || "Neutra"}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Grau {technique.grade || "-"} · {technique.category} · {technique.target} ·{" "}
                  {technique.ds_cost} DS
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {technique.description}
                </p>
                <div className="mt-3">
                  <DigiRoleTechniqueRollDialog
                    technique={technique}
                    gameId={gameId}
                    userId={userId}
                    digimonId={characterId}
                    digimonName={characterName}
                    imageUrl={species.image_url}
                    digiAttribute={species.digi_attribute}
                    accuracyPool={accuracy}
                    damagePool={damage}
                    dsCurrent={dsCurrent}
                    onDsChanged={onDsChanged}
                    characterKind={characterKind}
                  />
                </div>
              </article>
            );
          })}
          {!techniquesQuery.isLoading && (techniquesQuery.data?.length ?? 0) === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma técnica disponível.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DigiRoleDataScanButton({
  gameId,
  userId,
  tamerId,
  tamerName,
  tokenId,
  scanPool,
}: {
  gameId: string;
  userId: string;
  tamerId: string;
  tamerName: string;
  tokenId?: string | null;
  scanPool: number;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const pageQuery = useQuery({
    queryKey: ["token-digirole-scan-page", gameId, userId],
    enabled: open,
    queryFn: async (): Promise<string | null> => {
      const [game, member] = await Promise.all([
        digiRoleTable("games").select("active_page_id").eq("id", gameId).maybeSingle(),
        digiRoleTable("game_members")
          .select("viewing_page_id")
          .eq("game_id", gameId)
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      if (game.error) throw game.error;
      if (member.error) throw member.error;
      return member.data?.viewing_page_id ?? game.data?.active_page_id ?? null;
    },
  });
  const targetsQuery = useQuery<DigiRoleScanTarget[]>({
    queryKey: ["token-digirole-scan-targets", gameId, pageQuery.data],
    enabled: open && !!pageQuery.data,
    queryFn: async () => {
      const tokenResult = await digiRoleTable("tokens")
        .select("character_id")
        .eq("game_id", gameId)
        .eq("page_id", pageQuery.data)
        .eq("character_kind", "digirole_digimon");
      if (tokenResult.error) throw tokenResult.error;
      const ids = [
        ...new Set<string>(
          (tokenResult.data ?? [])
            .map((token: { character_id?: string | null }) => token.character_id)
            .filter((value: string | null | undefined): value is string => !!value),
        ),
      ];
      if (ids.length === 0) return [];
      const result = await digiRoleTable("digirole_digimons")
        .select("id,nickname,species:species_id(id,name,stage,image_url)")
        .in("id", ids)
        .order("created_at");
      if (result.error) throw result.error;
      return (result.data ?? []).map(
        (row: {
          id: string;
          nickname: string | null;
          species:
            | { id: string; name: string; stage: string; image_url: string | null }
            | Array<{ id: string; name: string; stage: string; image_url: string | null }>
            | null;
        }): DigiRoleScanTarget => ({
          ...row,
          species: Array.isArray(row.species) ? (row.species[0] ?? null) : row.species,
        }),
      );
    },
  });
  const normalized = search.trim().toLocaleLowerCase("pt-BR");
  const targets = (targetsQuery.data ?? []).filter((target) => {
    if (!target.species) return false;
    return (
      !normalized ||
      `${target.nickname ?? ""} ${target.species.name}`
        .toLocaleLowerCase("pt-BR")
        .includes(normalized)
    );
  });
  const selected = targets.find((target) => target.id === selectedId) ?? null;

  async function scan() {
    if (!selected?.species) return;
    setBusy(true);
    try {
      const rolled = await sendDigiRoleTokenRoll({
        gameId,
        userId,
        kind: "digirole_tamer",
        characterId: tamerId,
        tokenId,
        label: `${tamerName} · Data Scan · ${selected.nickname || selected.species.name}`,
        pool: scanPool,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (supabase as any).rpc("record_digirole_scan", {
        p_tamer_id: tamerId,
        p_subject_id: selected.id,
        p_successes: rolled.successes,
      });
      if (result.error) throw result.error;
      const progress = result.data as { gained?: number; total?: number } | null;
      toast.success(`Scan concluído: +${progress?.gained ?? 0}% · total ${progress?.total ?? 0}%`);
      setOpen(false);
      setSelectedId(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["digirole-scans", tamerId] }),
        qc.invalidateQueries({ queryKey: ["token-digirole-scanned-subjects", tamerId] }),
      ]);
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
        <ScanLine className="h-3.5 w-3.5" />
        <span className="ml-1">Data Scan</span>
      </Button>
      <DialogContent className="flex max-h-[85vh] max-w-xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Data Scan · {scanPool > 0 ? `${scanPool}d6` : "Chance"}</DialogTitle>
        </DialogHeader>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Procurar Digimon nesta página..."
        />
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {targets.map((target) => {
            const active = target.id === selectedId;
            return (
              <button
                key={target.id}
                type="button"
                onClick={() => setSelectedId(target.id)}
                className={`flex w-full items-center gap-2 rounded border px-3 py-2 text-left ${active ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}
              >
                {target.species?.image_url && (
                  <DigiRoleImage
                    src={target.species.image_url}
                    speciesName={target.species.name}
                    alt=""
                    className="h-10 w-10 object-contain"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-xs">
                    {target.nickname || target.species?.name}
                  </strong>
                  <span className="block text-[10px] text-muted-foreground">
                    {target.species?.name} · {target.species?.stage}
                  </span>
                </span>
              </button>
            );
          })}
          {!targetsQuery.isLoading && targets.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">
              Nenhum Digimon possui token nesta página.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button disabled={!selected || busy} onClick={() => void scan()}>
            <ScanLine className="mr-1 h-4 w-4" /> Rolar Scan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DigiRoleEvolutionButton({
  gameId,
  digimonId,
  currentSpecies,
  rank,
  pe,
  attrs,
  skills,
  bond,
  battles,
  victories,
  trainingSuccesses,
  onUpdated,
}: {
  gameId: string;
  digimonId: string;
  currentSpecies: DigiRoleSpecies;
  rank: string;
  pe: number;
  attrs: DigiRoleNumbers;
  skills: DigiRoleNumbers;
  bond: number;
  battles: number;
  victories: number;
  trainingSuccesses: number;
  onUpdated: () => Promise<unknown> | void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" className="h-7" onClick={() => setOpen(true)}>
        <Sparkles className="h-3.5 w-3.5" />
        <span className="ml-1">Digievolução</span>
      </Button>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>DigiArchive · {currentSpecies.name}</DialogTitle>
        </DialogHeader>
        <DigiRoleEvolutionPanel
          gameId={gameId}
          digimonId={digimonId}
          currentSpeciesId={currentSpecies.id}
          currentSpeciesName={currentSpecies.name}
          rank={rank}
          pe={pe}
          evolutionText={currentSpecies.evolution_text}
          attrs={attrs}
          skills={skills}
          bond={bond}
          battles={battles}
          victories={victories}
          trainingSuccesses={trainingSuccesses}
          canEdit
          onUpdated={onUpdated}
        />
      </DialogContent>
    </Dialog>
  );
}

function T20Bar({ id, label, onRoll, onClose, onOpenSheet, extra }: Props) {
  const { data: c } = useQuery({
    queryKey: ["token-t20", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t20_characters")
        .select("image_url,skills")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as { image_url: string | null; skills: Record<string, number> | null };
    },
  });
  const quick = T20_QUICK_ROLLS.slice(0, 4);
  return (
    <Shell onClose={onClose} title={label} onOpenSheet={onOpenSheet} loading={!c}>
      {quick.map((item) => (
        <ActionBtn
          key={item.label}
          icon={
            item.label === "Iniciativa" ? (
              <Zap className="h-3.5 w-3.5" />
            ) : (
              <Dices className="h-3.5 w-3.5" />
            )
          }
          label={item.label}
          onClick={() =>
            onRoll(`${label} - ${item.label}`, c?.skills?.[item.skill] ?? 0, 0, {
              characterKind: "t20",
              characterId: id,
              imageUrl: c?.image_url,
            })
          }
        />
      ))}
      <ActionBtn
        icon={<Dices className="h-3.5 w-3.5" />}
        label="d20"
        onClick={() =>
          onRoll(`${label} - Teste`, 0, 0, {
            characterKind: "t20",
            characterId: id,
            imageUrl: c?.image_url,
          })
        }
      />
      {extra}
    </Shell>
  );
}

function TrainerBar({ id, tokenId, label, onRoll, onClose, onOpenSheet, extra }: Props) {
  const { data: t } = useQuery({
    queryKey: ["token-trainer", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainers")
        .select(
          "attrs, social_attrs, skills, rank, confidence, current_hp, status_conditions, image_url",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as {
        attrs: Record<string, number>;
        social_attrs: Record<string, number>;
        skills: Record<string, number>;
        rank: keyof typeof RANK_BONUS;
        confidence: number;
        current_hp: number | null;
        status_conditions: string[];
        image_url: string | null;
      };
    },
  });
  if (!t) return <Shell onClose={onClose} title={label} loading />;

  const dex = t.attrs?.dexterity ?? 1;
  const str = t.attrs?.strength ?? 1;
  const alert = t.skills?.Alert ?? 0;
  const evasion = t.skills?.Evasion ?? 0;
  const brawl = t.skills?.Brawl ?? 0;
  const throwSk = t.skills?.Throw ?? 0;
  const pen = 0;

  const attrList = [
    ...ATTRS.map((a) => ({ name: cap(a), value: t.attrs?.[a] ?? 1 })),
    ...SOCIAL_ATTRS.map((a) => ({ name: cap(a), value: t.social_attrs?.[a] ?? 1 })),
  ];
  const skillList = TRAINER_SKILLS.map((s) => ({ name: s, value: t.skills?.[s] ?? 0 }));

  return (
    <Shell onClose={onClose} title={label} onOpenSheet={onOpenSheet}>
      <ActionBtn
        icon={<Zap className="h-3.5 w-3.5" />}
        label="Initiative"
        onClick={() =>
          onRoll(`${label} · Initiative (Dex+Alert)`, dex + alert, pen, {
            characterKind: "trainer",
            characterId: id,
            imageUrl: t.image_url,
            tokenId,
          })
        }
      />
      <CatchButton label={label} dex={dex} throwSk={throwSk} pen={pen} onRoll={onRoll} />
      <ActionBtn
        icon={<Swords className="h-3.5 w-3.5" />}
        label="Evasion"
        onClick={() =>
          onRoll(`${label} · Evasion (Dex+Evasion)`, dex + evasion, pen, {
            characterKind: "trainer",
            characterId: id,
            imageUrl: t.image_url,
            tokenId,
          })
        }
      />
      <ActionBtn
        icon={<Swords className="h-3.5 w-3.5" />}
        label="Clash"
        onClick={() =>
          onRoll(`${label} · Clash (Str+Brawl)`, str + brawl, pen, {
            characterKind: "trainer",
            characterId: id,
            imageUrl: t.image_url,
            tokenId,
          })
        }
      />
      <GenericRollButton
        characterName={label}
        attrs={attrList}
        skills={skillList}
        painPenalty={pen}
        onRoll={onRoll}
      />
      <StatusDialogButton kind="trainer" id={id} label={label} status={t.status_conditions ?? []} />
      <AttrsDialogButton kind="trainer" id={id} label={label} />
      {extra}
    </Shell>
  );
}

function PokemonBar({
  id,
  tokenId,
  label,
  gameId,
  userId,
  onRoll,
  onClose,
  onOpenSheet,
  extra,
}: Props) {
  const spriteStyle = useGameSpriteStyle(gameId);
  const { data: p } = useQuery({
    queryKey: ["token-pokemon", id, spriteStyle],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pokemon")
        .select(
          "current_attrs, attr_points, attr_bonus, social_attrs, social_attr_points, social_attr_bonus, skills, rank, image_url, hp, current_hp, status, is_shiny, species:species_id(abilities, base_attrs, attr_limits, name, sprite_url, types)",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as {
        current_attrs: Record<string, number>;
        attr_points: Record<string, number>;
        attr_bonus: Record<string, number>;
        social_attrs: Record<string, number>;
        social_attr_points: Record<string, number>;
        social_attr_bonus: Record<string, number>;
        skills: Record<string, number>;
        rank: keyof typeof RANK_BONUS;
        image_url: string | null;
        hp: number;
        current_hp: number | null;
        is_shiny?: boolean | null;
        species: {
          abilities: string[];
          base_attrs: Record<string, number>;
          attr_limits: Record<string, number>;
          name?: string | null;
          sprite_url: string | null;
          types: string[];
        };
      };
    },
  });
  const { data: moves = [] } = useQuery({
    queryKey: ["token-pokemon-moves", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pokemon_moves")
        .select(
          "moves(id,name,type,power,accuracy_stat,accuracy_skill,damage_stat,effect,category)",
        )
        .eq("pokemon_id", id);
      if (error) throw error;
      return (data ?? []).flatMap((row) => (row.moves ? [row.moves] : []));
    },
  });

  if (!p) return <Shell onClose={onClose} title={label} loading />;

  const attrOf = (k: string) => p.current_attrs?.[k] ?? p.species?.base_attrs?.[k] ?? 1;
  const socialAttrOf = (k: string) =>
    (p.social_attrs?.[k] ?? 1) + (p.social_attr_points?.[k] ?? 0) + (p.social_attr_bonus?.[k] ?? 0);
  const dex = attrOf("dexterity");
  const str = attrOf("strength");
  const alert = p.skills?.Alert ?? 0;
  const evasion = p.skills?.Evasion ?? 0;
  const clash = p.skills?.Clash ?? 0;
  const curHp = p.current_hp ?? p.hp ?? 0;
  const pen = painPenaltyFor(curHp, p.hp ?? 0);
  const displayImage =
    p.image_url ??
    preferredPokemonSprite(p.species?.name, p.species?.sprite_url, !!p.is_shiny, spriteStyle);

  const attrList = [
    ...POKEMON_ATTRS.map((a) => ({ name: cap(a), value: attrOf(a) })),
    ...SOCIAL_ATTRS.map((a) => ({ name: cap(a), value: socialAttrOf(a) })),
  ];
  const skillList = SKILLS.map((s) => ({ name: s, value: p.skills?.[s] ?? 0 }));

  return (
    <Shell onClose={onClose} title={label} onOpenSheet={onOpenSheet}>
      <ActionBtn
        icon={<Zap className="h-3.5 w-3.5" />}
        label="Initiative"
        onClick={() =>
          onRoll(`${label} · Initiative (Dex+Alert)`, dex + alert, pen, {
            characterKind: "pokemon",
            characterId: id,
            imageUrl: displayImage,
            tokenId,
          })
        }
      />
      <ActionBtn
        icon={<Swords className="h-3.5 w-3.5" />}
        label="Evasion"
        onClick={() =>
          onRoll(`${label} · Evasion (Dex+Evasion)`, dex + evasion, pen, {
            characterKind: "pokemon",
            characterId: id,
            imageUrl: displayImage,
            tokenId,
          })
        }
      />
      <ActionBtn
        icon={<Swords className="h-3.5 w-3.5" />}
        label="Clash"
        onClick={() =>
          onRoll(`${label} · Clash (Str+Clash)`, str + clash, pen, {
            characterKind: "pokemon",
            characterId: id,
            imageUrl: displayImage,
            tokenId,
          })
        }
      />
      <GenericRollButton
        characterName={label}
        attrs={attrList}
        skills={skillList}
        painPenalty={pen}
        onRoll={onRoll}
      />
      <AbilitiesButton abilities={p.species?.abilities ?? []} label={label} onRoll={onRoll} />
      <MovesButton
        moves={moves}
        label={label}
        pokemonData={p}
        gameId={gameId}
        userId={userId}
        painPenalty={pen}
        imageUrl={displayImage}
        characterId={id}
        tokenId={tokenId}
      />
      <StatusDialogButton
        kind="pokemon"
        id={id}
        label={label}
        status={(p as unknown as { status?: string[] }).status ?? []}
      />
      <AttrsDialogButton kind="pokemon" id={id} label={label} />
      {extra}
    </Shell>
  );
}

function Shell({
  children,
  onClose,
  title,
  onOpenSheet,
  loading,
}: {
  children?: React.ReactNode;
  onClose: () => void;
  title: string;
  onOpenSheet?: () => void;
  loading?: boolean;
}) {
  return (
    <div className="pointer-events-auto flex max-w-[92vw] flex-wrap items-center gap-1 rounded-lg border border-primary/40 bg-card/95 p-1.5 shadow-xl backdrop-blur">
      <span className="px-1.5 text-xs font-bold">{title}</span>
      {loading ? <span className="px-2 text-xs text-muted-foreground">…</span> : children}
      {onOpenSheet && (
        <Button size="sm" variant="ghost" className="h-7" onClick={onOpenSheet}>
          Sheet
        </Button>
      )}
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onClose}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button size="sm" variant="outline" className="h-7" onClick={onClick}>
      {icon}
      <span className="ml-1">{label}</span>
    </Button>
  );
}

function CatchButton({
  label,
  dex,
  throwSk,
  pen,
  onRoll,
}: {
  label: string;
  dex: number;
  throwSk: number;
  pen: number;
  onRoll: (l: string, n: number, p?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const balls = [
    { k: "pokeball", n: "Pokéball", pool: 4 },
    { k: "greatball", n: "Greatball", pool: 6 },
    { k: "ultraball", n: "Ultraball", pool: 8 },
  ];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
        <Sparkles className="h-3.5 w-3.5" />
        <span className="ml-1">Catch</span>
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Capture roll</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Dex {dex} + Throw {throwSk} + Ball bonus
        </p>
        <div className="grid gap-1.5">
          {balls.map((b) => (
            <Button
              key={b.k}
              variant="outline"
              onClick={() => {
                onRoll(`${label} · Catch w/ ${b.n}`, dex + throwSk + b.pool, pen);
                setOpen(false);
              }}
            >
              {b.n} <span className="ml-2 text-xs opacity-60">{dex + throwSk + b.pool}d6</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AbilitiesButton({
  abilities,
  label,
  onRoll,
}: {
  abilities: string[];
  label: string;
  onRoll: (l: string, n: number, p?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  if (abilities.length === 0) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
        <Sparkles className="h-3.5 w-3.5" />
        <span className="ml-1">Abilities</span>
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Use ability</DialogTitle>
        </DialogHeader>
        <div className="grid gap-1.5">
          {abilities.map((a) => (
            <Button
              key={a}
              variant="outline"
              onClick={() => {
                onRoll(`${label} · Ability: ${a}`, 0);
                setOpen(false);
              }}
            >
              {a}
            </Button>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Lança apenas o log da habilidade — sem rolagem. Use a ficha para efeitos com dados.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MovesButton({
  moves,
  label,
  pokemonData,
  gameId,
  userId,
  painPenalty,
  imageUrl,
  characterId,
  tokenId,
}: {
  moves: MoveData[];
  label: string;
  pokemonData: {
    current_attrs: Record<string, number>;
    attr_points: Record<string, number>;
    attr_bonus: Record<string, number>;
    social_attrs: Record<string, number>;
    social_attr_points: Record<string, number>;
    social_attr_bonus: Record<string, number>;
    skills: Record<string, number>;
    species: { base_attrs: Record<string, number>; attr_limits: Record<string, number>; types: string[] };
  };
  gameId: string;
  userId: string;
  painPenalty: number;
  imageUrl: string | null;
  characterId: string;
  tokenId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (moves.length === 0) return null;
  const types = pokemonData.species?.types ?? [];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
        <Dices className="h-3.5 w-3.5" />
        <span className="ml-1">Moves</span>
      </Button>
      <DialogContent
        className="max-h-[85vh] max-w-3xl overflow-y-auto"
        onWheelCapture={(e) => e.stopPropagation()}
        onPointerDownOutside={() => setOpen(false)}
      >
        <DialogHeader>
          <DialogTitle>{label} — Moves</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {moves.map((m) => {
            const stats = computeMoveStats(
              m,
              {
                current_attrs: pokemonData.current_attrs,
                attr_points: pokemonData.attr_points,
                attr_bonus: pokemonData.attr_bonus,
                social_attrs: pokemonData.social_attrs,
                social_attr_points: pokemonData.social_attr_points,
                social_attr_bonus: pokemonData.social_attr_bonus,
                skills: pokemonData.skills,
                base_attrs: pokemonData.species?.base_attrs,
                attr_limits: pokemonData.species?.attr_limits,
              },
              types,
            );
            return (
              <MoveCard
                key={m.id}
                hasStab={stats.hasStab}
                data={{
                  name: m.name,
                  type: m.type as string,
                  power: m.power,
                  accuracyText: stats.accuracyText,
                  damagePoolText: stats.damagePoolText,
                  effect: m.effect ?? "",
                  category: m.category,
                }}
                accuracySlot={
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">
                    {stats.accPool}d6 <span className="opacity-70">({stats.accuracyText})</span>
                  </span>
                }
                damageSlot={
                  stats.isStatus ? (
                    <span className="text-muted-foreground">Status (no damage)</span>
                  ) : (
                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-bold text-destructive">
                      {stats.dmgPool}d6 <span className="opacity-70">({stats.damagePoolText})</span>
                    </span>
                  )
                }
                footer={
                  <MoveRollDialog
                    move={m}
                    pokemonName={label}
                    accPool={stats.accPool}
                    dmgPool={stats.dmgPool}
                    isStatus={stats.isStatus}
                    isSpecial={stats.isSpecial}
                    hasStab={stats.hasStab}
                    accuracyText={stats.accuracyText}
                    damagePoolText={stats.damagePoolText}
                    gameId={gameId}
                    userId={userId}
                    painPenalty={painPenalty}
                    imageUrl={imageUrl}
                    characterId={characterId}
                    characterKind="pokemon"
                    tokenId={tokenId}
                  />
                }
              />
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function StatusDialogButton({
  kind,
  id,
  label,
  status,
}: {
  kind: "trainer" | "pokemon";
  id: string;
  label: string;
  status: string[];
}) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<string[]>(status);
  const qc = useQueryClient();
  const col = kind === "trainer" ? "status_conditions" : "status";
  async function save(next: string[]) {
    setLocal(next);
    const table = kind === "trainer" ? "trainers" : "pokemon";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from(table) as any).update({ [col]: next }).eq("id", id);
    qc.invalidateQueries({
      queryKey: [kind === "trainer" ? "token-trainer" : "token-pokemon", id],
    });
    qc.invalidateQueries({ queryKey: [kind === "trainer" ? "trainer" : "pokemon", id] });
  }
  function toggle(name: string, on: boolean) {
    const set = new Set(local);
    if (on) set.add(name);
    else set.delete(name);
    save(Array.from(set));
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setLocal(status);
      }}
    >
      <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
        <Heart className="h-3.5 w-3.5" />
        <span className="ml-1">Status</span>
        {local.length > 0 && (
          <span className="ml-1 rounded-full bg-destructive/20 px-1 text-[10px] text-destructive">
            {local.length}
          </span>
        )}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label} — Status conditions</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-1.5">
          {STATUS_CONDITIONS.map((c) => (
            <label
              key={c}
              className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            >
              <Checkbox checked={local.includes(c)} onCheckedChange={(v) => toggle(c, !!v)} />
              <span className="truncate">{c}</span>
            </label>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AttrsDialogButton({
  kind,
  id,
  label,
}: {
  kind: "trainer" | "pokemon";
  id: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const table = kind === "trainer" ? "trainers" : "pokemon";
  const attrCol = kind === "trainer" ? "attrs" : "current_attrs";
  const physAttrs = kind === "trainer" ? ATTRS : POKEMON_ATTRS;

  const { data, refetch } = useQuery({
    queryKey: ["token-attrs", kind, id, open],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from(table) as any)
        .select(
          `${attrCol}, attr_bonus, social_attrs, social_attr_bonus${kind === "pokemon" ? ", modifiers" : ""}`,
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as {
        [k: string]: Record<string, number> | null;
      };
    },
    enabled: open,
  });

  async function patchBonus(field: "attr_bonus" | "social_attr_bonus", key: string, value: number) {
    const cur = (data?.[field] ?? {}) as Record<string, number>;
    const next = { ...cur, [key]: value };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from(table) as any).update({ [field]: next }).eq("id", id);
    refetch();
    qc.invalidateQueries({
      queryKey: [kind === "trainer" ? "token-trainer" : "token-pokemon", id],
    });
    qc.invalidateQueries({ queryKey: [kind === "trainer" ? "trainer" : "pokemon", id] });
  }

  async function patchModBonus(key: "_def_bonus" | "_spdef_bonus", value: number) {
    if (kind !== "pokemon") return;
    const cur = ((data?.modifiers as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    const next = { ...cur, [key]: value };
    await supabase
      .from("pokemon")
      .update({ modifiers: next as never })
      .eq("id", id);
    refetch();
    qc.invalidateQueries({ queryKey: ["token-pokemon", id] });
    qc.invalidateQueries({ queryKey: ["token-pokemon-stats", id] });
    qc.invalidateQueries({ queryKey: ["pokemon", id] });
  }

  const attrs = (data?.[attrCol] ?? {}) as Record<string, number>;
  const attrBonus = (data?.attr_bonus ?? {}) as Record<string, number>;
  const social = (data?.social_attrs ?? {}) as Record<string, number>;
  const socialBonus = (data?.social_attr_bonus ?? {}) as Record<string, number>;
  const modifiers = ((data?.modifiers as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const defBonus = Number(modifiers._def_bonus ?? 0) || 0;
  const spdefBonus = Number(modifiers._spdef_bonus ?? 0) || 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
        <Activity className="h-3.5 w-3.5" />
        <span className="ml-1">Attrs</span>
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{label} — Atributos</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-bold">Físicos</Label>
            <div className="mt-1 space-y-1">
              {physAttrs.map((a) => (
                <BonusRow
                  key={a}
                  name={cap(a)}
                  base={attrs[a] ?? 1}
                  bonus={attrBonus[a] ?? 0}
                  onBonus={(v) => patchBonus("attr_bonus", a, v)}
                />
              ))}
            </div>
          </div>
          {kind === "pokemon" && (
            <div>
              <Label className="text-xs font-bold">Defesas (bônus extra)</Label>
              <div className="mt-1 space-y-1">
                <BonusRow
                  name="Def"
                  base={attrs.vitality ?? 1}
                  bonus={defBonus}
                  onBonus={(v) => patchModBonus("_def_bonus", v)}
                />
                <BonusRow
                  name="SpDef"
                  base={attrs.insight ?? attrs.vitality ?? 1}
                  bonus={spdefBonus}
                  onBonus={(v) => patchModBonus("_spdef_bonus", v)}
                />
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs font-bold">Sociais</Label>
            <div className="mt-1 space-y-1">
              {SOCIAL_ATTRS.map((a) => (
                <BonusRow
                  key={a}
                  name={cap(a)}
                  base={social[a] ?? 1}
                  bonus={socialBonus[a] ?? 0}
                  onBonus={(v) => patchBonus("social_attr_bonus", a, v)}
                />
              ))}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Bônus rápido (positivo ou negativo). Salvo automaticamente na ficha.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BonusRow({
  name,
  base,
  bonus,
  onBonus,
}: {
  name: string;
  base: number;
  bonus: number;
  onBonus: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs">
      <span className="flex-1 truncate font-semibold">{name}</span>
      <span className="opacity-60">base {base}</span>
      <Input
        type="number"
        value={bonus}
        onChange={(e) => onBonus(parseInt(e.target.value) || 0)}
        className="h-7 w-16 text-xs"
      />
      <span className="text-[10px] opacity-60">= {base + bonus}</span>
    </div>
  );
}
