import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Cloud,
  Copy,
  Crosshair,
  Dices,
  Heart,
  ImagePlus,
  Plus,
  Shield,
  ShoppingCart,
  Sparkles,
  Swords,
  Trash2,
  User,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { AttrFourField, SkillNumberInput } from "@/components/AttrFourField";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { ImageSourceDialog } from "@/components/ImageSourceDialog";
import { SheetPermissionsDialog } from "@/components/SheetPermissionsDialog";
import {
  CHARACTER_POINTER_DROP_EVENT,
  DRAG_MIME,
  type DragCharacterPayload,
} from "@/components/MapBoard";
import { DigiRoleRoster } from "@/components/digirole/DigiRoleRoster";
import { CharacterDragPreview, useCharacterPointerDrag } from "@/hooks/use-character-pointer-drag";
import { useDigiRoleRoster, type DigiRoleRosterEntry } from "@/hooks/use-digirole-roster";
import {
  DigiRoleEvolutionPanel,
  DigiRoleScanPanel,
  DigiRoleTrainingPanel,
} from "@/components/digirole/DigiRoleProgression";
import { DigiRoleTechniqueRollDialog } from "@/components/digirole/DigiRoleTechniqueRollDialog";
import { emitEngineActionRolled } from "@/lib/game-engine/action-events";
import { fetchDigiApiImage, transparentDigiRoleImageUrl } from "@/lib/digi-api";
import {
  digiRoleAttributeColor,
  digiRoleFieldColor,
  digiRoleSheetColor,
} from "@/lib/digirole-colors";
import {
  dedupeDigiRoleTechniques,
  fetchDigiRoleSignatureTechniqueIds,
  fetchDigiRoleSpeciesTechniqueLinks,
  fetchDigiRoleSpeciesTechniques,
  type DigiRoleSpeciesTechniqueLink,
} from "@/lib/digirole-techniques";
import {
  DIGIROLE_ATTRS,
  DIGIROLE_CONDITIONS,
  DIGIROLE_NOTORIETY,
  DIGIROLE_SKILL_GROUPS,
  DIGIROLE_STAGE_RULES,
  DIGIROLE_STAGES,
  defaultDigiRoleAttrs,
  defaultDigiRoleSkills,
  digiRoleDigimonDsMax,
  digiRoleDigimonHpMax,
  digiRoleFormulaPool,
  digiRoleInitiativePool,
  digiRoleTamerDsMax,
  digiRoleTamerHpMax,
  rollDigiRole,
  type DigiRoleNumbers,
  type DigiRoleRoll,
} from "@/lib/digirole";

type SheetKind = "digirole_tamer" | "digirole_digimon";

type TamerTab =
  | { kind: "tamer" }
  | { kind: "slot"; slot: number; digimonId: string | null }
  | { kind: "cloud" }
  | { kind: "cloudDigimon"; digimonId: string }
  | { kind: "shop" };

const TAMER_TEAM_SLOTS = [1, 2, 3, 4] as const;

type BaseSheet = {
  id: string;
  game_id: string;
  owner_id: string;
  image_url: string | null;
  rank: string;
  attrs: DigiRoleNumbers;
  attr_points: DigiRoleNumbers;
  skills: DigiRoleNumbers;
  hp_current: number;
  ds_current: number;
  conditions: string[];
  notes: string | null;
  allowed_editors: string[];
  allowed_viewers: string[];
  bonuses: DigiRoleNumbers;
  equipment: Record<string, { name?: string; effects?: string; damagePool?: string }>;
};

type InventoryItem = {
  name: string;
  quantity: number;
  description?: string;
  item_type?: "technique";
  technique_id?: string;
  grade?: string;
};

type TamerSheet = BaseSheet & {
  name: string;
  age: number;
  notoriety: DigiRoleNumbers;
  condensed_count: number;
  inventory: InventoryItem[];
  achievements: Array<{ rank?: string; name: string; complete?: boolean }>;
  hybrid_state: {
    speciesId?: string;
    speciesName?: string;
    itemName?: string;
    activatedAt?: string;
  };
  pe: number;
  battles: number;
  victories: number;
  bits: number;
};

type Species = {
  id: string;
  name: string;
  stage: string;
  digi_attribute: string;
  species_type: string | null;
  fields: string[];
  available_fields: string[];
  hp_base: number;
  suggested_hp: number | null;
  stabilization_text: string | null;
  stabilization_victories: number;
  base_attrs: DigiRoleNumbers;
  signature_technique: string | null;
  evolution_text: string | null;
  image_url: string | null;
  source_page: number | null;
};

type DigimonSheet = BaseSheet & {
  nickname: string | null;
  tamer_id: string | null;
  species_id: string | null;
  bond: number;
  pe: number;
  battles: number;
  victories: number;
  training_successes: number;
  last_training_on: string | null;
  retraining_successes: number;
  unspent_attr_points: number;
  unspent_skill_points: number;
  condensation_bonus: number;
  stabilized_forms: number;
  evolution_state: Record<string, unknown>;
  team_slot: number | null;
  image_hidden: boolean;
  notoriety: DigiRoleNumbers;
  species: Species | null;
};

type Technique = {
  id: string;
  name: string;
  origin: string;
  grade: string;
  ds_cost: number;
  field: string;
  category: string;
  target: string;
  accuracy_formula: string;
  damage_formula: string | null;
  description: string;
  learnedSource?: "signature" | "learned";
};

const ROMAN_GRADE: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 };
const TECHNIQUE_GRADES = ["I", "II", "III", "IV", "V", "VI", "VII"] as const;

const MAX_TECHNIQUE_GRADE_BY_STAGE: Record<string, number> = {
  "In-Training I": 1,
  "In-Training II": 2,
  Rookie: 3,
  Armor: 4,
  Hybrid: 4,
  Champion: 4,
  Ultimate: 5,
  Jogress: 5,
  Mega: 6,
  "Mega+": 7,
};

function canonicalAutofillStage(stage: string) {
  if (stage === "Armor" || stage === "Hybrid") return "Champion";
  if (stage === "Jogress") return "Ultimate";
  if (stage === "Mega+") return "Mega";
  return stage;
}

function autofillBudgets(stage: string) {
  const canonical = canonicalAutofillStage(stage);
  const finalIndex = Math.max(
    0,
    DIGIROLE_STAGES.indexOf(canonical as (typeof DIGIROLE_STAGES)[number]),
  );
  let attrPoints = 0;
  let skillPoints = 0;
  let skillCap = 1;
  for (let index = 0; index <= Math.min(finalIndex, DIGIROLE_STAGES.indexOf("Mega")); index += 1) {
    const currentStage = DIGIROLE_STAGES[index];
    if (currentStage === "Mega+") break;
    const rule = DIGIROLE_STAGE_RULES[currentStage];
    attrPoints += rule.attrPoints;
    skillPoints += rule.skillPoints;
    skillCap = rule.skillCap;
  }
  return { attrPoints, skillPoints, skillCap };
}

function randomDistribution(
  keys: string[],
  budget: number,
  capacity: (key: string) => number,
): DigiRoleNumbers {
  const result = Object.fromEntries(keys.map((key) => [key, 0])) as DigiRoleNumbers;
  const available = keys.filter((key) => capacity(key) > 0);
  let remaining = Math.max(0, Math.trunc(budget));
  while (remaining > 0 && available.length > 0) {
    const index = Math.floor(Math.random() * available.length);
    const key = available[index];
    result[key] += 1;
    remaining -= 1;
    if (result[key] >= capacity(key)) available.splice(index, 1);
  }
  return result;
}

function shuffled<T>(values: T[]) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function techniqueIsAvailable(
  technique: Technique,
  species: Species | null,
  rank: string,
  speciesLinks: Map<string, DigiRoleSpeciesTechniqueLink>,
  signatureTechniqueIds: Set<string>,
) {
  const maxGrade = MAX_TECHNIQUE_GRADE_BY_STAGE[rank] ?? 1;
  const gradeText = technique.grade.trim().toUpperCase();
  const parsedGrade = ROMAN_GRADE[gradeText] ?? Number.parseInt(gradeText, 10);
  const grade = Number.isFinite(parsedGrade) && parsedGrade > 0 ? parsedGrade : null;
  const fields = new Set(
    [...(species?.fields ?? []), ...(species?.available_fields ?? [])].map((field) =>
      field.toLocaleLowerCase("pt-BR"),
    ),
  );
  const techniqueField = technique.field.toLocaleLowerCase("pt-BR");
  const fieldAllowed =
    !technique.field ||
    /neutra|unclassified/i.test(technique.field) ||
    [...fields].some((field) => techniqueField.includes(field));
  const speciesTechnique =
    speciesLinks.has(technique.id) ||
    (!!species &&
      technique.origin.toLocaleLowerCase("pt-BR") === species.name.toLocaleLowerCase("pt-BR"));
  if (signatureTechniqueIds.has(technique.id) && !speciesTechnique) return false;
  // Legacy rows without a grade can only act as an explicit signature fallback.
  if (grade === null) return speciesLinks.get(technique.id)?.is_signature === true;
  return speciesTechnique || (grade <= maxGrade && fieldAllowed);
}

function genericTechniqueLimit(wisdom: number) {
  return Math.max(0, 2 + Math.trunc(wisdom));
}

function table(name: string) {
  // Catalog tables are added by a local migration and intentionally extend the generated schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase.from(name as never) as any;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function attrsWithBonuses(
  attrs: DigiRoleNumbers,
  points: DigiRoleNumbers,
  bonuses: DigiRoleNumbers,
) {
  return Object.fromEntries(
    DIGIROLE_ATTRS.map((attr) => [
      attr.id,
      (attrs[attr.id] ?? 0) + (points[attr.id] ?? 0) + (bonuses[attr.id] ?? 0),
    ]),
  );
}

function actionPool(
  attrs: DigiRoleNumbers,
  points: DigiRoleNumbers,
  bonuses: DigiRoleNumbers,
  skills: DigiRoleNumbers,
  attr: string,
  skill: string,
  secondary?: string,
) {
  return (
    (attrs[attr] ?? 0) +
    (points[attr] ?? 0) +
    (bonuses[attr] ?? 0) +
    (skills[skill] ?? 0) +
    (secondary ? (bonuses[secondary] ?? 0) : 0)
  );
}

function configuredDamagePool(
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

const TAMER_ACHIEVEMENTS: Record<string, string[]> = {
  "In-Training I": ["Possuir um Digivice", "Possuir seu primeiro Digimon"],
  "In-Training II": [
    "Vencer uma batalha relevante",
    "Completar uma missão",
    "Aumentar o Vínculo de um Digimon",
  ],
  Rookie: [
    "Estabilizar uma forma In-Training II",
    "Completar um objetivo importante",
    "Possuir dois Digimon registrados",
  ],
  Champion: [
    "Estabilizar uma forma Rookie",
    "Superar uma ameaça adequada ao rank Rookie",
    "Usar uma Digievolução em batalha",
  ],
  Ultimate: [
    "Estabilizar uma forma Champion",
    "Concluir um grande arco ou missão",
    "Possuir um Digimon com Vínculo 3 ou maior",
  ],
  Mega: [
    "Estabilizar uma forma Ultimate",
    "Superar um conflito de grande importância",
    "Possuir três formas estabilizadas",
    "Possuir um Digimon com Vínculo 4 ou maior",
  ],
};

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error);
}

async function sendDigiRoleRoll({
  gameId,
  userId,
  kind,
  characterId,
  label,
  pool,
  actionType,
  minimumSuccesses = 0,
}: {
  gameId: string;
  userId: string;
  kind: SheetKind;
  characterId: string;
  label: string;
  pool: number;
  actionType?: "move" | "reaction" | "initiative";
  minimumSuccesses?: number;
}) {
  const result = rollDigiRole(pool, pool <= 0 ? 1 : 0);
  const displayedSuccesses = Math.max(minimumSuccesses, result.successes);
  const inserted = await supabase.from("chat_messages").insert({
    game_id: gameId,
    user_id: userId,
    kind: "roll",
    body: label,
    roll_data: {
      label,
      system: "digirole",
      pool: result.pool,
      dice: result.dice,
      chanceDice: result.chanceDice,
      chance: result.chance,
      successes: displayedSuccesses,
      ...(displayedSuccesses !== result.successes ? { rawSuccesses: result.successes } : {}),
      ones: result.dice.filter((die) => die === 1).length,
    },
  });
  if (inserted.error) throw inserted.error;
  if (actionType) {
    emitEngineActionRolled({
      gameId,
      characterId,
      characterKind: kind,
      actionType,
      label,
      resultSuccesses: displayedSuccesses,
    });
  }
  return { ...result, successes: displayedSuccesses };
}

