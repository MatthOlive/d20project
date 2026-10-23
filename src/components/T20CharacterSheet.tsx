import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageSourceDialog } from "@/components/ImageSourceDialog";
import { GameAssetImage } from "@/components/GameAssetImage";
import {
  T20_ATTRIBUTES,
  T20_ARMOR_CATALOG,
  T20_CLASSES,
  T20_ORIGINS,
  T20_QUICK_ROLLS,
  T20_RACES,
  T20_SKILLS,
  T20_SHIELD_CATALOG,
  defaultT20Attributes,
  defaultT20Skills,
  calculateT20ClassDerivedStats,
  calculateT20Encumbrance,
  calculateT20EquipmentDefense,
  isValidT20DamageDice,
  parseT20RollLines,
  t20ClassTrainedSkills,
  t20ClassTrainingComplete,
  t20ClassTrainingRule,
  t20OriginTrainedSkills,
  t20OriginTrainingComplete,
  t20OriginSkills,
  t20SkillCheck,
  t20WeaponDamageExpression,
  type T20AttributeKey,
  type T20Weapon,
  type T20InventoryItem,
} from "@/lib/tormenta20";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Dices, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type JsonMap = Record<string, number>;

type T20Character = {
  id: string;
  game_id: string;
  owner_id: string;
  name: string;
  image_url: string | null;
  race: string | null;
  class_name: string | null;
  origin: string | null;
  deity: string | null;
  level: number;
  xp: number;
  attributes: JsonMap | null;
  skills: JsonMap | null;
  skill_rules_enabled: boolean;
  trained_skills: Record<string, boolean> | null;
  class_trained_skills: Record<string, boolean> | null;
  origin_trained_skills: Record<string, boolean> | null;
  armor_penalty: number;
  armor_name: string | null;
  shield_name: string | null;
  equipment_rules_enabled: boolean;
  inventory_items: T20InventoryItem[] | null;
  coins_total: number;
  adventure_backpack: boolean;
  derived_stats_initialized: boolean;
  weapons: T20Weapon[] | null;
  hp_current: number;
  hp_max: number;
  mp_current: number;
  mp_max: number;
  defense: number;
  speed: number;
  attacks: string | null;
  powers: string | null;
  spells: string | null;
  inventory: string | null;
  notes: string | null;
};

type T20Power = {
  id: string;
  game_id: string | null;
  name: string;
  category: string | null;
  cost: string | null;
  prerequisite: string | null;
  effect: string;
  source: string | null;
};

type T20Spell = {
  id: string;
  game_id: string | null;
  name: string;
  circle: string | null;
  school: string | null;
  execution: string | null;
  range_text: string | null;
  target: string | null;
  duration: string | null;
  resistance: string | null;
  cost: string | null;
  effect: string;
  source: string | null;
};

type RollMeta = {
  characterKind: "t20";
  characterId: string;
  imageUrl?: string | null;
  rollType?: "damage";
  diceExpressions?: { label: string; expression: string }[];
  attackTarget?: { id: string; damageExpression: string };
};

