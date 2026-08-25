export type LancerEntityKind = "pilot" | "mech" | "npc" | "object" | "deployable";

export type LancerSourceType = "core" | "lcp" | "homebrew" | "campaign";

export type LancerContentType =
  | "frame"
  | "weapon"
  | "system"
  | "pilot_gear"
  | "pilot_armor"
  | "talent"
  | "license"
  | "core_bonus"
  | "manufacturer"
  | "npc_class"
  | "npc_template"
  | "npc_feature"
  | "status"
  | "condition"
  | "tag"
  | "action"
  | "reserve"
  | "sitreps"
  | "other";

export type LancerContentPack = {
  id: string;
  game_id: string;
  package_key: string;
  name: string;
  author: string | null;
  version: string;
  description: string | null;
  manifest: Record<string, unknown>;
  enabled: boolean;
  imported_by: string;
  created_at: string;
  updated_at: string;
};

export type LancerCompendiumItem = {
  id: string;
  game_id: string | null;
  pack_id: string | null;
  item_type: LancerContentType;
  external_id: string;
  name: string;
  description: string | null;
  source_type: LancerSourceType;
  source_name: string | null;
  data: Record<string, unknown>;
  action_definitions: LancerGameActionDefinition[];
  effect_definitions: LancerEffectDefinition[];
  trigger_definitions: LancerTriggerDefinition[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type LancerEffectDefinition = {
  id: string;
  kind: "stat_bonus" | "resource" | "action" | "reaction" | "passive" | "custom";
  target?: string | null;
  value?: number | string | null;
  condition?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
};

export type LancerTriggerDefinition = {
  id: string;
  event: string;
  optional: boolean;
  effects: LancerEffectDefinition[];
  frequency?: "turn" | "round" | "scene" | "mission" | null;
};

export type LancerValueBreakdown = {
  label: string;
  value: number;
  sourceType: LancerSourceType;
  sourceId?: string | null;
};

export type LancerResourceState = {
  current: number;
  max: number;
};

export type LancerConditionState = {
  id: string;
  name: string;
  sourceId?: string | null;
  duration?: "turn" | "round" | "scene" | "mission" | "permanent" | null;
  remainingDuration?: number | null;
  effects?: Record<string, unknown>[];
};

export type LancerEquipmentState = {
  instanceId: string;
  compendiumItemId: string | null;
  sourceType: LancerSourceType;
  name: string;
  state: {
    loaded?: boolean;
    charges?: number;
    uses?: number;
    destroyed?: boolean;
    disabled?: boolean;
    active?: boolean;
    cooldown?: number;
    frequencyUsed?: number;
    roundUsed?: number;
    missionUsed?: number;
  };
};

export type LancerCanonicalState = {
  schemaVersion: 1;
  kind: LancerEntityKind;
  resources: {
    hp?: LancerResourceState;
    heat?: LancerResourceState;
    structure?: LancerResourceState;
    stress?: LancerResourceState;
    repairs?: LancerResourceState;
    corePower?: LancerResourceState;
    [key: string]: LancerResourceState | undefined;
  };
  stats: Record<string, number | null>;
  statBreakdowns: Record<string, LancerValueBreakdown[]>;
  conditions: LancerConditionState[];
  statuses: LancerConditionState[];
  equipment: LancerEquipmentState[];
  actionIds: string[];
  reactionIds: string[];
  notes: string;
  metadata: Record<string, unknown>;
};

export type LancerBuildState = {
  schemaVersion: 1;
  status: "draft" | "valid" | "invalid";
  frameId: string | null;
  pilotId: string | null;
  licenseLevel: number;
  mechSkills: {
    hull: number;
    agility: number;
    systems: number;
    engineering: number;
  };
  licenses: { id: string; rank: number }[];
  talents: { id: string; rank: number }[];
  coreBonusIds: string[];
  weaponIds: string[];
  systemIds: string[];
  gearIds?: string[];
  armorIds?: string[];
  reserveIds?: string[];
  background?: string;
  triggerValues?: Record<string, number>;
  mountSelections?: { mountId: string; mountType: string; weaponIds: string[] }[];
  validation: {
    valid: boolean;
    errors: { code: string; message: string; sourceId?: string | null }[];
  };
};

export type LancerEntity = {
  id: string;
  game_id: string;
  owner_id: string | null;
  entity_type: LancerEntityKind;
  name: string;
  callsign: string | null;
  source_type: LancerSourceType;
  source_id: string | null;
  current_state: LancerCanonicalState;
  build_state: LancerBuildState;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type LancerCampaign = {
  game_id: string;
  rules_version: string;
  auto_apply_damage: boolean;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type LancerGameEvent = {
  id: number;
  game_id: string;
  entity_id: string | null;
  actor_user_id: string;
  transaction_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type LancerHexMap = {
  id: string;
  game_id: string;
  name: string;
  is_active: boolean;
  hex_size: number;
  q_min: number;
  q_max: number;
  r_min: number;
  r_max: number;
  background_url: string | null;
  background_settings: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type LancerMapHex = {
  map_id: string;
  q: number;
  r: number;
  terrain_type: "normal" | "difficult" | "dangerous" | "obstruction" | "cover" | "custom";
  movement_cost: number;
  blocks_movement: boolean;
  blocks_los: boolean;
  cover: 0 | 1 | 2;
  data: Record<string, unknown>;
  updated_at: string;
};

export type LancerMapToken = {
  id: string;
  map_id: string;
  entity_id: string;
  q: number;
  r: number;
  rotation: number;
  hidden: boolean;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type LancerCombatSession = {
  id: string;
  game_id: string;
  map_id: string | null;
  status: "setup" | "active" | "complete";
  round: number;
  current_side: "player" | "hostile";
  active_participant_id: string | null;
  settings: Record<string, unknown>;
  created_by: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LancerCombatParticipant = {
  id: string;
  session_id: string;
  entity_id: string;
  token_id: string | null;
  side: "player" | "hostile";
  has_activated: boolean;
  defeated: boolean;
  action_economy: {
    quickActionsRemaining: 0 | 1 | 2;
    standardMoveAvailable: boolean;
    reactionAvailable: boolean;
    overchargeAvailable: boolean;
    overchargeCount: number;
    usedActionIds: string[];
  };
  joined_at: string;
  updated_at: string;
};

export type LancerPendingCombatEffect = {
  id: string;
  session_id: string;
  game_id: string;
  source_entity_id: string;
  target_entity_id: string;
  transaction_id: string;
  effect_kind: "manual_damage" | "optional_effect";
  payload: Record<string, unknown>;
  proposed_state: LancerCanonicalState | null;
  expected_revision: number;
  status: "pending" | "applied" | "rejected" | "expired";
  created_by: string;
  resolved_by: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type LancerNpcBlueprint = {
  id: string;
  game_id: string;
  name: string;
  class_item_id: string;
  tier: 1 | 2 | 3;
  template_item_ids: string[];
  optional_feature_item_ids: string[];
  canonical_state: LancerCanonicalState;
  action_ids: string[];
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type LancerEncounterRosterEntry = {
  blueprintId: string;
  count: number;
  reserve?: boolean;
  reinforcementRound?: number | null;
};

export type LancerDeploymentHex = { q: number; r: number };

export type LancerEncounterObjective = {
  type: "elimination" | "control" | "escort" | "extraction" | "survival" | "custom";
  name: string;
  description: string;
  roundLimit: number | null;
  victoryCondition: string;
  defeatCondition: string;
  scoreTarget: number | null;
  triggers: Record<string, unknown>[];
};

export type LancerEncounter = {
  id: string;
  game_id: string;
  name: string;
  map_id: string;
  sitrep_item_id: string | null;
  objective: LancerEncounterObjective;
  enemy_roster: LancerEncounterRosterEntry[];
  reserves: Record<string, unknown>[];
  reinforcements: Record<string, unknown>[];
  deployment: {
    player: LancerDeploymentHex[];
    enemy: LancerDeploymentHex[];
    reserve: LancerDeploymentHex[];
  };
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type LancerEncounterInstance = {
  id: string;
  encounter_id: string;
  game_id: string;
  map_id: string;
  combat_session_id: string | null;
  status: "setup" | "active" | "victory" | "defeat" | "complete";
  round: number;
  template_snapshot: Record<string, unknown>;
  objective_state: {
    playerScore: number;
    hostileScore: number;
    completed: boolean;
    outcome?: "victory" | "defeat" | null;
    notes?: string;
  };
  spawned_entity_ids: string[];
  started_by: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LancerCombatTransaction = {
  id: string;
  game_id: string;
  actor_user_id: string;
  action_type: string;
  action_payload: Record<string, unknown>;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  generated_events: Record<string, unknown>[];
  reversed_by: string | null;
  created_at: string;
};

export type LancerStateChange = {
  path: string;
  previousValue: unknown;
  nextValue: unknown;
  sourceId?: string | null;
};

export type LancerGeneratedEvent = {
  type: string;
  entityId?: string | null;
  payload: Record<string, unknown>;
};

export type LancerResolution<T> = {
  result: T;
  breakdown: { label: string; value: number | string; source?: string }[];
  stateChanges: LancerStateChange[];
  events: LancerGeneratedEvent[];
};

export type LancerGameActionDefinition = {
  id: string;
  name: string;
  sourceId: string;
  activation: "protocol" | "quick" | "full" | "reaction" | "free" | "other";
  attackType?: "melee" | "ranged" | "tech" | null;
  targetType: string;
  range: { type: string; value: number }[];
  roll?: string | null;
  damage: { type: string; expression: string }[];
  effects: Record<string, unknown>[];
  resourceCosts: Record<string, number>;
  triggers: string[];
  frequency?: "turn" | "round" | "scene" | "mission" | null;
};