export function DigiRoleSheet({
  kind,
  characterId,
  gameId,
  userId,
  isNarrator,
  onDeleted,
  activePageId = null,
}: {
  kind: SheetKind;
  characterId: string;
  gameId: string;
  userId: string;
  isNarrator: boolean;
  onDeleted: () => void;
  activePageId?: string | null;
}) {
  return kind === "digirole_tamer" ? (
    <DigiRoleTamerSheet
      id={characterId}
      gameId={gameId}
      userId={userId}
      isNarrator={isNarrator}
      activePageId={activePageId}
      onDeleted={onDeleted}
    />
  ) : (
    <DigiRoleDigimonSheet
      id={characterId}
      gameId={gameId}
      userId={userId}
      isNarrator={isNarrator}
      onDeleted={onDeleted}
    />
  );
}

function AttributeGrid({
  values,
  points,
  bonuses,
  skills,
  canEdit,
  onChange,
  onPoints,
  onBonuses,
  baseReadOnly = false,
}: {
  values: DigiRoleNumbers;
  points: DigiRoleNumbers;
  bonuses: DigiRoleNumbers;
  skills: DigiRoleNumbers;
  canEdit: boolean;
  onChange: (values: DigiRoleNumbers) => void;
  onPoints: (values: DigiRoleNumbers) => void;
  onBonuses: (values: DigiRoleNumbers) => void;
  baseReadOnly?: boolean;
}) {
  return (
    <section className="m-4 mt-0 rounded-xl border border-border bg-card p-4">
      <h3 className="mb-2 text-xs font-black uppercase text-muted-foreground">Atributos</h3>
      <div className="grid gap-1.5 lg:grid-cols-2">
        {DIGIROLE_ATTRS.map((attr) => (
          <AttrFourField
            key={attr.id}
            label={attr.label}
            base={values[attr.id] ?? 1}
            points={points[attr.id] ?? 0}
            bonus={bonuses[attr.id] ?? 0}
            baseEditable={!baseReadOnly}
            disabled={!canEdit}
            onChange={(next) => {
              if (next.base !== undefined) onChange({ ...values, [attr.id]: next.base });
              if (next.points !== undefined) onPoints({ ...points, [attr.id]: next.points });
              if (next.bonus !== undefined) onBonuses({ ...bonuses, [attr.id]: next.bonus });
            }}
          />
        ))}
      </div>
      <h4 className="mb-1 mt-3 text-[10px] font-black uppercase text-muted-foreground">
        Atributos secundários
      </h4>
      <div className="grid gap-1.5 lg:grid-cols-2">
        {[
          [
            "defense",
            "Defesa",
            (values.vitality ?? 0) + (points.vitality ?? 0) + (bonuses.vitality ?? 0),
          ],
          [
            "resistance",
            "Resistência",
            (values.wisdom ?? 0) + (points.wisdom ?? 0) + (bonuses.wisdom ?? 0),
          ],
          [
            "clash",
            "Clash",
            (values.strength ?? 0) +
              (points.strength ?? 0) +
              (bonuses.strength ?? 0) +
              (skills.Clash ?? 0),
          ],
          [
            "evasion",
            "Evade",
            (values.dexterity ?? 0) +
              (points.dexterity ?? 0) +
              (bonuses.dexterity ?? 0) +
              (skills.Evasion ?? 0),
          ],
          [
            "initiative",
            "Iniciativa",
            (values.dexterity ?? 0) +
              (points.dexterity ?? 0) +
              (bonuses.dexterity ?? 0) +
              (skills.Alert ?? 0),
          ],
          ["clash_times", "Clash times", 1],
          ["evasion_times", "Evasion times", 1],
        ].map(([id, label, base]) => (
          <AttrFourField
            key={String(id)}
            label={String(label)}
            base={Number(base)}
            points={0}
            bonus={bonuses[String(id)] ?? 0}
            baseEditable={false}
            hidePoints
            disabled={!canEdit}
            onChange={(next) => {
              if (next.bonus !== undefined) onBonuses({ ...bonuses, [String(id)]: next.bonus });
            }}
          />
        ))}
      </div>
    </section>
  );
}