export function T20CharacterSheet({
  characterId,
  gameId,
  userId,
  isNarrator,
  onRoll,
  onChat,
  onDeleted,
}: {
  characterId: string;
  gameId: string;
  userId: string;
  isNarrator: boolean;
  onRoll: (label: string, modifier: number, penalty?: number, meta?: RollMeta) => void;
  onChat?: (body: string) => void;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [customRollLabel, setCustomRollLabel] = useState("Teste");
  const [customRollMod, setCustomRollMod] = useState(0);
  const [weaponDialogOpen, setWeaponDialogOpen] = useState(false);
  const [weaponName, setWeaponName] = useState("");
  const [weaponSkill, setWeaponSkill] = useState<"Luta" | "Pontaria">("Luta");
  const [weaponAttackBonus, setWeaponAttackBonus] = useState(0);
  const [weaponDamageDice, setWeaponDamageDice] = useState("1d8");
  const [weaponDamageBonus, setWeaponDamageBonus] = useState(0);
  const [weaponSpaces, setWeaponSpaces] = useState(1);
  const [weaponAddsStrength, setWeaponAddsStrength] = useState(true);
  const [attackTargetId, setAttackTargetId] = useState("");
  const [inventoryItemName, setInventoryItemName] = useState("");
  const [inventoryItemQuantity, setInventoryItemQuantity] = useState(1);
  const [inventoryItemSpaces, setInventoryItemSpaces] = useState(1);
  const { data: sheet, isLoading } = useQuery({
    queryKey: ["t20-character", characterId],
    queryFn: async () => {
      const { data, error } = await supabase.from("t20_characters")
        .select("*")
        .eq("id", characterId)
        .single();
      if (error) throw error;
      return data as T20Character;
    },
  });

  const canEdit = !!sheet && (isNarrator || sheet.owner_id === userId);
  const attrs = useMemo(
    () => ({ ...defaultT20Attributes(), ...(sheet?.attributes ?? {}) }),
    [sheet?.attributes],
  );
  const skills = useMemo(
    () => ({ ...defaultT20Skills(), ...(sheet?.skills ?? {}) }),
    [sheet?.skills],
  );
  const weapons = sheet?.weapons ?? [];
  const inventoryItems = sheet?.inventory_items ?? [];
  const weightedWeapons: T20InventoryItem[] = weapons.map((weapon) => ({
    id: `weapon-${weapon.id}`,
    name: weapon.name,
    quantity: 1,
    spacesEach: Math.max(0, Number(weapon.spaces) || 0),
  }));
  const carryingItems = [...inventoryItems, ...weightedWeapons];
  const weaponsMissingSpaces = weapons.filter((weapon) => !Number.isFinite(weapon.spaces)).length;
  const encumbrance = calculateT20Encumbrance(
    attrs.forca ?? 0,
    carryingItems,
    sheet?.coins_total ?? 0,
    sheet?.adventure_backpack ?? false,
    sheet?.armor_name,
    sheet?.shield_name,
  );
  const { data: attackTargets = [] } = useQuery({
    queryKey: ["t20-attack-targets", gameId, characterId],
    enabled: !!sheet,
    queryFn: async () => {
      const { data, error } = await supabase.from("t20_characters")
        .select("id,name,defense")
        .eq("game_id", gameId)
        .neq("id", characterId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const trainedSkills = sheet?.trained_skills ?? {};
  const classTrainingChoices = sheet?.class_trained_skills ?? {};
  const originTrainingChoices = sheet?.origin_trained_skills ?? {};
  const classTrainingRule = t20ClassTrainingRule(sheet?.class_name);
  const classTrainedSkills = t20ClassTrainedSkills(sheet?.class_name, classTrainingChoices);
  const originTrainedSkills = t20OriginTrainedSkills(sheet?.origin, originTrainingChoices);
  const selectedRequiredClassSkill = classTrainingRule?.requiredChoice?.find((skill) => classTrainingChoices[skill]);
  const additionalClassChoices = classTrainingRule?.choices.filter(
    (skill) => !classTrainingRule.fixed.includes(skill) && (!classTrainingRule.requiredChoice?.includes(skill) || skill !== selectedRequiredClassSkill),
  ) ?? [];
  const selectedAdditionalClassChoices = additionalClassChoices.filter((skill) => classTrainingChoices[skill]).length;
  const classTrainingComplete = t20ClassTrainingComplete(sheet?.class_name, classTrainingChoices);
  const originTrainingOptions = t20OriginSkills(sheet?.origin);
  const originTrainingComplete = t20OriginTrainingComplete(sheet?.origin, originTrainingChoices);
  const selectedOrigin = T20_ORIGINS.find((origin) => t20OriginSkills(origin) === originTrainingOptions) ?? "";
  const selectedOriginTrainingCount = originTrainingOptions?.filter((skill) => originTrainingChoices[skill]).length ?? 0;
  const skillRulesEnabled = sheet?.skill_rules_enabled ?? false;
  const classDerivedStats = calculateT20ClassDerivedStats(
    sheet?.class_name,
    sheet?.level ?? 1,
    attrs.constituicao ?? 0,
    attrs.destreza ?? 0,
  );
  const applyClassDerivedStats = () => {
    if (!sheet || !classDerivedStats) return;
    const firstApplication = !sheet.derived_stats_initialized;
    const equippedDefense = calculateT20EquipmentDefense(
      attrs.destreza ?? 0,
      sheet.armor_name,
      sheet.shield_name,
    );
    patch.mutate({
      hp_max: classDerivedStats.hpMax,
      hp_current: firstApplication ? classDerivedStats.hpMax : Math.min(sheet.hp_current, classDerivedStats.hpMax),
      mp_max: classDerivedStats.mpMax,
      mp_current: firstApplication ? classDerivedStats.mpMax : Math.min(sheet.mp_current, classDerivedStats.mpMax),
      ...(firstApplication && equippedDefense
        ? { defense: equippedDefense.defense, armor_penalty: equippedDefense.armorPenalty, equipment_rules_enabled: true }
        : {}),
      derived_stats_initialized: true,
    });
  };
  const getSkillCheck = (skill: string) =>
    t20SkillCheck(skill, {
      level: sheet?.level ?? 1,
      attributes: attrs,
      trained: !!trainedSkills[skill] || classTrainedSkills.has(skill) || originTrainedSkills.has(skill),
      useRules: skillRulesEnabled,
      manualBonus: skills[skill] ?? 0,
      armorPenalty: (sheet?.armor_penalty ?? 0) + encumbrance.skillPenalty,
    });
  const attackRolls = useMemo(() => parseT20RollLines(sheet?.attacks), [sheet?.attacks]);
  const spellRolls = useMemo(() => parseT20RollLines(sheet?.spells), [sheet?.spells]);

  const { data: powerCatalog = [] } = useQuery({
    queryKey: ["t20-power-catalog", gameId],
    queryFn: async () => {
      const { data, error } = await supabase.from("t20_powers")
        .select("*")
        .or(`game_id.is.null,game_id.eq.${gameId}`)
        .order("name");
      if (error) throw error;
      return (data ?? []) as T20Power[];
    },
  });
  const { data: spellCatalog = [] } = useQuery({
    queryKey: ["t20-spell-catalog", gameId],
    queryFn: async () => {
      const { data, error } = await supabase.from("t20_spells")
        .select("*")
        .or(`game_id.is.null,game_id.eq.${gameId}`)
        .order("name");
      if (error) throw error;
      return (data ?? []) as T20Spell[];
    },
  });
  const { data: knownPowers = [] } = useQuery({
    queryKey: ["t20-character-powers", characterId],
    queryFn: async () => {
      const { data, error } = await supabase.from("t20_character_powers")
        .select("notes,t20_powers(*)")
        .eq("character_id", characterId);
      if (error) throw error;
      return (data ?? []).flatMap((row) => row.t20_powers ? [row.t20_powers] : []);
    },
  });
  const { data: knownSpells = [] } = useQuery({
    queryKey: ["t20-character-spells", characterId],
    queryFn: async () => {
      const { data, error } = await supabase.from("t20_character_spells")
        .select("notes,prepared,t20_spells(*)")
        .eq("character_id", characterId);
      if (error) throw error;
      return (data ?? []).flatMap((row) => row.t20_spells ? [row.t20_spells] : []);
    },
  });

  const patch = useMutation({
    mutationFn: async (partial: Partial<T20Character>) => {
      const { error } = await supabase.from("t20_characters")
        .update(partial)
        .eq("id", characterId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["t20-character", characterId] });
      qc.invalidateQueries({ queryKey: ["characters", gameId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function remove() {
    if (!sheet || !canEdit) return;
    if (!confirm(`Deletar "${sheet.name}"?`)) return;
    const { error } = await supabase.from("t20_characters").delete().eq("id", sheet.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["characters", gameId] });
    onDeleted?.();
  }

  function updateAttr(key: T20AttributeKey, value: number) {
    const nextAttributes = { ...attrs, [key]: value };
    const equipmentDerived = sheet?.equipment_rules_enabled
      ? calculateT20EquipmentDefense(nextAttributes.destreza ?? 0, sheet.armor_name, sheet.shield_name)
      : null;
    patch.mutate({
      attributes: nextAttributes as never,
      ...(equipmentDerived ? { defense: equipmentDerived.defense, armor_penalty: equipmentDerived.armorPenalty } : {}),
    });
  }

  function updateSkill(skill: string, value: number) {
    patch.mutate({ skills: { ...skills, [skill]: value } as never });
  }

  function updateEquipment(armorName: string, shieldName: string) {
    if (!sheet) return;
    const derived = calculateT20EquipmentDefense(attrs.destreza ?? 0, armorName, shieldName);
    if (!derived) {
      toast.error("Equipamento desconhecido; a Defesa manual foi preservada.");
      return;
    }
    patch.mutate({
      armor_name: armorName || null,
      shield_name: shieldName || null,
      equipment_rules_enabled: true,
      defense: derived.defense,
      armor_penalty: derived.armorPenalty,
    });
  }

  function addInventoryItem() {
    const name = inventoryItemName.trim();
    if (!name) {
      toast.error("Informe o nome do item.");
      return;
    }
    const quantity = Math.max(1, Math.trunc(inventoryItemQuantity) || 1);
    const spacesEach = Math.max(0, Math.round(Number(inventoryItemSpaces) * 2) / 2);
    const nextItems = [...inventoryItems, { id: crypto.randomUUID(), name, quantity, spacesEach }];
    const nextLoad = calculateT20Encumbrance(attrs.forca ?? 0, [...nextItems, ...weightedWeapons], sheet?.coins_total ?? 0, sheet?.adventure_backpack ?? false, sheet?.armor_name, sheet?.shield_name);
    if (nextLoad.overMaximum) {
      toast.error(`Esse item ultrapassaria o limite máximo de ${nextLoad.maximumCapacity} espaços.`);
      return;
    }
    patch.mutate({ inventory_items: nextItems });
    setInventoryItemName("");
    setInventoryItemQuantity(1);
    setInventoryItemSpaces(1);
  }

  function changeInventoryQuantity(itemId: string, amount: number) {
    const nextItems = inventoryItems
      .map((item) => item.id === itemId ? { ...item, quantity: item.quantity + amount } : item)
      .filter((item) => item.quantity > 0);
    const nextLoad = calculateT20Encumbrance(attrs.forca ?? 0, [...nextItems, ...weightedWeapons], sheet?.coins_total ?? 0, sheet?.adventure_backpack ?? false, sheet?.armor_name, sheet?.shield_name);
    if (amount > 0 && nextLoad.overMaximum) {
      toast.error(`O limite máximo é ${nextLoad.maximumCapacity} espaços.`);
      return;
    }
    patch.mutate({ inventory_items: nextItems });
  }

  function changeCoins(value: number) {
    const coins = Math.max(0, Math.trunc(value) || 0);
    const nextLoad = calculateT20Encumbrance(attrs.forca ?? 0, carryingItems, coins, sheet?.adventure_backpack ?? false, sheet?.armor_name, sheet?.shield_name);
    if (coins > (sheet?.coins_total ?? 0) && nextLoad.overMaximum) {
      toast.error(`O limite máximo é ${nextLoad.maximumCapacity} espaços.`);
      return;
    }
    patch.mutate({ coins_total: coins });
  }

  function toggleAdventureBackpack(checked: boolean) {
    const nextLoad = calculateT20Encumbrance(attrs.forca ?? 0, carryingItems, sheet?.coins_total ?? 0, checked, sheet?.armor_name, sheet?.shield_name);
    if (!checked && nextLoad.overMaximum) {
      toast.error(`Sem a mochila, a carga excederia o limite máximo de ${nextLoad.maximumCapacity} espaços.`);
      return;
    }
    patch.mutate({ adventure_backpack: checked });
  }

  function roll(label: string, modifier: number) {
    if (!sheet) return;
    onRoll(`${sheet.name} - ${label}`, modifier, 0, {
      characterKind: "t20",
      characterId: sheet.id,
      imageUrl: sheet.image_url,
    });
  }

  function saveWeapon() {
    const name = weaponName.trim();
    if (!name) {
      toast.error("Informe o nome da arma.");
      return;
    }
    if (!isValidT20DamageDice(weaponDamageDice)) {
      toast.error("Use dados de dano válidos, como 1d8 ou 2d6.");
      return;
    }
    const weapon: T20Weapon = {
      id: crypto.randomUUID(),
      name,
      attackSkill: weaponSkill,
      attackBonus: weaponAttackBonus,
      damageDice: weaponDamageDice.trim().toLowerCase(),
      damageBonus: weaponDamageBonus,
      addStrength: weaponAddsStrength,
      spaces: Math.max(0, Math.round(Number(weaponSpaces) * 2) / 2),
    };
    patch.mutate({ weapons: [...weapons, weapon] });
    setWeaponName("");
    setWeaponAttackBonus(0);
    setWeaponDamageBonus(0);
    setWeaponSpaces(1);
    setWeaponDialogOpen(false);
  }

  function rollWeaponAttack(weapon: T20Weapon) {
    if (!sheet) return;
    const target = attackTargets.find((candidate) => candidate.id === attackTargetId);
    if (!target) {
      toast.error("Selecione um alvo para comparar o ataque com a Defesa.");
      return;
    }
    const skillCheck = getSkillCheck(weapon.attackSkill);
    onRoll(`${sheet.name} - ${weapon.name} — ataque vs ${target.name}`, skillCheck.modifier + weapon.attackBonus, 0, {
      characterKind: "t20",
      characterId: sheet.id,
      imageUrl: sheet.image_url,
      attackTarget: {
        id: target.id,
        damageExpression: t20WeaponDamageExpression(weapon, attrs.forca ?? 0),
      },
    });
  }

  function rollWeaponDamage(weapon: T20Weapon) {
    if (!sheet) return;
    const expression = t20WeaponDamageExpression(weapon, attrs.forca ?? 0);
    if (!expression) return;
    onRoll(`${sheet.name} - ${weapon.name} — dano`, 0, 0, {
      characterKind: "t20",
      characterId: sheet.id,
      imageUrl: sheet.image_url,
      rollType: "damage",
      diceExpressions: [{ label: weapon.name, expression }],
    });
  }

  function removeWeapon(weaponId: string) {
    patch.mutate({ weapons: weapons.filter((weapon) => weapon.id !== weaponId) });
  }

  function updateWeaponSpaces(weaponId: string, spaces: number) {
    const safeSpaces = Math.max(0, Math.round(Number(spaces) * 2) / 2);
    patch.mutate({ weapons: weapons.map((weapon) => weapon.id === weaponId ? { ...weapon, spaces: safeSpaces } : weapon) });
  }

  async function addPower(powerId: string) {
    const { error } = await supabase.from("t20_character_powers")
      .insert({ character_id: characterId, power_id: powerId });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["t20-character-powers", characterId] });
  }

  async function addSpell(spellId: string) {
    const { error } = await supabase.from("t20_character_spells")
      .insert({ character_id: characterId, spell_id: spellId });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["t20-character-spells", characterId] });
  }

  async function removePower(powerId: string) {
    const { error } = await supabase.from("t20_character_powers")
      .delete()
      .eq("character_id", characterId)
      .eq("power_id", powerId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["t20-character-powers", characterId] });
  }

  async function removeSpell(spellId: string) {
    const { error } = await supabase.from("t20_character_spells")
      .delete()
      .eq("character_id", characterId)
      .eq("spell_id", spellId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["t20-character-spells", characterId] });
  }

  if (isLoading || !sheet) return <div className="p-4 text-sm text-muted-foreground">Carregando ficha...</div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-col items-center gap-2">
          {sheet.image_url ? (
            <GameAssetImage src={sheet.image_url} alt="" className="h-24 w-24 rounded-md border border-border object-cover" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
              <ImageIcon className="h-5 w-5" />
            </div>
          )}
          {canEdit && <ImageSourceDialog title="Imagem" onPick={(url) => patch.mutate({ image_url: url })} />}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <Input
            value={sheet.name}
            disabled={!canEdit}
            onChange={(e) => patch.mutate({ name: e.target.value })}
            className="h-10 text-lg font-bold"
          />
          <div className="grid gap-2 sm:grid-cols-5">
            <SelectField label="Raca" value={sheet.race ?? ""} disabled={!canEdit} options={T20_RACES} onChange={(v) => patch.mutate({ race: v })} />
            <SelectField label="Classe" value={sheet.class_name ?? ""} disabled={!canEdit} options={T20_CLASSES} onChange={(v) => patch.mutate({ class_name: v, class_trained_skills: {} as never })} />
            <TextField label="Origem" value={sheet.origin ?? ""} disabled={!canEdit} onChange={(v) => patch.mutate({ origin: v, origin_trained_skills: {} as never })} />
            <TextField label="Divindade" value={sheet.deity ?? ""} disabled={!canEdit} onChange={(v) => patch.mutate({ deity: v })} />
            <NumberField label="Nivel" value={sheet.level} disabled={!canEdit} onChange={(v) => patch.mutate({ level: v })} />
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-6">
        <NumberField label="PV" value={sheet.hp_current} disabled={!canEdit} onChange={(v) => patch.mutate({ hp_current: v })} suffix={`/${sheet.hp_max}`} />
        <NumberField label="PV max" value={sheet.hp_max} disabled={!canEdit} onChange={(v) => patch.mutate({ hp_max: v })} />
        <NumberField label="PM" value={sheet.mp_current} disabled={!canEdit} onChange={(v) => patch.mutate({ mp_current: v })} suffix={`/${sheet.mp_max}`} />
        <NumberField label="Defesa" value={sheet.defense} disabled={!canEdit} onChange={(v) => patch.mutate({ defense: v })} />
        <NumberField label="Desloc." value={sheet.speed} disabled={!canEdit} onChange={(v) => patch.mutate({ speed: v })} />
        <NumberField label="XP" value={sheet.xp} disabled={!canEdit} onChange={(v) => patch.mutate({ xp: v })} />
      </div>
      <section className="space-y-2 rounded-md border border-border bg-card p-3">
        <h3 className="text-sm font-bold">Armadura, escudo e Defesa</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <SelectField
            label="Armadura"
            value={sheet.armor_name ?? ""}
            disabled={!canEdit || patch.isPending}
            options={T20_ARMOR_CATALOG.map((item) => item.name)}
            onChange={(armorName) => updateEquipment(armorName, sheet.shield_name ?? "")}
          />
          <SelectField
            label="Escudo"
            value={sheet.shield_name ?? ""}
            disabled={!canEdit || patch.isPending}
            options={T20_SHIELD_CATALOG.map((item) => item.name)}
            onChange={(shieldName) => updateEquipment(sheet.armor_name ?? "", shieldName)}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {(() => {
            const equipped = calculateT20EquipmentDefense(attrs.destreza ?? 0, sheet.armor_name, sheet.shield_name);
            if (!equipped) return "Item fora do catálogo: Defesa e penalidade continuam manuais.";
            return `Pela regra-base: Defesa ${equipped.defense} (${equipped.armorIsHeavy ? "armadura pesada não soma Destreza" : "soma Destreza"}; armadura +${equipped.armorBonus}, escudo +${equipped.shieldBonus}). Penalidade acumulada: ${equipped.armorPenalty}.`;
          })()}
          {" "}Armadura/escudo aplicam a fórmula ao selecionar. {sheet.equipment_rules_enabled ? "Defesa automática ativa: mudanças em Destreza também recalculam a Defesa." : "A Defesa continua manual até selecionar um equipamento ou ativar a regra."} Poderes, proficiência e efeitos temporários ainda exigem ajuste manual.
        </p>
      </section>
      <section className="space-y-3 rounded-md border border-border bg-card p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold">Inventario e carga</h3>
            <p className="text-xs text-muted-foreground">
              {encumbrance.spaces}/{encumbrance.capacity} espaços sem sobrecarga · máximo {encumbrance.maximumCapacity}
              {encumbrance.overloaded && ` · Sobrecarga: −5 em testes afetados e −3 m de deslocamento`}
              {encumbrance.overMaximum && " · Acima do máximo permitido"}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={sheet.adventure_backpack}
              disabled={!canEdit || patch.isPending}
              onChange={(event) => toggleAdventureBackpack(event.target.checked)}
            />
            Mochila de aventureiro (+2 espaços)
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(9rem,1fr)_6rem_6rem_auto]">
          <Input value={inventoryItemName} disabled={!canEdit} onChange={(event) => setInventoryItemName(event.target.value)} placeholder="Novo item" />
          <Input type="number" min={1} step={1} value={inventoryItemQuantity} disabled={!canEdit} onChange={(event) => setInventoryItemQuantity(Number(event.target.value))} aria-label="Quantidade" placeholder="Qtd." />
          <Input type="number" min={0} step={0.5} value={inventoryItemSpaces} disabled={!canEdit} onChange={(event) => setInventoryItemSpaces(Number(event.target.value))} aria-label="Espaços por unidade" placeholder="Espaços" />
          <Button type="button" size="sm" variant="outline" disabled={!canEdit || patch.isPending} onClick={addInventoryItem}><Plus className="mr-1 h-4 w-4" />Adicionar</Button>
        </div>
        {inventoryItems.length > 0 && (
          <div className="divide-y divide-border rounded border border-border">
            {inventoryItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="text-xs text-muted-foreground">{item.quantity} × {item.spacesEach} = {item.quantity * item.spacesEach} espaços</span>
                <Button type="button" size="sm" variant="ghost" disabled={!canEdit || patch.isPending} onClick={() => changeInventoryQuantity(item.id, -1)} aria-label={`Remover uma unidade de ${item.name}`}>−</Button>
                <Button type="button" size="sm" variant="ghost" disabled={!canEdit || patch.isPending} onClick={() => changeInventoryQuantity(item.id, 1)} aria-label={`Adicionar uma unidade de ${item.name}`}>+</Button>
                <Button type="button" size="icon" variant="ghost" disabled={!canEdit || patch.isPending} onClick={() => changeInventoryQuantity(item.id, -item.quantity)} aria-label={`Remover ${item.name}`}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <NumberField label="Moedas (todas as denominações)" value={sheet.coins_total} disabled={!canEdit} onChange={changeCoins} />
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>Itens: {encumbrance.carriedItemSpaces} · armadura/escudo: {encumbrance.equipmentSpaces} · moedas: {encumbrance.coinSpaces} · total: {encumbrance.spaces} espaços.</p>
            <p>Deslocamento efetivo: {Math.max(0, sheet.speed - encumbrance.speedPenalty)} m.</p>
            <p>Inventário antigo em texto foi preservado e não entra no cálculo; adicione aqui os itens para contar espaços. A mochila de aventureiro dá +2 espaços sem ocupar espaço.</p>
            {weaponsMissingSpaces > 0 && <p className="text-amber-600">Defina os espaços de {weaponsMissingSpaces} arma(s) antiga(s) na seção Armas; o valor não foi presumido.</p>}
          </div>
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canEdit || !classDerivedStats || patch.isPending}
          onClick={applyClassDerivedStats}
        >
          {!sheet.derived_stats_initialized ? "Aplicar valores iniciais" : "Recalcular maximos PV/PM"}
        </Button>
        <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
          {classDerivedStats
            ? !sheet.derived_stats_initialized
              ? `Primeira aplicação preenche PV/PM atuais e define Defesa base ${calculateT20EquipmentDefense(attrs.destreza ?? 0, sheet.armor_name, sheet.shield_name)?.defense ?? classDerivedStats.baseDefense}.`
              : "Atualiza os máximos pela classe, nível e Constituição, preserva os PV/PM atuais e não altera Defesa nem equipamento."
            : "Escolha uma classe para calcular PV/PM. A Defesa base é calculada sem armadura ou escudo."}
        </p>
      </div>
      {skillRulesEnabled && (
        <div className="max-w-48 space-y-1">
          <NumberField
            label="Penalidade de armadura"
            value={sheet.armor_penalty}
            disabled={!canEdit}
            onChange={(v) => patch.mutate({ armor_penalty: Math.max(0, v) })}
          />
          <p className="text-[11px] text-muted-foreground">
            Aplicada automaticamente a Acrobacia, Furtividade e Ladinagem.
          </p>
        </div>
      )}

      <section className="space-y-2 rounded-md border border-border bg-card p-3">
        <h3 className="text-sm font-bold">Rolagens rapidas</h3>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {T20_QUICK_ROLLS.map((item) => {
            const check = getSkillCheck(item.skill);
            const value = check.modifier;
            return (
              <Button
                key={item.label}
                type="button"
                size="sm"
                variant="outline"
                className="justify-between"
                onClick={() => roll(item.label, value)}
                disabled={!check.canRoll}
              >
                <span>{item.label}</span>
                <span className="text-xs opacity-70">{value >= 0 ? "+" : ""}{value}</span>
              </Button>
            );
          })}
        </div>
        <div className="grid gap-2 border-t border-border pt-2 sm:grid-cols-[1fr_7rem_auto]">
          <Input
            value={customRollLabel}
            disabled={!canEdit}
            onChange={(e) => setCustomRollLabel(e.target.value)}
            className="h-8"
            placeholder="Nome do teste"
          />
          <Input
            type="number"
            value={customRollMod}
            disabled={!canEdit}
            onChange={(e) => setCustomRollMod(Number(e.target.value || 0))}
            className="h-8"
          />
          <Button type="button" size="sm" onClick={() => roll(customRollLabel || "Teste", customRollMod)}>
            Rolar
          </Button>
        </div>
      </section>

      {(attackRolls.length > 0 || spellRolls.length > 0) && (
        <section className="space-y-2 rounded-md border border-border bg-card p-3">
          <h3 className="text-sm font-bold">Acoes salvas</h3>
          <div className="flex flex-wrap gap-1.5">
            {attackRolls.map((item) => (
              <Button key={`atk:${item.label}:${item.modifier}`} type="button" size="sm" variant="outline" onClick={() => roll(item.label, item.modifier)}>
                {item.label} <span className="ml-1 text-xs opacity-70">{item.modifier >= 0 ? "+" : ""}{item.modifier}</span>
              </Button>
            ))}
            {spellRolls.map((item) => (
              <Button key={`spl:${item.label}:${item.modifier}`} type="button" size="sm" variant="outline" onClick={() => roll(item.label, item.modifier)}>
                {item.label} <span className="ml-1 text-xs opacity-70">{item.modifier >= 0 ? "+" : ""}{item.modifier}</span>
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Escreva uma acao por linha em Ataques ou Magias, terminando com o bonus. Ex.: Espada longa +8
          </p>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-bold">Atributos</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {T20_ATTRIBUTES.map((a) => (
            <div key={a.key} className="rounded-md border border-border bg-card p-2">
              <button
                type="button"
                className="mb-2 flex w-full items-center justify-between text-left text-xs font-bold"
                onClick={() => roll(a.label, attrs[a.key] ?? 0)}
              >
                <span>{a.short}</span>
                <Dices className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <Input
                type="number"
                value={attrs[a.key] ?? 0}
                disabled={!canEdit}
                onChange={(e) => updateAttr(a.key, Number(e.target.value || 0))}
                className="h-8 text-center font-bold"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        {skillRulesEnabled && (
          <div className="space-y-3 rounded-md border border-border bg-card p-3">
            <div>
              <h3 className="text-sm font-bold">Treinamento da origem</h3>
              <p className="text-[11px] text-muted-foreground">
                Regra rápida do Corebook: escolha duas perícias da origem. Treinamentos por poderes continuam marcados separadamente.
              </p>
            </div>
            <SelectField
              label="Origem para treinamento"
              value={selectedOrigin}
              disabled={!canEdit}
              options={T20_ORIGINS}
              onChange={(origin) => patch.mutate({ origin, origin_trained_skills: {} as never })}
            />
            {originTrainingOptions && originTrainingOptions.length > 0 ? (
              <>
                <div className="grid gap-1 sm:grid-cols-3">
                  {originTrainingOptions.map((skill) => (
                    <label key={skill} className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={!!originTrainingChoices[skill]}
                        disabled={!canEdit || (!originTrainingChoices[skill] && selectedOriginTrainingCount >= 2)}
                        onChange={(event) => {
                          const next = { ...originTrainingChoices };
                          if (event.currentTarget.checked) next[skill] = true;
                          else delete next[skill];
                          patch.mutate({ origin_trained_skills: next as never });
                        }}
                      />
                      {skill}
                    </label>
                  ))}
                </div>
                <p className={originTrainingComplete ? "text-xs text-emerald-600" : "text-xs text-amber-600"}>
                  {originTrainingComplete ? "Duas perícias da origem selecionadas." : `Escolha duas perícias (${selectedOriginTrainingCount}/2).`}
                </p>
              </>
            ) : selectedOrigin ? (
              <p className="text-xs text-muted-foreground">
                Esta origem não define duas perícias fixas. Combine a perícia escolhida com o narrador e marque-a na lista geral de treinamentos.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Origem personalizada: mantenha o texto no campo de origem e marque os treinamentos conhecidos na lista geral.
              </p>
            )}
          </div>
        )}
        {skillRulesEnabled && classTrainingRule && (
          <div className="space-y-3 rounded-md border border-border bg-card p-3">
            <div>
              <h3 className="text-sm font-bold">Treinamento da classe: {sheet.class_name}</h3>
              <p className="text-[11px] text-muted-foreground">
                Marque as escolhas previstas no Corebook. Perícias fixas da classe já contam como treinadas.
              </p>
            </div>
            <p className="text-xs">
              Treinamento automático: {classTrainingRule.fixed.join(", ") || "nenhuma"}
            </p>
            {classTrainingRule.requiredChoice && (
              <fieldset className="space-y-1">
                <legend className="text-xs font-semibold">Escolha uma: {classTrainingRule.requiredChoice.join(" ou ")}</legend>
                <div className="flex flex-wrap gap-2">
                  {classTrainingRule.requiredChoice.map((skill) => (
                    <label key={skill} className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={!!classTrainingChoices[skill]}
                        disabled={!canEdit}
                        onChange={(event) => {
                          const next = { ...classTrainingChoices };
                          for (const option of classTrainingRule.requiredChoice ?? []) delete next[option];
                          if (event.currentTarget.checked) next[skill] = true;
                          patch.mutate({ class_trained_skills: next as never });
                        }}
                      />
                      {skill}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <fieldset className="space-y-1">
              <legend className="text-xs font-semibold">
                Escolha {classTrainingRule.choiceCount} ({selectedAdditionalClassChoices}/{classTrainingRule.choiceCount})
              </legend>
              <div className="grid gap-1 sm:grid-cols-3">
                {additionalClassChoices.map((skill) => (
                  <label key={skill} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={!!classTrainingChoices[skill]}
                      disabled={!canEdit || (!classTrainingChoices[skill] && selectedAdditionalClassChoices >= classTrainingRule.choiceCount)}
                      onChange={(event) => {
                        const next = { ...classTrainingChoices };
                        if (event.currentTarget.checked) next[skill] = true;
                        else delete next[skill];
                        patch.mutate({ class_trained_skills: next as never });
                      }}
                    />
                    {skill}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className={classTrainingComplete ? "text-xs text-emerald-600" : "text-xs text-amber-600"}>
              {classTrainingComplete ? "Treinamento inicial da classe completo." : "Complete as escolhas de treinamento para validar a classe."}
            </p>
          </div>
        )}
        <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold">Pericias</h3>
            <p className="text-[11px] text-muted-foreground">
              {skillRulesEnabled
                ? "Bonus automatico: metade do nivel + atributo-chave + treinamento, menos penalidades aplicaveis."
                : "Modo manual preserva os bonus que ja estavam salvos."}
            </p>
          </div>
          {canEdit && (
            <Button
              type="button"
              size="sm"
              variant={skillRulesEnabled ? "default" : "outline"}
              onClick={() => patch.mutate({ skill_rules_enabled: !skillRulesEnabled })}
            >
              Regras do Corebook: {skillRulesEnabled ? "ligadas" : "desligadas"}
            </Button>
          )}
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {T20_SKILLS.map((skill) => (
            <div key={skill} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
              {(() => {
                const check = getSkillCheck(skill);
                return (
                  <>
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!check.canRoll}
                      title={!check.canRoll ? "Esta pericia exige treinamento pelas regras do Corebook." : undefined}
                      onClick={() => roll(skill, check.modifier)}
                    >
                {skill}
                    </button>
                    {skillRulesEnabled ? (
                      <>
                        <label className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={!!trainedSkills[skill]}
                            disabled={!canEdit}
                            onChange={(event) =>
                              patch.mutate({
                                trained_skills: {
                                  ...trainedSkills,
                                  [skill]: event.currentTarget.checked,
                                } as never,
                              })
                            }
                          />
                          Outro treino
                        </label>
                        <span className="w-10 shrink-0 text-right font-mono text-xs font-bold">
                          {check.modifier >= 0 ? "+" : ""}{check.modifier}
                        </span>
                      </>
                    ) : (
                      <Input
                        type="number"
                        value={skills[skill] ?? 0}
                        disabled={!canEdit}
                        onChange={(e) => updateSkill(skill, Number(e.target.value || 0))}
                        className="h-7 w-16 text-center text-xs"
                      />
                    )}
                  </>
                );
              })()}
            </div>
          ))}
        </div>
        </div>
      </section>

      <CatalogSection
        title="Poderes"
        empty="Nenhum poder adicionado."
        addLabel="Adicionar poder"
        canEdit={canEdit}
        catalog={powerCatalog}
        knownIds={new Set(knownPowers.map((p) => p.id))}
        onAdd={addPower}
        onCreate={async (entry) => {
          const { data, error } = await supabase.from("t20_powers")
            .insert({ ...entry, game_id: gameId, created_by: userId })
            .select()
            .single();
          if (error) throw error;
          qc.invalidateQueries({ queryKey: ["t20-power-catalog", gameId] });
          await addPower((data as { id: string }).id);
        }}
      >
        {knownPowers.map((power) => (
          <PowerCard key={power.id} power={power} canEdit={canEdit} onRemove={() => removePower(power.id)} />
        ))}
      </CatalogSection>

      <CatalogSection
        title="Magias"
        empty="Nenhuma magia adicionada."
        addLabel="Adicionar magia"
        canEdit={canEdit}
        catalog={spellCatalog}
        knownIds={new Set(knownSpells.map((s) => s.id))}
        onAdd={addSpell}
        onCreate={async (entry) => {
          const { data, error } = await supabase.from("t20_spells")
            .insert({ ...entry, game_id: gameId, created_by: userId })
            .select()
            .single();
          if (error) throw error;
          qc.invalidateQueries({ queryKey: ["t20-spell-catalog", gameId] });
          await addSpell((data as { id: string }).id);
        }}
        spellMode
      >
        {knownSpells.map((spell) => (
          <SpellCard key={spell.id} spell={spell} canEdit={canEdit} onRemove={() => removeSpell(spell.id)} />
        ))}
      </CatalogSection>

      <section className="space-y-3 rounded-md border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold">Armas</h3>
            <p className="text-[11px] text-muted-foreground">Role o ataque e compare com a Defesa do alvo; role o dano somente após confirmar o acerto.</p>
          </div>
          <Dialog open={weaponDialogOpen} onOpenChange={setWeaponDialogOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="outline" disabled={!canEdit}><Plus className="mr-1 h-4 w-4" /> Adicionar arma</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Adicionar arma</DialogTitle></DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Nome" value={weaponName} onChange={setWeaponName} />
                <SelectField label="Perícia de ataque" value={weaponSkill} options={["Luta", "Pontaria"]} onChange={(value) => setWeaponSkill(value as "Luta" | "Pontaria")} />
                <NumberField label="Bônus extra de ataque" value={weaponAttackBonus} onChange={setWeaponAttackBonus} />
                <TextField label="Dados de dano" value={weaponDamageDice} onChange={setWeaponDamageDice} />
                <NumberField label="Bônus extra de dano" value={weaponDamageBonus} onChange={setWeaponDamageBonus} />
                <NumberField label="Espaços de carga" value={weaponSpaces} onChange={setWeaponSpaces} />
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input type="checkbox" checked={weaponAddsStrength} onChange={(event) => setWeaponAddsStrength(event.currentTarget.checked)} />
                  Somar Força ao dano
                </label>
              </div>
              <p className="text-xs text-muted-foreground">Armas corpo a corpo e arremessáveis normalmente somam Força; armas de disparo normalmente não.</p>
              <DialogFooter><Button type="button" onClick={saveWeapon} disabled={patch.isPending}>Salvar arma</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {weapons.length > 0 && (
          <label className="block max-w-sm space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Alvo para ataques</span>
            <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={attackTargetId} onChange={(event) => setAttackTargetId(event.currentTarget.value)}>
              <option value="">Selecione um personagem T20…</option>
              {attackTargets.map((target) => <option key={target.id} value={target.id}>{target.name} · Defesa {target.defense}</option>)}
            </select>
            {attackTargets.length === 0 && <span className="text-[11px] text-muted-foreground">Nenhum outro personagem T20 disponível como alvo nesta mesa.</span>}
          </label>
        )}
        {weapons.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma arma estruturada cadastrada.</p> : (
          <div className="grid gap-2 md:grid-cols-2">
            {weapons.map((weapon) => {
              const attackBonus = getSkillCheck(weapon.attackSkill).modifier + weapon.attackBonus;
              const damage = t20WeaponDamageExpression(weapon, attrs.forca ?? 0);
              return (
                <div key={weapon.id} className="flex flex-wrap items-center gap-2 rounded border p-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{weapon.name}</div>
                    <div className="text-[11px] text-muted-foreground">{weapon.attackSkill} {attackBonus >= 0 ? "+" : ""}{attackBonus} · dano {damage}</div>
                  </div>
                  <div className="w-24">
                    <NumberField label="Espaços" value={weapon.spaces ?? 0} disabled={!canEdit} onChange={(value) => updateWeaponSpaces(weapon.id, value)} />
                  </div>
                  <Button type="button" size="sm" variant="outline" disabled={!attackTargetId} onClick={() => rollWeaponAttack(weapon)}>Ataque</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => rollWeaponDamage(weapon)}>Dano</Button>
                  {canEdit && <Button type="button" size="icon" variant="ghost" aria-label={`Remover ${weapon.name}`} onClick={() => removeWeapon(weapon.id)}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <TextAreaField label="Ataques" value={sheet.attacks ?? ""} disabled={!canEdit} onChange={(v) => patch.mutate({ attacks: v })} />
        <TextAreaField label="Poderes extras" value={sheet.powers ?? ""} disabled={!canEdit} onChange={(v) => patch.mutate({ powers: v })} />
        <TextAreaField label="Magias extras" value={sheet.spells ?? ""} disabled={!canEdit} onChange={(v) => patch.mutate({ spells: v })} />
        <TextAreaField label="Inventario" value={sheet.inventory ?? ""} disabled={!canEdit} onChange={(v) => patch.mutate({ inventory: v })} />
      </div>

      <TextAreaField label="Notas" value={sheet.notes ?? ""} disabled={!canEdit} onChange={(v) => patch.mutate({ notes: v })} rows={5} />

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Mensagem como personagem..." className="h-9 flex-1" />
        <Button
          size="sm"
          variant="outline"
          disabled={!message.trim()}
          onClick={() => {
            onChat?.(`${sheet.name}: ${message.trim()}`);
            setMessage("");
          }}
        >
          Enviar
        </Button>
        {canEdit && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={remove}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Deletar
          </Button>
        )}
      </div>
    </div>
  );
}

function TextField({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <Input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-8" />
    </label>
  );
}

function NumberField({ label, value, disabled, onChange, suffix }: { label: string; value: number; disabled?: boolean; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <Input type="number" value={value ?? 0} disabled={disabled} onChange={(e) => onChange(Number(e.target.value || 0))} className="h-8" />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </label>
  );
}

function SelectField({ label, value, disabled, options, onChange }: { label: string; value: string; disabled?: boolean; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)} disabled={disabled}>
        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">-</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  );
}

function TextAreaField({ label, value, disabled, onChange, rows = 4 }: { label: string; value: string; disabled?: boolean; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <textarea
        value={value}
        disabled={disabled}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-md border border-border bg-background p-2 text-sm disabled:opacity-70"
      />
    </label>
  );
}

function CatalogSection<T extends { id: string; name: string; effect: string }>({
  title,
  empty,
  addLabel,
  canEdit,
  catalog,
  knownIds,
  onAdd,
  onCreate,
  spellMode = false,
  children,
}: {
  title: string;
  empty: string;
  addLabel: string;
  canEdit: boolean;
  catalog: T[];
  knownIds: Set<string>;
  onAdd: (id: string) => Promise<void>;
  onCreate: (entry: Record<string, string | null>) => Promise<void>;
  spellMode?: boolean;
  children: ReactNode;
}) {
  const available = catalog.filter((item) => !knownIds.has(item.id));
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">{title}</h3>
        {canEdit && (
          <CatalogAddDialog
            label={addLabel}
            available={available}
            onAdd={onAdd}
            onCreate={onCreate}
            spellMode={spellMode}
          />
        )}
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {children}
      </div>
      {(!children || (Array.isArray(children) && children.length === 0)) && (
        <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function CatalogAddDialog<T extends { id: string; name: string; effect: string }>({
  label,
  available,
  onAdd,
  onCreate,
  spellMode,
}: {
  label: string;
  available: T[];
  onAdd: (id: string) => Promise<void>;
  onCreate: (entry: Record<string, string | null>) => Promise<void>;
  spellMode?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [cost, setCost] = useState("");
  const [detailA, setDetailA] = useState("");
  const [detailB, setDetailB] = useState("");
  const [effect, setEffect] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [busy, setBusy] = useState(false);

  async function addSelected() {
    if (!pick) return;
    setBusy(true);
    try {
      await onAdd(pick);
      setOpen(false);
      setPick("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao adicionar");
    } finally {
      setBusy(false);
    }
  }

  async function createAndAdd() {
    if (!name.trim()) { toast.error("Informe um nome"); return; }
    setBusy(true);
    try {
      await onCreate(spellMode ? {
        name: name.trim(),
        circle: category || null,
        school: detailA || null,
        execution: detailB || null,
        cost: cost || null,
        effect: effect || "",
      } : {
        name: name.trim(),
        category: category || null,
        prerequisite: detailA || null,
        cost: cost || null,
        effect: effect || "",
      });
      setOpen(false);
      setName("");
      setCategory("");
      setCost("");
      setDetailA("");
      setDetailB("");
      setEffect("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar");
    } finally {
      setBusy(false);
    }
  }

  async function importBulk() {
    const entries = parseCatalogBulk(bulkText, !!spellMode);
    if (entries.length === 0) {
      toast.error("Nenhum item valido encontrado");
      return;
    }
    setBusy(true);
    try {
      for (const entry of entries) await onCreate(entry);
      setBulkText("");
      setOpen(false);
      toast.success(`${entries.length} item(ns) importado(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Plus className="mr-1 h-3.5 w-3.5" /> {label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2 rounded-md border border-border p-3">
            <Label className="text-xs">Selecionar do catalogo</Label>
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger><SelectValue placeholder={available.length ? "Escolha um item" : "Catalogo vazio"} /></SelectTrigger>
              <SelectContent>
                {available.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={!pick || busy} onClick={addSelected}>Adicionar selecionado</Button>
          </div>

          <div className="space-y-2 rounded-md border border-dashed border-border p-3">
            <Label className="text-xs">Cadastrar novo no catalogo</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={spellMode ? "Nome da magia" : "Nome do poder"} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={spellMode ? "Circulo" : "Categoria"} />
              <Input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Custo" />
              <Input value={detailA} onChange={(e) => setDetailA(e.target.value)} placeholder={spellMode ? "Escola" : "Pre-requisito"} />
              {spellMode && <Input value={detailB} onChange={(e) => setDetailB(e.target.value)} placeholder="Execucao" />}
            </div>
            <textarea
              value={effect}
              onChange={(e) => setEffect(e.target.value)}
              rows={4}
              placeholder="Efeito/descricao"
              className="w-full rounded-md border border-border bg-background p-2 text-sm"
            />
            <Button size="sm" disabled={busy || !name.trim()} onClick={createAndAdd}>Criar e adicionar</Button>
          </div>

          <div className="space-y-2 rounded-md border border-dashed border-border p-3">
            <Label className="text-xs">Importar varios para o catalogo</Label>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={6}
              placeholder={spellMode
                ? "JSON ou CSV: name,circle,school,execution,cost,effect"
                : "JSON ou CSV: name,category,prerequisite,cost,effect"}
              className="w-full rounded-md border border-border bg-background p-2 text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Aceita JSON com lista de objetos ou CSV simples com cabecalho.
            </p>
            <Button size="sm" variant="outline" disabled={busy || !bulkText.trim()} onClick={importBulk}>
              Importar lista
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parseCatalogBulk(text: string, spellMode: boolean): Record<string, string | null>[] {
  const raw = text.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => normalizeCatalogEntry(item, spellMode))
        .filter((item): item is Record<string, string | null> => !!item);
    }
  } catch {
    // Falls back to CSV below.
  }

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1)
    .map((line) => {
      const values = splitCsvLine(line);
      const obj: Record<string, string> = {};
      headers.forEach((header, index) => { obj[header] = values[index] ?? ""; });
      return normalizeCatalogEntry(obj, spellMode);
    })
    .filter((item): item is Record<string, string | null> => !!item);
}

function normalizeCatalogEntry(value: unknown, spellMode: boolean): Record<string, string | null> | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const name = String(obj.name ?? obj.nome ?? "").trim();
  if (!name) return null;
  const clean = (v: unknown) => {
    const text = String(v ?? "").trim();
    return text ? text : null;
  };
  if (spellMode) {
    return {
      name,
      circle: clean(obj.circle ?? obj.circulo),
      school: clean(obj.school ?? obj.escola),
      execution: clean(obj.execution ?? obj.execucao),
      range_text: clean(obj.range_text ?? obj.alcance),
      target: clean(obj.target ?? obj.alvo),
      duration: clean(obj.duration ?? obj.duracao),
      resistance: clean(obj.resistance ?? obj.resistencia),
      cost: clean(obj.cost ?? obj.custo),
      effect: clean(obj.effect ?? obj.efeito ?? obj.descricao) ?? "",
      source: clean(obj.source ?? obj.fonte),
    };
  }
  return {
    name,
    category: clean(obj.category ?? obj.categoria),
    prerequisite: clean(obj.prerequisite ?? obj.requisito ?? obj.pre_requisito),
    cost: clean(obj.cost ?? obj.custo),
    effect: clean(obj.effect ?? obj.efeito ?? obj.descricao) ?? "",
    source: clean(obj.source ?? obj.fonte),
  };
}

function splitCsvLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && quoted && next === '"') {
      cur += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function PowerCard({ power, canEdit, onRemove }: { power: T20Power; canEdit: boolean; onRemove: () => void }) {
  return (
    <div className="rounded-md border border-border bg-card p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-bold">{power.name}</h4>
          <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
            {power.category && <span className="rounded bg-muted px-1.5 py-0.5">{power.category}</span>}
            {power.cost && <span className="rounded bg-muted px-1.5 py-0.5">Custo: {power.cost}</span>}
            {power.prerequisite && <span className="rounded bg-muted px-1.5 py-0.5">Req: {power.prerequisite}</span>}
          </div>
        </div>
        {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></Button>}
      </div>
      {power.effect && <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{power.effect}</p>}
    </div>
  );
}

function SpellCard({ spell, canEdit, onRemove }: { spell: T20Spell; canEdit: boolean; onRemove: () => void }) {
  return (
    <div className="rounded-md border border-border bg-card p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-bold">{spell.name}</h4>
          <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
            {spell.circle && <span className="rounded bg-muted px-1.5 py-0.5">{spell.circle}</span>}
            {spell.school && <span className="rounded bg-muted px-1.5 py-0.5">{spell.school}</span>}
            {spell.execution && <span className="rounded bg-muted px-1.5 py-0.5">Exec: {spell.execution}</span>}
            {spell.cost && <span className="rounded bg-muted px-1.5 py-0.5">Custo: {spell.cost}</span>}
            {spell.range_text && <span className="rounded bg-muted px-1.5 py-0.5">Alcance: {spell.range_text}</span>}
            {spell.duration && <span className="rounded bg-muted px-1.5 py-0.5">Duracao: {spell.duration}</span>}
          </div>
        </div>
        {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></Button>}
      </div>
      {spell.target && <p className="mt-2 text-xs text-muted-foreground"><span className="font-semibold">Alvo:</span> {spell.target}</p>}
      {spell.resistance && <p className="mt-1 text-xs text-muted-foreground"><span className="font-semibold">Resistencia:</span> {spell.resistance}</p>}
      {spell.effect && <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{spell.effect}</p>}
    </div>
  );
}