function SkillGrid({
  values,
  notoriety,
  canEdit,
  onChange,
  onNotoriety,
}: {
  values: DigiRoleNumbers;
  notoriety?: DigiRoleNumbers;
  canEdit: boolean;
  onChange: (values: DigiRoleNumbers) => void;
  onNotoriety?: (values: DigiRoleNumbers) => void;
}) {
  return (
    <section className="m-4 mt-0 rounded-xl border border-border bg-card p-4">
      <h3 className="mb-2 text-xs font-black uppercase text-muted-foreground">Perícias</h3>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {Object.entries(DIGIROLE_SKILL_GROUPS).map(([group, skills]) => (
          <div key={group} className="rounded-md border border-border bg-background px-2 py-1.5">
            <h4 className="mb-0.5 text-[9px] font-black uppercase text-primary">{group}</h4>
            <div>
              {skills.map((skill) => (
                <label
                  key={skill}
                  className="flex h-7 items-center gap-1 border-t border-border/50 first:border-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[10px] font-semibold">{skill}</span>
                  <SkillNumberInput
                    value={values[skill] ?? 0}
                    disabled={!canEdit}
                    onChange={(value) => onChange({ ...values, [skill]: value })}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
        {notoriety && onNotoriety && (
          <div className="rounded-md border border-border bg-background px-2 py-1.5">
            <h4 className="mb-0.5 text-[9px] font-black uppercase text-primary">Notoriedade</h4>
            <div>
              {DIGIROLE_NOTORIETY.map((skill) => (
                <label
                  key={skill}
                  className="flex h-7 items-center gap-1 border-t border-border/50 first:border-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[10px] font-semibold">{skill}</span>
                  <SkillNumberInput
                    value={notoriety[skill] ?? 0}
                    disabled={!canEdit}
                    onChange={(value) => onNotoriety({ ...notoriety, [skill]: value })}
                  />
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function RollBuilder({
  name,
  attrs,
  bonuses,
  skills,
  onRoll,
}: {
  name: string;
  attrs: DigiRoleNumbers;
  bonuses: DigiRoleNumbers;
  skills: DigiRoleNumbers;
  onRoll: (label: string, pool: number) => void;
}) {
  const [attr, setAttr] = useState("dexterity");
  const [skill, setSkill] = useState("Alert");
  const [bonus, setBonus] = useState(0);
  const attrMeta = DIGIROLE_ATTRS.find((entry) => entry.id === attr)!;
  const pool = (attrs[attr] ?? 0) + (bonuses[attr] ?? 0) + (skills[skill] ?? 0) + bonus;
  return (
    <section className="m-4 mt-0 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Dices className="h-4 w-4 text-primary" />
        <Select value={attr} onValueChange={setAttr}>
          <SelectTrigger className="h-8 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIGIROLE_ATTRS.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs font-black">+</span>
        <Select value={skill} onValueChange={setSkill}>
          <SelectTrigger className="h-8 min-w-44 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(DIGIROLE_SKILL_GROUPS)
              .flat()
              .map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {entry}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <span className="text-xs font-black">+</span>
        <Input
          title="Bônus da rolagem"
          aria-label="Bônus da rolagem"
          type="number"
          value={bonus}
          onChange={(event) => setBonus(asNumber(event.target.value))}
          className="h-8 w-20 text-center"
        />
        <Button size="sm" onClick={() => onRoll(`${name} · ${attrMeta.label} + ${skill}`, pool)}>
          Rolar {pool > 0 ? `${pool}d6` : "Chance"}
        </Button>
      </div>
    </section>
  );
}

function Conditions({
  values,
  canEdit,
  onChange,
}: {
  values: string[];
  canEdit: boolean;
  onChange: (values: string[]) => void;
}) {
  return (
    <section className="m-4 mt-0 rounded-xl border border-border bg-card p-4">
      <h3 className="mb-2 text-xs font-black uppercase text-muted-foreground">Condições</h3>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
        {DIGIROLE_CONDITIONS.map((condition) => (
          <label
            key={condition}
            className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-[11px]"
          >
            <Checkbox
              checked={values.includes(condition)}
              disabled={!canEdit}
              onCheckedChange={(checked) =>
                onChange(
                  checked ? [...values, condition] : values.filter((entry) => entry !== condition),
                )
              }
            />
            {condition}
          </label>
        ))}
      </div>
    </section>
  );
}

type EquipmentValue = { name?: string; effects?: string; damagePool?: string };

function EquipmentGrid({
  values,
  kinds,
  canEdit,
  onChange,
}: {
  values: Record<string, EquipmentValue>;
  kinds: Array<{ id: string; label: string; damage?: boolean }>;
  canEdit: boolean;
  onChange: (values: Record<string, EquipmentValue>) => void;
}) {
  return (
    <section className="m-4 mt-0 rounded-xl border border-border bg-card p-4">
      <h3 className="mb-2 text-xs font-black uppercase text-muted-foreground">Equipamentos</h3>
      <div className="grid gap-2 lg:grid-cols-2">
        {kinds.map((kind) => {
          const item = values?.[kind.id] ?? {};
          return (
            <article key={kind.id} className="rounded-md border border-border p-3">
              <h4 className="mb-2 text-[10px] font-black uppercase text-primary">{kind.label}</h4>
              <div className={`grid gap-2 ${kind.damage ? "sm:grid-cols-[1fr_110px]" : ""}`}>
                <Input
                  placeholder="Nome"
                  value={item.name ?? ""}
                  readOnly={!canEdit}
                  onChange={(event) =>
                    onChange({ ...values, [kind.id]: { ...item, name: event.target.value } })
                  }
                />
                {kind.damage && (
                  <Input
                    placeholder="Pool de dano"
                    value={item.damagePool ?? ""}
                    readOnly={!canEdit}
                    onChange={(event) =>
                      onChange({
                        ...values,
                        [kind.id]: { ...item, damagePool: event.target.value },
                      })
                    }
                  />
                )}
              </div>
              <Textarea
                placeholder="Efeitos"
                value={item.effects ?? ""}
                readOnly={!canEdit}
                onChange={(event) =>
                  onChange({ ...values, [kind.id]: { ...item, effects: event.target.value } })
                }
                className="mt-2 min-h-16"
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}

function InventoryEditor({
  values,
  canEdit,
  onChange,
}: {
  values: TamerSheet["inventory"];
  canEdit: boolean;
  onChange: (values: TamerSheet["inventory"]) => void;
}) {
  const items = values ?? [];
  return (
    <section className="m-4 mt-0 rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-black uppercase text-muted-foreground">Inventário</h3>
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onChange([...items, { name: "", quantity: 1, description: "" }])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Item
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={index}
            className="grid gap-2 rounded border border-border p-2 sm:grid-cols-[72px_1fr_auto]"
          >
            <Input
              title="Quantidade"
              type="number"
              min={0}
              value={item.quantity}
              readOnly={!canEdit}
              onChange={(event) =>
                onChange(
                  items.map((entry, current) =>
                    current === index
                      ? { ...entry, quantity: asNumber(event.target.value) }
                      : entry,
                  ),
                )
              }
            />
            <Input
              placeholder="Nome do item"
              value={item.name}
              readOnly={!canEdit}
              onChange={(event) =>
                onChange(
                  items.map((entry, current) =>
                    current === index ? { ...entry, name: event.target.value } : entry,
                  ),
                )
              }
            />
            {canEdit && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onChange(items.filter((_, current) => current !== index))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Textarea
              placeholder="Descrição do item"
              value={item.description ?? ""}
              readOnly={!canEdit}
              onChange={(event) =>
                onChange(
                  items.map((entry, current) =>
                    current === index ? { ...entry, description: event.target.value } : entry,
                  ),
                )
              }
              className="min-h-14 sm:col-span-3"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function TechniqueSection({
  techniques,
  loading,
  gameId,
  userId,
  characterId,
  characterKind,
  name,
  imageUrl,
  digiAttribute,
  attrs,
  skills,
  dsCurrent,
  onDsChanged,
  onAdd,
  onForget,
}: {
  techniques: Technique[];
  loading: boolean;
  gameId: string;
  userId: string;
  characterId: string;
  characterKind: SheetKind;
  name: string;
  imageUrl: string | null;
  digiAttribute: string;
  attrs: DigiRoleNumbers;
  skills: DigiRoleNumbers;
  dsCurrent: number;
  onDsChanged: (value: number) => void;
  onAdd?: () => void;
  onForget?: (techniqueId: string) => void;
}) {
  return (
    <section className="m-4 mt-0 rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-black uppercase text-muted-foreground">Técnicas</h3>
        {onAdd && (
          <Button size="sm" variant="outline" onClick={onAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
          </Button>
        )}
      </div>
      <div className="grid max-h-[34rem] gap-2 overflow-y-auto pr-2 [scrollbar-gutter:stable] sm:grid-cols-2">
        {techniques.map((technique) => {
          const accuracy = digiRoleFormulaPool(technique.accuracy_formula, attrs, skills);
          const damage = technique.damage_formula
            ? digiRoleFormulaPool(technique.damage_formula, attrs, skills)
            : 0;
          return (
            <article
              key={technique.id}
              className="rounded-md border border-border p-3"
              style={{ borderLeftColor: digiRoleFieldColor(technique.field), borderLeftWidth: 3 }}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <h4 className="font-black">{technique.name}</h4>
                    <Badge
                      className="text-[9px]"
                      style={{
                        backgroundColor: digiRoleFieldColor(technique.field),
                        color: "white",
                      }}
                    >
                      {technique.field || "Neutra"}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {technique.learnedSource === "signature" ? "Assinatura" : "Genérica"} · Grau{" "}
                    {technique.grade || "-"} · {technique.category} · {technique.target} ·{" "}
                    {technique.ds_cost} DS
                  </p>
                </div>
                {onForget && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => onForget(technique.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {technique.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <DigiRoleTechniqueRollDialog
                  technique={technique}
                  gameId={gameId}
                  userId={userId}
                  digimonId={characterId}
                  digimonName={name}
                  imageUrl={imageUrl}
                  digiAttribute={digiAttribute}
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
        {!loading && techniques.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhuma técnica disponível para esta forma.
          </p>
        )}
      </div>
    </section>
  );
}

function TamerAchievements({
  values,
  rank,
  canEdit,
  onChange,
}: {
  values: TamerSheet["achievements"];
  rank: string;
  canEdit: boolean;
  onChange: (values: TamerSheet["achievements"]) => void;
}) {
  const rows = values ?? [];
  function persistedIndex(entryRank: string, name: string) {
    return rows.findIndex((entry) => (entry.rank ?? rank) === entryRank && entry.name === name);
  }
  function setPreset(entryRank: string, name: string, complete: boolean) {
    const index = persistedIndex(entryRank, name);
    if (index < 0) onChange([...rows, { rank: entryRank, name, complete }]);
    else
      onChange(rows.map((entry, current) => (current === index ? { ...entry, complete } : entry)));
  }
  const nextRank =
    DIGIROLE_STAGES[DIGIROLE_STAGES.indexOf(rank as (typeof DIGIROLE_STAGES)[number]) + 1] ?? null;
  const requirementRank = nextRank ?? rank;
  const presets = nextRank ? (TAMER_ACHIEVEMENTS[nextRank] ?? []) : [];
  const customRows = rows
    .map((entry, index) => ({ entry, index }))
    .filter(
      ({ entry }) =>
        nextRank && (entry.rank ?? rank) === requirementRank && !presets.includes(entry.name),
    );
  return (
    <section className="m-4 mt-0 rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-xs font-black uppercase text-muted-foreground">
        {nextRank ? `Requisitos para o próximo rank · ${nextRank}` : "Rank máximo alcançado"}
      </h3>
      {nextRank ? (
        <article className="rounded-md border border-primary/60 bg-primary/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-[10px] font-black uppercase text-primary">
              Requisitos de {nextRank}
            </h4>
            {canEdit && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  onChange([...rows, { rank: requirementRank, name: "", complete: false }])
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Personalizada
              </Button>
            )}
          </div>
          <div className="space-y-1">
            {presets.map((name) => {
              const index = persistedIndex(requirementRank, name);
              return (
                <label
                  key={name}
                  className="flex items-start gap-2 rounded border border-border px-2 py-1.5 text-[11px]"
                >
                  <Checkbox
                    checked={index >= 0 && !!rows[index].complete}
                    disabled={!canEdit}
                    onCheckedChange={(complete) =>
                      setPreset(requirementRank, name, complete === true)
                    }
                  />
                  <span>{name}</span>
                </label>
              );
            })}
            {customRows.map(({ entry, index }) => (
              <label
                key={index}
                className="flex items-center gap-2 rounded border border-border p-1.5"
              >
                <Checkbox
                  checked={!!entry.complete}
                  disabled={!canEdit}
                  onCheckedChange={(complete) =>
                    onChange(
                      rows.map((row, current) =>
                        current === index ? { ...row, complete: complete === true } : row,
                      ),
                    )
                  }
                />
                <Input
                  value={entry.name}
                  readOnly={!canEdit}
                  onChange={(event) =>
                    onChange(
                      rows.map((row, current) =>
                        current === index ? { ...row, name: event.target.value } : row,
                      ),
                    )
                  }
                  className="h-7 text-xs"
                />
                {canEdit && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => onChange(rows.filter((_, current) => current !== index))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </label>
            ))}
          </div>
        </article>
      ) : (
        <p className="text-xs text-muted-foreground">
          Não há um rank posterior cadastrado para esta ficha.
        </p>
      )}
    </section>
  );
}

function HybridEvolutionDialog({
  open,
  onOpenChange,
  inventory,
  gameId,
  tamerId,
  tamerName,
  userId,
  onActivated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inventory: TamerSheet["inventory"];
  gameId: string;
  tamerId: string;
  tamerName: string;
  userId: string;
  onActivated: (state: TamerSheet["hybrid_state"]) => void;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["digirole-hybrid-species"],
    enabled: open,
    queryFn: async (): Promise<Array<{ id: string; name: string; image_url: string | null }>> => {
      const result = await table("digirole_species")
        .select("id,name,image_url")
        .eq("stage", "Hybrid")
        .order("name");
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
  const evolutionItems = inventory.filter(
    (item) => item.quantity > 0 && /digispirit|digi[ -]?spirit|esp[ií]rito/i.test(item.name),
  );
  async function activate(species: { id: string; name: string }) {
    const name = species.name;
    const item = evolutionItems.find((entry) =>
      entry.name.toLocaleLowerCase("pt-BR").includes(name.toLocaleLowerCase("pt-BR")),
    );
    if (!item) return;
    const state = {
      speciesId: species.id,
      speciesName: name,
      itemName: item.name,
      activatedAt: new Date().toISOString(),
    };
    const updated = await table("digirole_tamers")
      .update({ hybrid_state: state })
      .eq("id", tamerId);
    if (updated.error) return toast.error(updated.error.message);
    const result = await supabase.from("chat_messages").insert({
      game_id: gameId,
      user_id: userId,
      kind: "system",
      body: `${tamerName} iniciou a Digievolução Hybrid para ${name} usando ${item.name}.`,
    });
    if (result.error) return toast.error(result.error.message);
    onActivated(state);
    await queryClient.invalidateQueries({
      queryKey: ["token-digirole_tamer-status", tamerId],
    });
    await queryClient.invalidateQueries({ queryKey: ["digirole-target-info", gameId] });
    toast.success(`Digievolução para ${name} registrada.`);
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Digievolução Hybrid</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] min-h-0 flex-1 space-y-1 overflow-y-scroll pr-2 [scrollbar-gutter:stable]">
          {(query.data ?? []).map((species) => {
            const available = evolutionItems.some((entry) =>
              entry.name
                .toLocaleLowerCase("pt-BR")
                .includes(species.name.toLocaleLowerCase("pt-BR")),
            );
            return (
              <button
                key={species.id}
                type="button"
                disabled={!available}
                onClick={() => void activate(species)}
                className="flex w-full items-center gap-3 rounded border border-border p-2 text-left enabled:hover:bg-accent disabled:opacity-40"
              >
                {species.image_url ? (
                  <img
                    src={transparentDigiRoleImageUrl(species.image_url) ?? species.image_url}
                    alt=""
                    className="h-12 w-12 object-contain"
                  />
                ) : (
                  <div className="h-12 w-12 rounded bg-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm">{species.name}</strong>
                  <span className="text-[10px] text-muted-foreground">
                    Requer DigiSpirit de {species.name}
                  </span>
                </span>
              </button>
            );
          })}
          {!query.isLoading && (query.data?.length ?? 0) === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              Nenhuma forma Hybrid cadastrada.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DigiRoleTabButton({
  active,
  title,
  children,
  slot,
  cloud,
  onClick,
  onMouseDown,
  onPointerDown,
}: {
  active: boolean;
  title: string;
  children: React.ReactNode;
  slot?: number;
  cloud?: boolean;
  onClick: () => void;
  onMouseDown?: React.MouseEventHandler<HTMLButtonElement>;
  onPointerDown?: React.PointerEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      data-digirole-team-slot={slot}
      data-digirole-cloud-target={cloud ? "true" : undefined}
      onClick={onClick}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      onMouseDown={onMouseDown}
      onPointerDown={onPointerDown}
      style={onPointerDown ? { touchAction: "none", userSelect: "none" } : undefined}
      className={`flex h-11 w-full items-center justify-center rounded-md border transition ${active ? "border-primary bg-primary/15 ring-1 ring-primary" : "border-border bg-card hover:bg-accent"}`}
    >
      {children}
    </button>
  );
}

function DigiRoleTamerSheet({
  id,
  gameId,
  userId,
  isNarrator,
  activePageId,
  onDeleted,
}: {
  id: string;
  gameId: string;
  userId: string;
  isNarrator: boolean;
  activePageId: string | null;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const teamPointerDrag = useCharacterPointerDrag();
  const query = useQuery({
    queryKey: ["digirole-tamer", id],
    queryFn: async () => {
      const result = await table("digirole_tamers").select("*").eq("id", id).single();
      if (result.error) throw result.error;
      return result.data as TamerSheet;
    },
  });
  const [draft, setDraft] = useState<TamerSheet | null>(null);
  const [active, setActive] = useState<TamerTab>({ kind: "tamer" });
  const [hybridOpen, setHybridOpen] = useState(false);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  const hybridSpeciesId = draft?.hybrid_state?.speciesId ?? null;
  const hybridSpeciesQuery = useQuery({
    queryKey: ["digirole-tamer-hybrid-species", hybridSpeciesId],
    enabled: !!hybridSpeciesId,
    queryFn: async (): Promise<Species> => {
      const result = await table("digirole_species")
        .select("*")
        .eq("id", hybridSpeciesId!)
        .single();
      if (result.error) throw result.error;
      return result.data as Species;
    },
  });
  const hybridSpecies = hybridSpeciesQuery.data ?? null;
  const hybridSignatureTechnique =
    hybridSpecies?.signature_technique ??
    (
      {
        DR: "Dragon Burst",
        NSp: "Savage Fang",
        WG: "Gale Strike",
        JT: "Nature Bind",
        DS: "Aqua Burst",
        NSo: "Dark Pulse",
        ME: "Metal Cannon",
      } as Record<string, string>
    )[hybridSpecies?.fields?.[0] ?? ""] ??
    null;
  const hybridTechniquesQuery = useQuery({
    queryKey: ["digirole-tamer-hybrid-techniques", hybridSpecies?.id, hybridSignatureTechnique],
    enabled: !!hybridSpecies,
    queryFn: async (): Promise<Technique[]> => {
      return fetchDigiRoleSpeciesTechniques({
        speciesId: hybridSpecies!.id,
        signatureName: hybridSignatureTechnique,
        speciesName: hybridSpecies!.name,
      });
    },
  });
  const rosterQuery = useDigiRoleRoster(id, gameId);
  const roster = useMemo(() => rosterQuery.data ?? [], [rosterQuery.data]);
  useEffect(() => {
    if (active.kind === "slot") {
      const digimon = roster.find((entry) => entry.team_slot === active.slot) ?? null;
      if ((digimon?.id ?? null) !== active.digimonId) {
        setActive({ kind: "slot", slot: active.slot, digimonId: digimon?.id ?? null });
      }
      return;
    }
    if (
      active.kind === "cloudDigimon" &&
      !roster.some((entry) => entry.id === active.digimonId && entry.team_slot == null)
    ) {
      setActive({ kind: "cloud" });
    }
  }, [active, roster]);
  const assignDigimon = useCallback(
    async (digimonId: string, slot: number | null) => {
      const result = await (
        supabase as never as {
          rpc: (
            name: string,
            args: Record<string, unknown>,
          ) => Promise<{ error: { message: string } | null }>;
        }
      ).rpc("assign_digimon_to_tamer", {
        p_digimon_id: digimonId,
        p_tamer_id: id,
        p_team_slot: slot,
      });
      if (result.error) throw new Error(result.error.message);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["digirole-roster", id] }),
        queryClient.invalidateQueries({ queryKey: ["digirole-files", gameId] }),
      ]);
    },
    [gameId, id, queryClient],
  );
  useEffect(() => {
    function pointerDrop(event: Event) {
      const detail = (event as CustomEvent).detail as
        { payload?: DragCharacterPayload; clientX?: number; clientY?: number } | undefined;
      if (
        !detail?.payload ||
        detail.payload.kind !== "digirole_digimon" ||
        typeof detail.clientX !== "number" ||
        typeof detail.clientY !== "number"
      )
        return;
      const target = rosterTarget(detail.clientX, detail.clientY);
      if (target === undefined) return;
      const current = draft;
      if (!current || !(isNarrator || current.owner_id === userId)) return;
      event.preventDefault();
      event.stopPropagation();
      void assignDigimon(detail.payload.id, target)
        .then(() =>
          toast.success(
            target == null ? "Digimon guardado na Nuvem." : "Digimon adicionado ao Time.",
          ),
        )
        .catch((error) => toast.error(messageOf(error)));
    }
    window.addEventListener(CHARACTER_POINTER_DROP_EVENT, pointerDrop, { capture: true });
    return () =>
      window.removeEventListener(CHARACTER_POINTER_DROP_EVENT, pointerDrop, { capture: true });
  }, [assignDigimon, draft, isNarrator, userId]);
  if (query.isLoading || !draft)
    return <div className="p-5 text-sm text-muted-foreground">Carregando Tamer...</div>;
  if (query.error)
    return <div className="p-5 text-sm text-destructive">{messageOf(query.error)}</div>;
  const tamer = draft;
  const canEdit =
    isNarrator || draft.owner_id === userId || (draft.allowed_editors ?? []).includes(userId);
  const combatAttrs = hybridSpecies?.base_attrs ?? draft.attrs;
  const effectiveAttrs = attrsWithBonuses(
    combatAttrs,
    draft.attr_points ?? {},
    draft.bonuses ?? {},
  );
  const hpMax = hybridSpecies
    ? digiRoleDigimonHpMax(hybridSpecies.hp_base, effectiveAttrs)
    : digiRoleTamerHpMax(effectiveAttrs);
  const dsMax = digiRoleTamerDsMax(effectiveAttrs, draft.condensed_count);
  const initiativePool =
    digiRoleInitiativePool(effectiveAttrs, draft.skills) + (draft.bonuses?.initiative ?? 0);
  const clashPool = actionPool(
    combatAttrs,
    draft.attr_points ?? {},
    draft.bonuses ?? {},
    draft.skills,
    "strength",
    "Clash",
    "clash",
  );
  const evasionPool = actionPool(
    combatAttrs,
    draft.attr_points ?? {},
    draft.bonuses ?? {},
    draft.skills,
    "dexterity",
    "Evasion",
    "evasion",
  );
  const fightPool = actionPool(
    combatAttrs,
    draft.attr_points ?? {},
    draft.bonuses ?? {},
    draft.skills,
    "strength",
    "Weapons",
  );
  const shootPool = actionPool(
    combatAttrs,
    draft.attr_points ?? {},
    draft.bonuses ?? {},
    draft.skills,
    "dexterity",
    "Weapons",
  );

  async function patch(values: Partial<TamerSheet>) {
    setDraft((current) => (current ? { ...current, ...values } : current));
    const result = await table("digirole_tamers")
      .update(values)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (result.error) toast.error(messageOf(result.error));
  }
  async function remove() {
    if (!confirm("Excluir este Tamer?")) return;
    const result = await table("digirole_tamers").delete().eq("id", id);
    if (result.error) return toast.error(messageOf(result.error));
    void queryClient.invalidateQueries({ queryKey: ["digirole-files", gameId] });
    onDeleted();
  }
  async function duplicate() {
    const result = await table("digirole_tamers").select("*").eq("id", id).single();
    if (result.error || !result.data) {
      toast.error(messageOf(result.error ?? "Falha ao duplicar a ficha."));
      return;
    }
    const {
      id: _id,
      created_at: _createdAt,
      updated_at: _updatedAt,
      ...source
    } = result.data as Record<string, unknown>;
    void _id;
    void _createdAt;
    void _updatedAt;
    const inserted = await table("digirole_tamers").insert({
      ...source,
      owner_id: userId,
      name: `${(result.data as unknown as { name?: string }).name || "Tamer"} (cópia)`,
      allowed_editors: [],
      allowed_viewers: [],
    });
    if (inserted.error) {
      toast.error(messageOf(inserted.error));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["digirole-files", gameId] });
    toast.success("Ficha de Tamer duplicada.");
  }
  function addShopItem(item: { name: string; description: string; price: number }) {
    if ((draft?.bits ?? 0) < item.price) {
      toast.error(`Bits insuficientes: ${item.price} B necessários.`);
      return;
    }
    const inventory = draft?.inventory ?? [];
    const index = inventory.findIndex(
      (entry) => entry.name.toLocaleLowerCase("pt-BR") === item.name.toLocaleLowerCase("pt-BR"),
    );
    const next =
      index < 0
        ? [...inventory, { name: item.name, quantity: 1, description: item.description }]
        : inventory.map((entry, current) =>
            current === index
              ? {
                  ...entry,
                  quantity: entry.quantity + 1,
                  description: entry.description || item.description,
                }
              : entry,
          );
    void patch({ inventory: next, bits: (draft?.bits ?? 0) - item.price });
    toast.success(`${item.name} adicionado ao inventário.`);
  }
  async function roll(
    label: string,
    pool: number,
    actionType?: "move" | "reaction" | "initiative",
  ): Promise<DigiRoleRoll | null> {
    try {
      return await sendDigiRoleRoll({
        gameId,
        userId,
        kind: "digirole_tamer",
        characterId: id,
        label,
        pool,
        actionType,
      });
    } catch (error) {
      toast.error(messageOf(error));
      return null;
    }
  }

  async function rollWeaponAttack(label: "Fight" | "Shoot", attr: "strength" | "dexterity") {
    const damagePool = configuredDamagePool(
      tamer.equipment?.weapon?.damagePool,
      effectiveAttrs,
      tamer.skills,
    );
    if (damagePool == null) return toast.error("Preencha a Pool de dano da arma equipada.");
    const accuracy = actionPool(
      combatAttrs,
      tamer.attr_points ?? {},
      tamer.bonuses ?? {},
      tamer.skills,
      attr,
      "Weapons",
    );
    const accuracyResult = await roll(`${tamer.name} · ${label} · Accuracy`, accuracy, "move");
    if (!accuracyResult) return;
    await roll(
      `${tamer.name} · ${label} · Dano (${tamer.equipment?.weapon?.name || "Arma"})`,
      damagePool,
    );
  }

  async function deactivateHybrid() {
    const updated = await table("digirole_tamers").update({ hybrid_state: {} }).eq("id", id);
    if (updated.error) return toast.error(messageOf(updated.error));
    const posted = await supabase.from("chat_messages").insert({
      game_id: gameId,
      user_id: userId,
      kind: "system",
      body: `${tamer.name} voltou à forma normal.`,
    });
    if (posted.error) toast.error(messageOf(posted.error));
    setDraft((current) => (current ? { ...current, hybrid_state: {} } : current));
    await queryClient.invalidateQueries({
      queryKey: ["token-digirole_tamer-status", id],
    });
    await queryClient.invalidateQueries({ queryKey: ["digirole-target-info", gameId] });
    toast.success(`${tamer.name} voltou à forma normal.`);
  }

  function rosterTarget(clientX: number, clientY: number): number | null | 0 | undefined {
    const elements = document.elementsFromPoint(clientX, clientY);
    const slotElement = elements
      .map((element) =>
        element instanceof HTMLElement
          ? element.closest<HTMLElement>("[data-digirole-team-slot]")
          : null,
      )
      .find(Boolean);
    const slot = Number(slotElement?.dataset.digiroleTeamSlot);
    if (Number.isInteger(slot) && slot >= 1 && slot <= 4) return slot;
    if (
      elements.some(
        (element) =>
          element instanceof HTMLElement &&
          !!element.closest('[data-digirole-cloud-target="true"]'),
      )
    )
      return null;
    if (
      elements.some(
        (element) =>
          element instanceof HTMLElement &&
          !!element.closest('[data-digirole-roster-drop-target="true"]'),
      )
    )
      return 0;
    return undefined;
  }

  async function nativeRosterDrop(event: React.DragEvent<HTMLDivElement>) {
    const raw = event.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    const payload = JSON.parse(raw) as DragCharacterPayload;
    if (payload.kind !== "digirole_digimon") return;
    const target = rosterTarget(event.clientX, event.clientY);
    if (target === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      await assignDigimon(payload.id, target);
      toast.success(target == null ? "Digimon guardado na Nuvem." : "Digimon adicionado ao Time.");
    } catch (error) {
      toast.error(messageOf(error));
    }
  }

  function rosterPayload(digimon: DigiRoleRosterEntry): DragCharacterPayload {
    return {
      kind: "digirole_digimon",
      id: digimon.id,
      label: digimon.nickname || digimon.species?.name || "Digimon",
      imageUrl: digimon.image_hidden
        ? null
        : digimon.image_url || digimon.species?.image_url || null,
      ownerId: digimon.owner_id,
    };
  }

  return (
    <div
      className="flex h-full min-h-0 w-full overflow-hidden bg-background"
      data-digirole-roster-drop-target="true"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(DRAG_MIME)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDrop={(event) => void nativeRosterDrop(event)}
    >
      <nav
        aria-label="Abas da ficha do Tamer"
        className="flex w-14 shrink-0 flex-col gap-1 border-r border-border bg-muted/40 p-1.5"
      >
        <DigiRoleTabButton
          active={active.kind === "tamer"}
          title="Tamer"
          onClick={() => setActive({ kind: "tamer" })}
        >
          <User className="h-4 w-4" />
        </DigiRoleTabButton>
        {TAMER_TEAM_SLOTS.map((slot) => {
          const digimon = roster.find((entry) => entry.team_slot === slot) ?? null;
          const label = digimon?.nickname || digimon?.species?.name || `Espaço ${slot}`;
          const image =
            digimon && !digimon.image_hidden
              ? digimon.image_url || digimon.species?.image_url
              : null;
          const payload = digimon ? rosterPayload(digimon) : null;
          return (
            <DigiRoleTabButton
              key={slot}
              slot={slot}
              active={active.kind === "slot" && active.slot === slot}
              title={label}
              onMouseDown={
                payload && canEdit
                  ? (event) => teamPointerDrag.beginMouse(event, payload)
                  : undefined
              }
              onPointerDown={
                payload && canEdit
                  ? (event) => {
                      if (event.pointerType === "mouse") return;
                      teamPointerDrag.begin(event, payload);
                    }
                  : undefined
              }
              onClick={() => {
                if (teamPointerDrag.consumeSuppressedClick()) return;
                setActive({ kind: "slot", slot, digimonId: digimon?.id ?? null });
              }}
            >
              {image ? (
                <img
                  src={transparentDigiRoleImageUrl(image) ?? image}
                  alt=""
                  draggable={false}
                  className="h-8 w-8 object-contain"
                />
              ) : (
                <span className="text-[10px] font-black text-muted-foreground">{slot}</span>
              )}
            </DigiRoleTabButton>
          );
        })}
        <DigiRoleTabButton
          cloud
          active={active.kind === "cloud" || active.kind === "cloudDigimon"}
          title="Nuvem"
          onClick={() => setActive({ kind: "cloud" })}
        >
          <Cloud className="h-4 w-4" />
        </DigiRoleTabButton>
        <DigiRoleTabButton
          active={active.kind === "shop"}
          title="Loja"
          onClick={() => setActive({ kind: "shop" })}
        >
          <ShoppingCart className="h-4 w-4" />
        </DigiRoleTabButton>
      </nav>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {active.kind === "tamer" && (
          <div className="min-h-full">
            <section className="m-4 overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 border-b-2 border-primary bg-primary/10 px-3 py-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                  DigiRole · Tamer Card
                </span>
                {hybridSpecies && (
                  <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                    Hybrid · {hybridSpecies.name}
                  </span>
                )}
                <span className="ml-auto text-[10px] font-bold uppercase text-muted-foreground">
                  Rank
                </span>
                <Select
                  value={draft.rank}
                  disabled={!canEdit}
                  onValueChange={(rank) => void patch({ rank })}
                >
                  <SelectTrigger className="h-7 w-36 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIGIROLE_STAGES.slice(0, 6).map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {stage}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 p-3 sm:grid-cols-[160px_1fr]">
                <div className="space-y-2">
                  {hybridSpecies?.image_url || draft.image_url ? (
                    <img
                      src={
                        transparentDigiRoleImageUrl(
                          hybridSpecies?.image_url ?? draft.image_url ?? "",
                        ) ??
                        hybridSpecies?.image_url ??
                        draft.image_url ??
                        ""
                      }
                      alt={hybridSpecies?.name ?? draft.name}
                      className="h-40 w-40 rounded-lg bg-muted/30 object-contain"
                    />
                  ) : (
                    <div className="grid h-40 w-40 place-items-center rounded-lg border border-dashed border-border bg-muted/20 text-2xl font-black text-muted-foreground">
                      {draft.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  {canEdit && (
                    <ImageSourceDialog
                      canRemove={!!draft.image_url}
                      onPick={(image_url) => void patch({ image_url: image_url || null })}
                      trigger={
                        <Button size="sm" variant="outline" className="w-full">
                          <ImagePlus className="mr-1 h-3.5 w-3.5" /> Imagem
                        </Button>
                      }
                    />
                  )}
                  <label className="block rounded-md border border-border bg-background px-2 py-1.5">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">
                      Bits
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-black text-primary">B</span>
                      <Input
                        type="number"
                        min={0}
                        value={draft.bits ?? 0}
                        readOnly={!canEdit}
                        onChange={(event) =>
                          void patch({ bits: Math.max(0, asNumber(event.target.value)) })
                        }
                        className="h-7"
                      />
                    </div>
                  </label>
                </div>

                <div className="min-w-0 space-y-2">
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Nome</Label>
                    <div className="flex gap-2">
                      <Input
                        value={draft.name}
                        readOnly={!canEdit}
                        onChange={(event) => void patch({ name: event.target.value })}
                        className="h-9 min-w-0 flex-1 text-base font-bold"
                      />
                      {isNarrator && (
                        <SheetPermissionsDialog
                          kind="digirole_tamer"
                          entityId={id}
                          gameId={gameId}
                          isNarrator={isNarrator}
                        />
                      )}
                      {canEdit && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="shrink-0"
                          title="Duplicar ficha"
                          onClick={() => void duplicate()}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="shrink-0"
                          title="Excluir ficha"
                          onClick={() => void remove()}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label>
                      <span className="text-[10px] font-bold uppercase text-muted-foreground">
                        Idade
                      </span>
                      <Input
                        type="number"
                        value={draft.age}
                        readOnly={!canEdit}
                        onChange={(event) => void patch({ age: asNumber(event.target.value) })}
                        className="h-8"
                      />
                    </label>
                    <label>
                      <span className="text-[10px] font-bold uppercase text-muted-foreground">
                        Condensados
                      </span>
                      <Input
                        type="number"
                        min={0}
                        value={draft.condensed_count}
                        readOnly={!canEdit}
                        onChange={(event) =>
                          void patch({ condensed_count: Math.max(0, asNumber(event.target.value)) })
                        }
                        className="h-8"
                      />
                    </label>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="rounded-md border border-border bg-background p-2">
                      <span className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground">
                        <Heart className="h-3.5 w-3.5 text-emerald-500" /> HP
                      </span>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={draft.hp_current}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            void patch({ hp_current: asNumber(event.target.value) })
                          }
                          className="h-8"
                        />
                        <span className="text-xs text-muted-foreground">
                          /{hpMax + (draft.bonuses?.hp ?? 0)}
                        </span>
                        <Input
                          title="Bônus de HP"
                          type="number"
                          value={draft.bonuses?.hp ?? 0}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            void patch({
                              bonuses: {
                                ...(draft.bonuses ?? {}),
                                hp: asNumber(event.target.value),
                              },
                            })
                          }
                          className="h-8 w-14"
                        />
                      </div>
                    </label>
                    <label className="rounded-md border border-border bg-background p-2">
                      <span className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5 text-cyan-400" /> DS
                      </span>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={draft.ds_current}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            void patch({ ds_current: asNumber(event.target.value) })
                          }
                          className="h-8"
                        />
                        <span className="text-xs text-muted-foreground">
                          /{dsMax + (draft.bonuses?.ds ?? 0)}
                        </span>
                        <Input
                          title="Bônus de DS"
                          type="number"
                          value={draft.bonuses?.ds ?? 0}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            void patch({
                              bonuses: {
                                ...(draft.bonuses ?? {}),
                                ds: asNumber(event.target.value),
                              },
                            })
                          }
                          className="h-8 w-14"
                        />
                      </div>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() =>
                        void roll(`${draft.name} · Iniciativa`, initiativePool, "initiative")
                      }
                    >
                      <Zap className="mr-1 h-3.5 w-3.5" /> Iniciativa · {initiativePool}d6
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => void roll(`${draft.name} · Clash`, clashPool, "reaction")}
                    >
                      <Shield className="mr-1 h-3.5 w-3.5" /> Clash · {clashPool}d6
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => void roll(`${draft.name} · Evasion`, evasionPool, "reaction")}
                    >
                      <Activity className="mr-1 h-3.5 w-3.5" /> Evasion · {evasionPool}d6
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => void rollWeaponAttack("Fight", "strength")}
                    >
                      <Swords className="mr-1 h-3.5 w-3.5" /> Fight · {fightPool}d6
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => void rollWeaponAttack("Shoot", "dexterity")}
                    >
                      <Crosshair className="mr-1 h-3.5 w-3.5" /> Shoot · {shootPool}d6
                    </Button>
                    <Button
                      size="sm"
                      className="h-7"
                      disabled={
                        !hybridSpeciesId &&
                        !(draft.inventory ?? []).some(
                          (item) =>
                            /digispirit|digi[ -]?spirit|esp[ií]rito/i.test(item.name) &&
                            item.quantity > 0,
                        )
                      }
                      onClick={() =>
                        hybridSpeciesId ? void deactivateHybrid() : setHybridOpen(true)
                      }
                    >
                      <Sparkles className="mr-1 h-3.5 w-3.5" />{" "}
                      {hybridSpeciesId ? "Voltar ao normal" : "Digievolução"}
                    </Button>
                  </div>
                </div>
              </div>
            </section>
            <RollBuilder
              name={draft.name}
              attrs={effectiveAttrs}
              bonuses={{}}
              skills={draft.skills}
              onRoll={(label, pool) => void roll(label, pool)}
            />
            <Conditions
              values={draft.conditions ?? []}
              canEdit={canEdit}
              onChange={(conditions) => void patch({ conditions })}
            />
            <AttributeGrid
              values={combatAttrs || defaultDigiRoleAttrs()}
              points={draft.attr_points ?? {}}
              bonuses={draft.bonuses ?? {}}
              skills={draft.skills ?? {}}
              canEdit={canEdit}
              baseReadOnly={!!hybridSpecies}
              onChange={(attrs) => void patch({ attrs })}
              onPoints={(attr_points) => void patch({ attr_points })}
              onBonuses={(bonuses) => void patch({ bonuses })}
            />
            <SkillGrid
              values={draft.skills || defaultDigiRoleSkills()}
              notoriety={draft.notoriety ?? {}}
              canEdit={canEdit}
              onChange={(skills) => void patch({ skills })}
              onNotoriety={(notoriety) => void patch({ notoriety })}
            />
            {hybridSpecies && (
              <TechniqueSection
                techniques={hybridTechniquesQuery.data ?? []}
                loading={hybridTechniquesQuery.isLoading}
                gameId={gameId}
                userId={userId}
                characterId={id}
                characterKind="digirole_tamer"
                name={draft.name}
                imageUrl={hybridSpecies.image_url}
                digiAttribute={hybridSpecies.digi_attribute}
                attrs={effectiveAttrs}
                skills={draft.skills}
                dsCurrent={draft.ds_current}
                onDsChanged={(ds_current) =>
                  setDraft((current) => (current ? { ...current, ds_current } : current))
                }
              />
            )}
            <DigiRoleScanPanel
              gameId={gameId}
              activePageId={activePageId}
              tamerId={id}
              canEdit={canEdit}
              scanPool={(effectiveAttrs.wisdom ?? 0) + (draft.skills.Science ?? 0)}
              onRoll={(label, pool) => roll(label, pool)}
            />
            <section className="m-4 mt-0 rounded-xl border border-border bg-card p-4">
              <h3 className="mb-2 text-xs font-black uppercase text-muted-foreground">Progresso</h3>
              <div className="grid grid-cols-3 gap-2">
                {(["pe", "battles", "victories"] as const).map((field) => (
                  <label
                    key={field}
                    className="text-[10px] font-bold uppercase text-muted-foreground"
                  >
                    {field}
                    <Input
                      type="number"
                      min={0}
                      value={draft[field] ?? 0}
                      readOnly={!canEdit}
                      onChange={(event) =>
                        void patch({ [field]: Math.max(0, asNumber(event.target.value)) })
                      }
                      className="mt-1"
                    />
                  </label>
                ))}
              </div>
            </section>
            <TamerAchievements
              values={draft.achievements ?? []}
              rank={draft.rank}
              canEdit={canEdit}
              onChange={(achievements) => void patch({ achievements })}
            />
            <EquipmentGrid
              values={draft.equipment ?? {}}
              kinds={[
                { id: "weapon", label: "Arma", damage: true },
                { id: "armorCore", label: "Armor Core" },
                { id: "armorBoard", label: "Armor Board" },
                { id: "chipset", label: "Digivice Chipset" },
              ]}
              canEdit={canEdit}
              onChange={(equipment) => void patch({ equipment })}
            />
            <InventoryEditor
              values={draft.inventory ?? []}
              canEdit={canEdit}
              onChange={(inventory) => void patch({ inventory })}
            />
            <section className="m-4 mt-0 rounded-xl border border-border bg-card p-4">
              <Label>Anotações</Label>
              <Textarea
                value={draft.notes ?? ""}
                readOnly={!canEdit}
                onChange={(event) => void patch({ notes: event.target.value })}
                className="mt-2 min-h-32"
              />
            </section>
          </div>
        )}

        {active.kind === "slot" &&
          (active.digimonId ? (
            <DigiRoleDigimonSheet
              id={active.digimonId}
              gameId={gameId}
              userId={userId}
              isNarrator={isNarrator}
              onDeleted={() => {
                void rosterQuery.refetch();
                setActive({ kind: "slot", slot: active.slot, digimonId: null });
              }}
            />
          ) : (
            <div
              data-digirole-team-slot={active.slot}
              className="grid min-h-full place-items-center p-8 text-center"
            >
              <div className="w-full max-w-md">
                <span className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full border border-dashed border-border text-xl font-black text-muted-foreground">
                  {active.slot}
                </span>
                <h3 className="font-bold">Espaço vazio</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Arraste um Digimon dos Arquivos ou da Nuvem para esta aba.
                </p>
                {roster.some((entry) => entry.team_slot == null) && (
                  <div className="mt-5 space-y-1 text-left">
                    <p className="text-[10px] font-black uppercase text-muted-foreground">
                      Adicionar da Nuvem
                    </p>
                    {roster
                      .filter((entry) => entry.team_slot == null)
                      .map((entry) => (
                        <Button
                          key={entry.id}
                          variant="outline"
                          className="h-auto w-full justify-start gap-2 py-2"
                          onClick={() => void assignDigimon(entry.id, active.slot)}
                        >
                          {!entry.image_hidden && (entry.image_url || entry.species?.image_url) ? (
                            <img
                              src={
                                transparentDigiRoleImageUrl(
                                  entry.image_url || entry.species?.image_url,
                                ) ?? ""
                              }
                              alt=""
                              className="h-8 w-8 object-contain"
                            />
                          ) : (
                            <span className="grid h-8 w-8 place-items-center rounded bg-muted text-[10px]">
                              DG
                            </span>
                          )}
                          <span>{entry.nickname || entry.species?.name || "Digimon"}</span>
                        </Button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          ))}

        {active.kind === "cloud" && (
          <DigiRoleRoster
            tamerId={id}
            gameId={gameId}
            view="cloud"
            canEdit={canEdit}
            onAssign={assignDigimon}
            onBuy={addShopItem}
            onOpenDigimon={(digimonId) => setActive({ kind: "cloudDigimon", digimonId })}
          />
        )}
        {active.kind === "cloudDigimon" && (
          <div className="min-h-full">
            <div className="border-b border-border bg-muted/40 p-2">
              <Button size="sm" variant="ghost" onClick={() => setActive({ kind: "cloud" })}>
                ← Nuvem
              </Button>
            </div>
            <DigiRoleDigimonSheet
              id={active.digimonId}
              gameId={gameId}
              userId={userId}
              isNarrator={isNarrator}
              onDeleted={() => {
                void rosterQuery.refetch();
                setActive({ kind: "cloud" });
              }}
            />
          </div>
        )}
        {active.kind === "shop" && (
          <DigiRoleRoster
            tamerId={id}
            gameId={gameId}
            view="shop"
            canEdit={canEdit}
            onAssign={assignDigimon}
            onBuy={addShopItem}
          />
        )}
      </main>

      <HybridEvolutionDialog
        open={hybridOpen}
        onOpenChange={setHybridOpen}
        inventory={draft.inventory ?? []}
        gameId={gameId}
        tamerId={id}
        tamerName={draft.name}
        userId={userId}
        onActivated={(hybrid_state) =>
          setDraft((current) => (current ? { ...current, hybrid_state } : current))
        }
      />
      <CharacterDragPreview preview={teamPointerDrag.preview} />
    </div>
  );
}

function DigiRoleDigimonSheet({
  id,
  gameId,
  userId,
  isNarrator,
  onDeleted,
}: {
  id: string;
  gameId: string;
  userId: string;
  isNarrator: boolean;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["digirole-digimon", id],
    queryFn: async () => {
      const result = await table("digirole_digimons")
        .select("*,species:species_id(*)")
        .eq("id", id)
        .single();
      if (result.error) throw result.error;
      return result.data as DigimonSheet;
    },
  });
  const techniqueQuery = useQuery({
    queryKey: ["digirole-digimon-techniques", id],
    queryFn: async (): Promise<Technique[]> => {
      const result = await table("digirole_digimon_techniques")
        .select("source,technique:technique_id(*)")
        .eq("digimon_id", id);
      if (result.error) throw result.error;
      return dedupeDigiRoleTechniques(
        (result.data ?? []).flatMap(
          (row: { source: "signature" | "learned"; technique: Technique | Technique[] | null }) => {
            const techniques = Array.isArray(row.technique)
              ? row.technique
              : row.technique
                ? [row.technique]
                : [];
            return techniques.map((technique) => ({ ...technique, learnedSource: row.source }));
          },
        ),
      );
    },
  });
  const [draft, setDraft] = useState<DigimonSheet | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [autoFilling, setAutoFilling] = useState(false);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  const missingImageSpecies =
    draft && !draft.image_hidden && !draft.image_url && !draft.species?.image_url
      ? draft.species
      : null;
  useEffect(() => {
    if (!missingImageSpecies) return;
    let cancelled = false;
    void fetchDigiApiImage(missingImageSpecies.name).then(async (imageUrl) => {
      if (!imageUrl || cancelled) return;
      const digimonResult = await table("digirole_digimons")
        .update({ image_url: imageUrl, image_hidden: false })
        .eq("id", id);
      if (digimonResult.error || cancelled) return;
      setDraft((current) =>
        current ? { ...current, image_url: imageUrl, image_hidden: false } : current,
      );
      await table("digirole_species")
        .update({ image_url: imageUrl })
        .eq("id", missingImageSpecies.id)
        .is("image_url", null);
      void queryClient.invalidateQueries({ queryKey: ["digirole-files", gameId] });
      void queryClient.invalidateQueries({ queryKey: ["digirole-roster"] });
      void queryClient.invalidateQueries({ queryKey: ["digirole-target-info", gameId] });
      void queryClient.invalidateQueries({
        queryKey: ["token-digirole-stats", "digirole_digimon", id],
      });
    });
    return () => {
      cancelled = true;
    };
  }, [gameId, id, missingImageSpecies, queryClient]);
  const catalogQuery = useQuery({
    queryKey: ["digirole-technique-catalog", catalogSearch],
    enabled: catalogOpen && !!draft,
    queryFn: async () => {
      let builder = table("digirole_techniques").select("*").order("name").limit(1200);
      if (catalogSearch.trim()) builder = builder.ilike("name", `%${catalogSearch.trim()}%`);
      const result = await builder;
      if (result.error) throw result.error;
      return (result.data ?? []) as Technique[];
    },
  });
  const linkedTamerQuery = useQuery({
    queryKey: ["digirole-technique-inventory", draft?.tamer_id],
    enabled: !!draft?.tamer_id,
    queryFn: async (): Promise<{ id: string; inventory: InventoryItem[] }> => {
      const result = await table("digirole_tamers")
        .select("id,inventory")
        .eq("id", draft!.tamer_id!)
        .single();
      if (result.error) throw result.error;
      const row = result.data as unknown as { id: string; inventory: InventoryItem[] | null };
      return { id: row.id, inventory: row.inventory ?? [] };
    },
  });
  const inventoryTechniqueIds = (linkedTamerQuery.data?.inventory ?? [])
    .filter((item) => item.item_type === "technique" && item.technique_id && item.quantity > 0)
    .map((item) => item.technique_id!);
  const inventoryTechniquesQuery = useQuery({
    queryKey: ["digirole-inventory-techniques", inventoryTechniqueIds],
    enabled: catalogOpen && inventoryTechniqueIds.length > 0,
    queryFn: async (): Promise<Technique[]> => {
      const result = await table("digirole_techniques").select("*").in("id", inventoryTechniqueIds);
      if (result.error) throw result.error;
      return (result.data ?? []) as Technique[];
    },
  });
  const speciesTechniqueQuery = useQuery({
    queryKey: ["digirole-species-techniques", draft?.species_id],
    enabled: !!draft?.species_id,
    queryFn: () => fetchDigiRoleSpeciesTechniqueLinks(draft!.species_id!),
  });
  const signatureTechniquesQuery = useQuery({
    queryKey: ["digirole-signature-technique-ids"],
    enabled: catalogOpen,
    queryFn: fetchDigiRoleSignatureTechniqueIds,
    staleTime: 5 * 60 * 1000,
  });
  if (query.isLoading || !draft)
    return <div className="p-5 text-sm text-muted-foreground">Carregando Digimon...</div>;
  if (query.error)
    return <div className="p-5 text-sm text-destructive">{messageOf(query.error)}</div>;
  const canEdit =
    isNarrator || draft.owner_id === userId || (draft.allowed_editors ?? []).includes(userId);
  const species = draft.species;
  const name = draft.nickname || species?.name || "Digimon";
  const normalizedSpeciesFields =
    species?.stage === "In-Training I" ? ["Unclassified"] : species?.fields;
  const sheetColor = digiRoleSheetColor(normalizedSpeciesFields, species?.digi_attribute);
  const attributeColor = digiRoleAttributeColor(species?.digi_attribute);
  const effectiveAttrs = attrsWithBonuses(
    draft.attrs,
    draft.attr_points ?? {},
    draft.bonuses ?? {},
  );
  const hpMax = digiRoleDigimonHpMax(species?.hp_base ?? 3, effectiveAttrs);
  const dsMax = digiRoleDigimonDsMax(effectiveAttrs, draft.stabilized_forms);
  const displayImage = draft.image_hidden ? null : draft.image_url || species?.image_url || null;
  const initiativePool =
    digiRoleInitiativePool(effectiveAttrs, draft.skills) + (draft.bonuses?.initiative ?? 0);
  const evasionPool = actionPool(
    draft.attrs,
    draft.attr_points ?? {},
    draft.bonuses ?? {},
    draft.skills,
    "dexterity",
    "Evasion",
    "evasion",
  );
  const clashPool = actionPool(
    draft.attrs,
    draft.attr_points ?? {},
    draft.bonuses ?? {},
    draft.skills,
    "strength",
    "Clash",
    "clash",
  );
  const defense = (effectiveAttrs.vitality ?? 0) + (draft.bonuses?.defense ?? 0);
  const resistance = (effectiveAttrs.wisdom ?? 0) + (draft.bonuses?.resistance ?? 0);
  const speciesTechniqueLinks = new Map(
    (speciesTechniqueQuery.data ?? []).map((link) => [link.technique_id, link]),
  );
  const signatureTechniqueIds = new Set(signatureTechniquesQuery.data ?? []);
  const displayedTechniques = dedupeDigiRoleTechniques(techniqueQuery.data ?? []);
  const genericLimit = genericTechniqueLimit(effectiveAttrs.wisdom ?? 0);
  const genericTechniqueCount = displayedTechniques.filter(
    (technique) => technique.learnedSource !== "signature",
  ).length;
  const learnedTechniqueIds = new Set((techniqueQuery.data ?? []).map((technique) => technique.id));
  const techniqueCatalogReady =
    !catalogQuery.isLoading &&
    !speciesTechniqueQuery.isLoading &&
    !signatureTechniquesQuery.isLoading;
  const availableTechniques = techniqueCatalogReady
    ? dedupeDigiRoleTechniques(
        (catalogQuery.data ?? [])
          .filter((technique) => !learnedTechniqueIds.has(technique.id))
          .filter((technique) =>
            techniqueIsAvailable(
              technique,
              species,
              draft.rank,
              speciesTechniqueLinks,
              signatureTechniqueIds,
            ),
          ),
      )
    : [];
  const inventoryTechniqueById = new Map(
    (inventoryTechniquesQuery.data ?? []).map((technique) => [technique.id, technique]),
  );
  const inventoryTechniqueEntries = (linkedTamerQuery.data?.inventory ?? [])
    .filter(
      (item) =>
        item.item_type === "technique" &&
        item.technique_id &&
        item.quantity > 0 &&
        !learnedTechniqueIds.has(item.technique_id),
    )
    .flatMap((item) => {
      const technique = inventoryTechniqueById.get(item.technique_id!);
      if (!technique) return [];
      if (
        catalogSearch.trim() &&
        !technique.name.toLocaleLowerCase("pt-BR").includes(catalogSearch.trim().toLocaleLowerCase("pt-BR"))
      ) {
        return [];
      }
      return [{ item, technique }];
    });

  async function patch(values: Partial<DigimonSheet>) {
    setDraft((current) => (current ? { ...current, ...values } : current));
    const clean = { ...values } as Record<string, unknown>;
    delete clean.species;
    const result = await table("digirole_digimons")
      .update(clean)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (result.error) toast.error(messageOf(result.error));
  }
  async function updateAttributePoints(attr_points: DigiRoleNumbers) {
    const current = draft;
    if (!current) return;
    const previous = Object.values(current.attr_points ?? {}).reduce(
      (total, value) => total + (Number(value) || 0),
      0,
    );
    const next = Object.values(attr_points).reduce(
      (total, value) => total + (Number(value) || 0),
      0,
    );
    const spent = next - previous;
    if (spent > (current.unspent_attr_points ?? 0)) {
      toast.error(`Faltam ${spent - (current.unspent_attr_points ?? 0)} pontos de atributo.`);
      return;
    }
    await patch({
      attr_points,
      unspent_attr_points: Math.max(0, (current.unspent_attr_points ?? 0) - spent),
    });
  }
  async function autofill() {
    if (!draft || !species) return;
    if (
      !confirm(
        `Preencher automaticamente a ficha de ${name}? Os pontos distribuídos, as perícias e as técnicas atuais serão substituídos.`,
      )
    )
      return;

    setAutoFilling(true);
    try {
      const budget = autofillBudgets(draft.rank);
      const attrPoints = randomDistribution(
        DIGIROLE_ATTRS.map((attr) => attr.id),
        budget.attrPoints,
        (key) => Math.max(0, 5 - (draft.attrs[key] ?? 1)),
      );
      const skillKeys = Object.values(DIGIROLE_SKILL_GROUPS)
        .flat()
        .filter((skill) => !skill.startsWith("Extra"));
      const randomizedSkills = randomDistribution(
        skillKeys,
        budget.skillPoints,
        () => budget.skillCap,
      );
      const skills = { ...defaultDigiRoleSkills(), ...randomizedSkills };
      const spentAttrs = Object.values(attrPoints).reduce((sum, value) => sum + value, 0);
      const spentSkills = Object.values(skills).reduce((sum, value) => sum + value, 0);
      const effective = attrsWithBonuses(draft.attrs, attrPoints, draft.bonuses ?? {});

      const [catalogResult, speciesLinks, signatureIds] = await Promise.all([
        table("digirole_techniques").select("*").order("name").limit(1200),
        fetchDigiRoleSpeciesTechniqueLinks(species.id),
        fetchDigiRoleSignatureTechniqueIds(),
      ]);
      if (catalogResult.error) throw catalogResult.error;
      const linkMap = new Map(speciesLinks.map((link) => [link.technique_id, link]));
      const signatureSet = new Set(signatureIds);
      const allowed = ((catalogResult.data ?? []) as Technique[]).filter((technique) =>
        techniqueIsAvailable(technique, species, draft.rank, linkMap, signatureSet),
      );
      const signatures = allowed.filter(
        (technique) => linkMap.get(technique.id)?.is_signature === true,
      );
      const signatureChosen = new Set(signatures.map((technique) => technique.id));
      const generic = shuffled(
        allowed.filter(
          (technique) => !signatureChosen.has(technique.id) && !signatureSet.has(technique.id),
        ),
      ).slice(0, genericTechniqueLimit(effective.wisdom ?? 0));
      const techniques = [
        ...new Map(
          [...signatures, ...generic].map((technique) => [technique.id, technique]),
        ).values(),
      ];

      const updated = await table("digirole_digimons")
        .update({
          attr_points: attrPoints,
          skills,
          unspent_attr_points: Math.max(0, budget.attrPoints - spentAttrs),
          unspent_skill_points: Math.max(0, budget.skillPoints - spentSkills),
          hp_current: digiRoleDigimonHpMax(species.hp_base, effective),
          ds_current: digiRoleDigimonDsMax(effective, draft.stabilized_forms),
        })
        .eq("id", id);
      if (updated.error) throw updated.error;

      const cleared = await table("digirole_digimon_techniques").delete().eq("digimon_id", id);
      if (cleared.error) throw cleared.error;
      if (techniques.length > 0) {
        const inserted = await table("digirole_digimon_techniques").insert(
          techniques.map((technique) => ({
            digimon_id: id,
            technique_id: technique.id,
            source: signatureChosen.has(technique.id) ? "signature" : "learned",
          })),
        );
        if (inserted.error) throw inserted.error;
      }

      await Promise.all([
        query.refetch(),
        techniqueQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["digirole-files", gameId] }),
        queryClient.invalidateQueries({ queryKey: ["digirole-roster"] }),
        queryClient.invalidateQueries({ queryKey: ["digirole-target-info", gameId] }),
        queryClient.invalidateQueries({
          queryKey: ["token-digirole-stats", "digirole_digimon", id],
        }),
      ]);
      toast.success("Ficha preenchida automaticamente.");
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setAutoFilling(false);
    }
  }
  async function remove() {
    if (!confirm("Excluir este Digimon?")) return;
    const result = await table("digirole_digimons").delete().eq("id", id);
    if (result.error) return toast.error(messageOf(result.error));
    void queryClient.invalidateQueries({ queryKey: ["digirole-files", gameId] });
    onDeleted();
  }
  async function duplicate() {
    const [sheetResult, techniquesResult, formsResult] = await Promise.all([
      table("digirole_digimons").select("*").eq("id", id).single(),
      table("digirole_digimon_techniques")
        .select("technique_id,source,created_at")
        .eq("digimon_id", id),
      table("digirole_forms").select("*").eq("digimon_id", id),
    ]);
    if (sheetResult.error || !sheetResult.data) {
      toast.error(messageOf(sheetResult.error ?? "Falha ao duplicar a ficha."));
      return;
    }
    if (techniquesResult.error || formsResult.error) {
      toast.error(messageOf(techniquesResult.error || formsResult.error));
      return;
    }

    const {
      id: _id,
      created_at: _createdAt,
      updated_at: _updatedAt,
      ...source
    } = sheetResult.data as Record<string, unknown>;
    void _id;
    void _createdAt;
    void _updatedAt;
    const inserted = await table("digirole_digimons")
      .insert({
        ...source,
        owner_id: userId,
        nickname: `${name} (cópia)`,
        tamer_id: null,
        team_slot: null,
        allowed_editors: [],
        allowed_viewers: [],
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) {
      toast.error(messageOf(inserted.error ?? "Falha ao duplicar a ficha."));
      return;
    }

    const copyId = (inserted.data as unknown as { id: string }).id;
    try {
      const techniques = (techniquesResult.data ?? []) as unknown as Array<{
        technique_id: string;
        source: string;
        created_at: string;
      }>;
      const forms = (formsResult.data ?? []) as unknown as Array<Record<string, unknown>>;
      if (techniques.length > 0) {
        const copiedTechniques = await table("digirole_digimon_techniques").upsert(
          techniques.map((technique) => ({ ...technique, digimon_id: copyId })),
          { onConflict: "digimon_id,technique_id" },
        );
        if (copiedTechniques.error) throw copiedTechniques.error;
      }
      if (forms.length > 0) {
        const copiedForms = await table("digirole_forms").upsert(
          forms.map(({ digimon_id: _digimonId, ...form }) => ({ ...form, digimon_id: copyId })),
          { onConflict: "digimon_id,species_id" },
        );
        if (copiedForms.error) throw copiedForms.error;
      }
    } catch (error) {
      await table("digirole_digimons").delete().eq("id", copyId);
      toast.error(messageOf(error));
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["digirole-files", gameId] }),
      queryClient.invalidateQueries({ queryKey: ["digirole-roster"] }),
    ]);
    toast.success("Ficha de Digimon duplicada.");
  }
  async function roll(
    label: string,
    pool: number,
    actionType?: "move" | "reaction" | "initiative",
  ): Promise<DigiRoleRoll | null> {
    try {
      return await sendDigiRoleRoll({
        gameId,
        userId,
        kind: "digirole_digimon",
        characterId: id,
        label,
        pool,
        actionType,
      });
    } catch (error) {
      toast.error(messageOf(error));
      return null;
    }
  }
  async function learn(technique: Technique, inventoryItem?: InventoryItem) {
    const source = inventoryItem
      ? "learned"
      : speciesTechniqueLinks.get(technique.id)?.is_signature
        ? "signature"
        : "learned";
    if (source !== "signature" && genericTechniqueCount >= genericLimit) {
      toast.error(`Limite de ${genericLimit} técnicas genéricas atingido (2 + Sabedoria).`);
      return;
    }
    const result = await table("digirole_digimon_techniques").upsert({
      digimon_id: id,
      technique_id: technique.id,
      source,
    });
    if (result.error) return toast.error(messageOf(result.error));
    if (inventoryItem && linkedTamerQuery.data) {
      const previousInventory = linkedTamerQuery.data.inventory;
      const nextInventory = previousInventory
        .map((item) =>
          item.technique_id === inventoryItem.technique_id
            ? { ...item, quantity: Math.max(0, item.quantity - 1) }
            : item,
        )
        .filter((item) => item.quantity > 0);
      const inventoryResult = await table("digirole_tamers")
        .update({ inventory: nextInventory })
        .eq("id", linkedTamerQuery.data.id);
      if (inventoryResult.error) {
        await table("digirole_digimon_techniques")
          .delete()
          .eq("digimon_id", id)
          .eq("technique_id", technique.id);
        toast.error(messageOf(inventoryResult.error));
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ["digirole-technique-inventory", draft.tamer_id],
      });
      await queryClient.invalidateQueries({ queryKey: ["digirole-tamer", draft.tamer_id] });
    }
    setCatalogOpen(false);
    void techniqueQuery.refetch();
  }
  async function unequip(technique: Technique) {
    if (!draft.tamer_id || !linkedTamerQuery.data) {
      toast.error("Vincule este Digimon a um Tamer para guardar a técnica no inventário.");
      return;
    }
    const previousInventory = linkedTamerQuery.data.inventory;
    const existingIndex = previousInventory.findIndex(
      (item) => item.item_type === "technique" && item.technique_id === technique.id,
    );
    const techniqueItem: InventoryItem = {
      name: technique.name,
      quantity: 1,
      description: `Técnica DigiRole · Grau ${technique.grade || "-"} · ${technique.field || "Neutra"}`,
      item_type: "technique",
      technique_id: technique.id,
      grade: technique.grade,
    };
    const nextInventory =
      existingIndex < 0
        ? [...previousInventory, techniqueItem]
        : previousInventory.map((item, index) =>
            index === existingIndex ? { ...item, quantity: item.quantity + 1 } : item,
          );
    const inventoryResult = await table("digirole_tamers")
      .update({ inventory: nextInventory })
      .eq("id", linkedTamerQuery.data.id);
    if (inventoryResult.error) return toast.error(messageOf(inventoryResult.error));
    const result = await table("digirole_digimon_techniques")
      .delete()
      .eq("digimon_id", id)
      .eq("technique_id", technique.id);
    if (result.error) {
      await table("digirole_tamers")
        .update({ inventory: previousInventory })
        .eq("id", linkedTamerQuery.data.id);
      return toast.error(messageOf(result.error));
    }
    await queryClient.invalidateQueries({
      queryKey: ["digirole-technique-inventory", draft.tamer_id],
    });
    await queryClient.invalidateQueries({ queryKey: ["digirole-tamer", draft.tamer_id] });
    toast.success(`${technique.name} foi guardada no inventário do Tamer.`);
    void techniqueQuery.refetch();
  }
  return (
    <div className="h-full overflow-y-auto bg-background">
      <section
        className="m-4 overflow-hidden rounded-xl border bg-card"
        style={{ borderColor: sheetColor }}
      >
        <div
          className="flex items-center gap-2 border-b-2 bg-card px-3 py-1.5"
          style={{ borderBottomColor: sheetColor }}
        >
          <span
            className="min-w-0 truncate text-[12px] font-bold uppercase tracking-wider"
            style={{ color: sheetColor }}
          >
            {name}
          </span>
          <span className="ml-auto text-[10px] font-bold uppercase text-muted-foreground">
            Rank
          </span>
          <Select
            value={draft.rank}
            disabled={!canEdit}
            onValueChange={(rank) => void patch({ rank })}
          >
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIGIROLE_STAGES.map((stage) => (
                <SelectItem key={stage} value={stage}>
                  {stage}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[10px]"
              disabled={autoFilling}
              title="Distribuir atributos e perícias e escolher técnicas válidas aleatoriamente"
              onClick={() => void autofill()}
            >
              <Dices className="mr-1 h-3.5 w-3.5" />
              {autoFilling ? "Preenchendo..." : "Preencher"}
            </Button>
          )}
        </div>

        <div className="grid gap-3 p-3 sm:grid-cols-[160px_1fr]">
          <div className="space-y-2">
            {displayImage ? (
              <img
                src={transparentDigiRoleImageUrl(displayImage) ?? displayImage}
                alt={name}
                className="h-40 w-40 rounded-lg bg-muted/30 object-contain"
              />
            ) : (
              <div className="grid h-40 w-40 place-items-center rounded-lg border border-dashed border-border bg-muted/20 text-2xl font-black text-muted-foreground">
                {name.slice(0, 2).toUpperCase()}
              </div>
            )}
            {canEdit && (
              <ImageSourceDialog
                canRemove={!!displayImage}
                onPick={(image_url) =>
                  void patch({ image_url: image_url || null, image_hidden: !image_url })
                }
                trigger={
                  <Button size="sm" variant="outline" className="w-full">
                    <ImagePlus className="mr-1 h-3.5 w-3.5" /> Imagem
                  </Button>
                }
              />
            )}
            <div className="flex flex-wrap gap-1">
              <Badge className="text-[10px] text-white" style={{ backgroundColor: attributeColor }}>
                {species?.digi_attribute || "None"}
              </Badge>
              {(normalizedSpeciesFields?.length ? normalizedSpeciesFields : ["Neutra"]).map((field) => (
                <Badge
                  key={field}
                  className="text-[10px] text-white"
                  style={{ backgroundColor: digiRoleFieldColor(field) }}
                >
                  {field}
                </Badge>
              ))}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {species?.name || "Espécie livre"}
            </p>
          </div>

          <div className="min-w-0 space-y-2">
            <div className="flex items-start gap-2">
              <Input
                value={draft.nickname ?? ""}
                placeholder={species?.name || "Nome do Digimon"}
                readOnly={!canEdit}
                onChange={(event) => void patch({ nickname: event.target.value || null })}
                className="h-9 min-w-0 flex-1 text-base font-bold"
              />
              {isNarrator && (
                <SheetPermissionsDialog
                  kind="digirole_digimon"
                  entityId={id}
                  gameId={gameId}
                  isNarrator={isNarrator}
                />
              )}
              {canEdit && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 shrink-0"
                  title="Duplicar ficha"
                  onClick={() => void duplicate()}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
              {canEdit && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 shrink-0"
                  title="Excluir ficha"
                  onClick={() => void remove()}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="rounded-md border border-border bg-background p-2">
                <span className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground">
                  <Heart className="h-3.5 w-3.5 text-emerald-500" /> HP
                </span>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={draft.hp_current}
                    readOnly={!canEdit}
                    onChange={(event) => void patch({ hp_current: asNumber(event.target.value) })}
                    className="h-8"
                  />
                  <span className="text-xs text-muted-foreground">
                    /{hpMax + (draft.bonuses?.hp ?? 0)}
                  </span>
                  <Input
                    title="Bônus de HP"
                    type="number"
                    value={draft.bonuses?.hp ?? 0}
                    readOnly={!canEdit}
                    onChange={(event) =>
                      void patch({
                        bonuses: { ...(draft.bonuses ?? {}), hp: asNumber(event.target.value) },
                      })
                    }
                    className="h-8 w-14"
                  />
                </div>
              </label>
              <label className="rounded-md border border-border bg-background p-2">
                <span className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-cyan-400" /> DS
                </span>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={draft.ds_current}
                    readOnly={!canEdit}
                    onChange={(event) => void patch({ ds_current: asNumber(event.target.value) })}
                    className="h-8"
                  />
                  <span className="text-xs text-muted-foreground">
                    /{dsMax + (draft.bonuses?.ds ?? 0)}
                  </span>
                  <Input
                    title="Bônus de DS"
                    type="number"
                    value={draft.bonuses?.ds ?? 0}
                    readOnly={!canEdit}
                    onChange={(event) =>
                      void patch({
                        bonuses: { ...(draft.bonuses ?? {}), ds: asNumber(event.target.value) },
                      })
                    }
                    className="h-8 w-14"
                  />
                </div>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">
                DEF {defense}
              </span>
              <span className="rounded-full bg-cyan-500/15 px-2.5 py-1 text-xs font-bold text-cyan-400">
                RES {resistance}
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
                {species?.species_type || "Sem tipo"}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => void roll(`${name} · Iniciativa`, initiativePool, "initiative")}
              >
                <Zap className="mr-1 h-3.5 w-3.5" /> Iniciativa · {initiativePool}d6
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => void roll(`${name} · Evasion`, evasionPool, "reaction")}
              >
                <Activity className="mr-1 h-3.5 w-3.5" /> Evasion · {evasionPool}d6
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => void roll(`${name} · Clash`, clashPool, "reaction")}
              >
                <Shield className="mr-1 h-3.5 w-3.5" /> Clash · {clashPool}d6
              </Button>
            </div>
          </div>
        </div>
      </section>
      <Conditions
        values={draft.conditions ?? []}
        canEdit={canEdit}
        onChange={(conditions) => void patch({ conditions })}
      />
      <RollBuilder
        name={name}
        attrs={effectiveAttrs}
        bonuses={{}}
        skills={draft.skills}
        onRoll={(label, pool) => void roll(label, pool)}
      />
      <AttributeGrid
        values={draft.attrs || species?.base_attrs || defaultDigiRoleAttrs()}
        points={draft.attr_points ?? {}}
        bonuses={draft.bonuses ?? {}}
        skills={draft.skills ?? {}}
        canEdit={canEdit}
        baseReadOnly={!!species}
        onChange={(attrs) => void patch({ attrs })}
        onPoints={(attr_points) => void updateAttributePoints(attr_points)}
        onBonuses={(bonuses) => void patch({ bonuses })}
      />
      <SkillGrid
        values={draft.skills || defaultDigiRoleSkills()}
        notoriety={draft.notoriety ?? {}}
        canEdit={canEdit}
        onChange={(skills) => void patch({ skills })}
        onNotoriety={(notoriety) => void patch({ notoriety })}
      />
      <section className="m-4 mt-0 rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-black uppercase text-muted-foreground">Técnicas</h3>
            <p className="text-[10px] text-muted-foreground">
              Genéricas {genericTechniqueCount}/{genericLimit} · limite 2 + Sabedoria
            </p>
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setCatalogOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
            </Button>
          )}
        </div>
        <div className="grid max-h-[38rem] gap-2 overflow-y-auto pr-2 [scrollbar-gutter:stable] sm:grid-cols-2">
          {displayedTechniques.map((technique: Technique) => {
            const accuracy = digiRoleFormulaPool(
              technique.accuracy_formula,
              effectiveAttrs,
              draft.skills,
            );
            const damage = technique.damage_formula
              ? digiRoleFormulaPool(technique.damage_formula, effectiveAttrs, draft.skills)
              : 0;
            return (
              <article
                key={technique.id}
                className="rounded-md border border-border p-3"
                style={{ borderLeftColor: digiRoleFieldColor(technique.field), borderLeftWidth: 3 }}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <h4 className="font-black">{technique.name}</h4>
                      <Badge
                        className="text-[9px] text-white"
                        style={{ backgroundColor: digiRoleFieldColor(technique.field) }}
                      >
                        {technique.field || "Neutra"}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {technique.learnedSource === "signature" ? "Assinatura" : "Genérica"} · Grau{" "}
                      {technique.grade || "-"} · {technique.category} · {technique.target} ·{" "}
                      {technique.ds_cost} DS
                    </p>
                  </div>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => void unequip(technique)}
                    >
                      Unequip
                    </Button>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {technique.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <DigiRoleTechniqueRollDialog
                    technique={technique}
                    gameId={gameId}
                    userId={userId}
                    digimonId={id}
                    digimonName={name}
                    imageUrl={
                      draft.image_hidden ? null : draft.image_url || species?.image_url || null
                    }
                    digiAttribute={species?.digi_attribute ?? "None"}
                    accuracyPool={accuracy}
                    damagePool={damage}
                    dsCurrent={draft.ds_current}
                    onDsChanged={(ds_current) =>
                      setDraft((current) => (current ? { ...current, ds_current } : current))
                    }
                  />
                </div>
              </article>
            );
          })}
          {!techniqueQuery.isLoading && displayedTechniques.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma técnica adicionada.</p>
          )}
        </div>
      </section>
      <section className="m-4 mt-0 rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-xs font-black uppercase text-muted-foreground">Progressão</h3>
        <DigiRoleTrainingPanel
          digimonId={id}
          rank={draft.rank}
          trainingSuccesses={draft.training_successes}
          retrainingSuccesses={draft.retraining_successes}
          canEdit={canEdit}
          onProgressed={() => query.refetch()}
        />
        <DigiRoleEvolutionPanel
          gameId={gameId}
          digimonId={id}
          currentSpeciesId={draft.species_id}
          currentSpeciesName={species?.name ?? name}
          rank={draft.rank}
          pe={draft.pe}
          evolutionText={species?.evolution_text ?? null}
          attrs={effectiveAttrs}
          skills={draft.skills}
          bond={draft.bond}
          battles={draft.battles}
          victories={draft.victories}
          trainingSuccesses={draft.training_successes}
          canEdit={canEdit}
          onUpdated={() => Promise.all([query.refetch(), techniqueQuery.refetch()])}
        />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {(
            [
              "bond",
              "pe",
              "battles",
              "victories",
              "training_successes",
              "stabilized_forms",
            ] as const
          ).map((field) => (
            <label key={field} className="text-[10px] font-bold uppercase text-muted-foreground">
              {field.replaceAll("_", " ")}
              <Input
                type="number"
                value={draft[field]}
                readOnly={!canEdit}
                onChange={(event) => void patch({ [field]: asNumber(event.target.value) })}
                className="mt-1 h-8 text-foreground"
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Pontos disponíveis: {draft.unspent_attr_points ?? 0} de Atributos ·{" "}
          {draft.unspent_skill_points ?? 0} de Perícias
          {draft.condensation_bonus ? ` · +${draft.condensation_bonus} da condensação` : ""}
        </p>
      </section>
      <EquipmentGrid
        values={draft.equipment ?? {}}
        kinds={[
          { id: "weapon", label: "Arma", damage: true },
          { id: "armorCore", label: "Armor Core" },
          { id: "armorBoard", label: "Armor Board" },
          { id: "attachments", label: "Attachments" },
          { id: "accessories", label: "Acessórios" },
        ]}
        canEdit={canEdit}
        onChange={(equipment) => void patch({ equipment })}
      />
      <section className="m-4 mt-0 rounded-xl border border-border bg-card p-4">
        <Label>Anotações</Label>
        <Textarea
          value={draft.notes ?? ""}
          readOnly={!canEdit}
          onChange={(event) => void patch({ notes: event.target.value })}
          className="mt-2 min-h-32"
        />
      </section>

      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className="grid h-[min(85vh,46rem)] max-w-2xl grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Adicionar técnica</DialogTitle>
          </DialogHeader>
          <Input
            value={catalogSearch}
            onChange={(event) => setCatalogSearch(event.target.value)}
            placeholder="Procurar técnicas..."
            autoFocus
          />
          <div className="min-h-0 space-y-4 overflow-y-scroll pr-2 [scrollbar-gutter:stable]">
            {!techniqueCatalogReady && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Conferindo graus e assinaturas...
              </p>
            )}
            <section>
              <h3 className="mb-2 text-xs font-black uppercase text-muted-foreground">
                Técnicas no inventário
              </h3>
              {TECHNIQUE_GRADES.map((grade) => {
                const entries = inventoryTechniqueEntries.filter(
                  ({ technique }) => technique.grade.trim().toUpperCase() === grade,
                );
                if (entries.length === 0) return null;
                return (
                  <div key={grade} className="mb-3 space-y-1">
                    <h4 className="text-[10px] font-black uppercase text-muted-foreground">
                      Grau {grade}
                    </h4>
                    {entries.map(({ item, technique }) => (
                      <button
                        key={technique.id}
                        type="button"
                        disabled={genericTechniqueCount >= genericLimit}
                        onClick={() => void learn(technique, item)}
                        className="flex w-full items-center gap-2 rounded border border-border px-3 py-2 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
                        style={{
                          borderLeftColor: digiRoleFieldColor(technique.field),
                          borderLeftWidth: 3,
                        }}
                      >
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-xs">{technique.name}</strong>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {item.quantity} no inventário · {technique.field} · {technique.category}
                            {genericTechniqueCount >= genericLimit ? " · limite atingido" : ""}
                          </span>
                        </span>
                        <Plus className="h-4 w-4" />
                      </button>
                    ))}
                  </div>
                );
              })}
              {!linkedTamerQuery.isLoading && inventoryTechniqueEntries.length === 0 && (
                <p className="text-[10px] text-muted-foreground">
                  Nenhuma técnica disponível no inventário do Tamer.
                </p>
              )}
            </section>
            <section>
              <h3 className="mb-2 text-xs font-black uppercase text-muted-foreground">
                Técnicas aprendíveis
              </h3>
              {TECHNIQUE_GRADES.map((grade) => {
                const techniques = availableTechniques.filter(
                  (technique) => technique.grade.trim().toUpperCase() === grade,
                );
                if (techniques.length === 0) return null;
                return (
                  <div key={grade} className="mb-3 space-y-1">
                    <h4 className="text-[10px] font-black uppercase text-muted-foreground">
                      Grau {grade}
                    </h4>
                    {techniques.map((technique) => {
                      const signature =
                        speciesTechniqueLinks.get(technique.id)?.is_signature === true;
                      const genericBlocked = !signature && genericTechniqueCount >= genericLimit;
                      return (
                        <button
                          key={technique.id}
                          type="button"
                          disabled={genericBlocked}
                          onClick={() => void learn(technique)}
                          className="flex w-full items-center gap-2 rounded border border-border px-3 py-2 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
                          style={{
                            borderLeftColor: digiRoleFieldColor(technique.field),
                            borderLeftWidth: 3,
                          }}
                        >
                          <span className="min-w-0 flex-1">
                            <strong className="block truncate text-xs">{technique.name}</strong>
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {signature ? "Assinatura" : "Genérica"} · Grau {technique.grade || "-"} ·{" "}
                              {technique.field} · {technique.category}
                              {genericBlocked ? " · limite atingido" : ""}
                            </span>
                          </span>
                          <Plus className="h-4 w-4" />
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatalogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
