import type { EngineEvent, EngineSession } from "@/lib/game-engine/types";
import type {
  LancerCampaign,
  LancerCombatParticipant,
  LancerCombatSession,
  LancerCombatTransaction,
  LancerCompendiumItem,
  LancerContentPack,
  LancerEncounter,
  LancerEncounterInstance,
  LancerEntity,
  LancerGameEvent,
  LancerHexMap,
  LancerMapHex,
  LancerMapToken,
  LancerNpcBlueprint,
  LancerPendingCombatEffect,
} from "@/lib/lancer/types";
import type { Database as GeneratedDatabase, Json } from "./types";

type Table<
  Row,
  Insert = Partial<Row>,
  Update = Partial<Row>,
  Relationships extends readonly unknown[] = [],
> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Relationships;
};

type T20CharacterRow = {
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
  attributes: Json;
  skills: Json;
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
  folder: string | null;
  allowed_viewers: string[];
  allowed_editors: string[];
  row_version: number;
  created_at: string;
};

type T20PowerRow = {
  id: string;
  game_id: string | null;
  name: string;
  category: string | null;
  cost: string | null;
  prerequisite: string | null;
  effect: string;
  source: string | null;
  created_by: string | null;
  created_at: string;
};

type T20SpellRow = {
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
  created_by: string | null;
  created_at: string;
};

type T20CharacterPowerRow = {
  character_id: string;
  power_id: string;
  notes: string | null;
  created_at: string;
};

type T20CharacterSpellRow = {
  character_id: string;
  spell_id: string;
  notes: string | null;
  prepared: boolean;
  created_at: string;
};

type DigiRoleSpeciesRow = {
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
  base_attrs: Json;
  signature_technique: string | null;
  evolution_text: string | null;
  image_url: string | null;
  source_page: number | null;
  created_at: string;
  updated_at: string;
};

type DigiRoleTechniqueRow = {
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
  source_page: number | null;
};

type DigiRoleTamerRow = {
  id: string;
  game_id: string;
  owner_id: string;
  name: string;
  image_url: string | null;
  folder: string | null;
  age: number;
  rank: string;
  attrs: Json;
  skills: Json;
  notoriety: Json;
  hp_current: number;
  ds_current: number;
  condensed_count: number;
  conditions: string[];
  inventory: Json;
  achievements: Json;
  notes: string | null;
  allowed_viewers: string[];
  allowed_editors: string[];
  created_at: string;
  updated_at: string;
};

type DigiRoleDigimonRow = {
  id: string;
  game_id: string;
  owner_id: string;
  tamer_id: string | null;
  species_id: string | null;
  nickname: string | null;
  image_url: string | null;
  folder: string | null;
  rank: string;
  attrs: Json;
  skills: Json;
  hp_current: number;
  ds_current: number;
  bond: number;
  pe: number;
  battles: number;
  victories: number;
  training_successes: number;
  stabilized_forms: number;
  conditions: string[];
  evolution_state: Json;
  notes: string | null;
  allowed_viewers: string[];
  allowed_editors: string[];
  last_training_on: string | null;
  retraining_successes: number;
  unspent_attr_points: number;
  unspent_skill_points: number;
  condensation_bonus: number;
  created_at: string;
  updated_at: string;
};

type DigiRoleDigimonTechniqueRow = {
  digimon_id: string;
  technique_id: string;
  source: string;
  created_at: string;
};

type DigiRoleScanDataRow = {
  tamer_id: string;
  species_id: string;
  percentage: number;
  scanned_subject_ids: string[];
  updated_at: string;
};

type DigiRoleFormRow = {
  digimon_id: string;
  species_id: string;
  stabilized: boolean;
  victories: number;
  requirements_confirmed: boolean;
  unlocked_at: string;
  stabilized_at: string | null;
  notes: string | null;
};

type LancerEntityPermissionRow = {
  entity_id: string;
  user_id: string;
  can_view: boolean;
  can_edit: boolean;
  can_control: boolean;
  created_at: string;
  updated_at: string;
};

type LancerCompendiumFavoriteRow = {
  item_id: string;
  user_id: string;
  created_at: string;
};

type LancerEncounterZoneRow = {
  id: string;
  encounter_id: string;
  zone_type: "player_deployment" | "enemy_deployment" | "reserve" | "objective";
  name: string;
  hexes: Json;
  color: string;
  visible: boolean;
  data: Json;
  created_at: string;
  updated_at: string;
};

type LancerManualOverrideRow = {
  id: string;
  game_id: string;
  entity_id: string;
  transaction_id: string;
  reason: string | null;
  created_by: string;
  created_at: string;
};

type AdditionalTables = {
  game_engine_sessions: Table<EngineSession>;
  game_engine_events: Table<EngineEvent>;
  t20_characters: Table<T20CharacterRow>;
  t20_powers: Table<T20PowerRow>;
  t20_spells: Table<T20SpellRow>;
  t20_character_powers: Table<
    T20CharacterPowerRow,
    Partial<T20CharacterPowerRow>,
    Partial<T20CharacterPowerRow>,
    [
      {
        foreignKeyName: "t20_character_powers_character_id_fkey";
        columns: ["character_id"];
        isOneToOne: false;
        referencedRelation: "t20_characters";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "t20_character_powers_power_id_fkey";
        columns: ["power_id"];
        isOneToOne: false;
        referencedRelation: "t20_powers";
        referencedColumns: ["id"];
      },
    ]
  >;
  t20_character_spells: Table<
    T20CharacterSpellRow,
    Partial<T20CharacterSpellRow>,
    Partial<T20CharacterSpellRow>,
    [
      {
        foreignKeyName: "t20_character_spells_character_id_fkey";
        columns: ["character_id"];
        isOneToOne: false;
        referencedRelation: "t20_characters";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "t20_character_spells_spell_id_fkey";
        columns: ["spell_id"];
        isOneToOne: false;
        referencedRelation: "t20_spells";
        referencedColumns: ["id"];
      },
    ]
  >;
  digirole_species: Table<DigiRoleSpeciesRow>;
  digirole_techniques: Table<DigiRoleTechniqueRow>;
  digirole_tamers: Table<DigiRoleTamerRow>;
  digirole_digimons: Table<DigiRoleDigimonRow>;
  digirole_digimon_techniques: Table<DigiRoleDigimonTechniqueRow>;
  digirole_scan_data: Table<DigiRoleScanDataRow>;
  digirole_forms: Table<DigiRoleFormRow>;
  lancer_campaigns: Table<LancerCampaign>;
  lancer_entities: Table<LancerEntity>;
  lancer_entity_permissions: Table<LancerEntityPermissionRow>;
  lancer_combat_transactions: Table<LancerCombatTransaction>;
  lancer_game_events: Table<LancerGameEvent>;
  lancer_content_packs: Table<LancerContentPack>;
  lancer_compendium_items: Table<LancerCompendiumItem>;
  lancer_compendium_favorites: Table<LancerCompendiumFavoriteRow>;
  lancer_maps: Table<LancerHexMap>;
  lancer_map_hexes: Table<LancerMapHex>;
  lancer_map_tokens: Table<LancerMapToken>;
  lancer_combat_sessions: Table<LancerCombatSession>;
  lancer_combat_participants: Table<LancerCombatParticipant>;
  lancer_pending_combat_effects: Table<LancerPendingCombatEffect>;
  lancer_npc_blueprints: Table<LancerNpcBlueprint>;
  lancer_encounters: Table<LancerEncounter>;
  lancer_encounter_instances: Table<LancerEncounterInstance>;
  lancer_encounter_zones: Table<LancerEncounterZoneRow>;
  lancer_manual_overrides: Table<LancerManualOverrideRow>;
};

type CombatTargetRow = {
  token_id: string;
  character_id: string;
  character_kind: "pokemon" | "trainer";
  target_name: string;
  token_owner_id: string;
  character_owner_id: string;
  allowed_editors: string[];
  vitality: number;
  insight: number;
  target_types: string[];
  clash_pool: number;
  evade_pool: number;
  current_hp: number;
  max_hp: number;
};

type ChatMessageRow = GeneratedDatabase["public"]["Tables"]["chat_messages"]["Row"];
type UnknownArgs = Record<string, unknown>;

type AdditionalFunctions = {
  assign_pokemon_to_trainer: {
    Args: { p_pokemon_id: string; p_trainer_id: string; p_team_slot?: number | null };
    Returns: undefined;
  };
  set_character_folder: {
    Args: { p_kind: string; p_character_id: string; p_folder: string | null };
    Returns: undefined;
  };
  create_token_from_character: {
    Args: {
      p_game_id: string;
      p_page_id: string;
      p_character_kind: string;
      p_character_id: string;
      p_label: string;
      p_image_url: string | null;
      p_x: number;
      p_y: number;
    };
    Returns: string;
  };
  get_move_target_info: {
    Args: { p_game_id: string; p_page_id: string };
    Returns: CombatTargetRow[];
  };
  submit_pokerole_move_reaction: {
    Args: { p_game_id: string; p_source_message_id: string; p_response: Record<string, unknown> };
    Returns: ChatMessageRow;
  };
  finalize_pokerole_move: {
    Args: { p_game_id: string; p_source_message_id: string };
    Returns: ChatMessageRow;
  };
  record_digirole_scan: { Args: UnknownArgs; Returns: Json };
  condense_digirole: { Args: UnknownArgs; Returns: Json };
  record_digirole_training: { Args: UnknownArgs; Returns: Json };
  use_digirole_technique: { Args: UnknownArgs; Returns: Json };
  unlock_digirole_form: { Args: UnknownArgs; Returns: Json };
  transform_digirole_form: { Args: UnknownArgs; Returns: Json };
  record_digirole_form_victory: { Args: UnknownArgs; Returns: Json };
  start_game_engine_session: {
    Args: {
      p_game_id: string;
      p_page_id: string | null;
      p_system_id: string;
      p_state: EngineSession["state"];
    };
    Returns: EngineSession;
  };
  commit_game_engine_state: {
    Args: {
      p_session_id: string;
      p_expected_version: number;
      p_command: string;
      p_payload: Record<string, unknown>;
      p_next_state: EngineSession["state"];
    };
    Returns: EngineSession;
  };
  commit_game_engine_command: {
    Args: {
      p_session_id: string;
      p_expected_version: number;
      p_command: string;
      p_payload: Record<string, unknown>;
    };
    Returns: EngineSession;
  };
  can_control_lancer_entity: { Args: { p_entity_id: string; p_user_id: string }; Returns: boolean };
  import_lancer_content_pack: { Args: UnknownArgs; Returns: LancerContentPack };
  create_lancer_entity: { Args: UnknownArgs; Returns: LancerEntity };
  commit_lancer_entity_build: { Args: UnknownArgs; Returns: LancerEntity };
  record_lancer_roll: { Args: UnknownArgs; Returns: LancerCombatTransaction };
  place_lancer_token: { Args: UnknownArgs; Returns: LancerMapToken };
  move_lancer_token: { Args: UnknownArgs; Returns: LancerMapToken };
  paint_lancer_hex: { Args: UnknownArgs; Returns: LancerMapHex };
  start_lancer_combat: { Args: UnknownArgs; Returns: LancerCombatSession };
  activate_lancer_participant: { Args: UnknownArgs; Returns: LancerCombatSession };
  end_lancer_turn: { Args: UnknownArgs; Returns: LancerCombatSession };
  end_lancer_combat: { Args: UnknownArgs; Returns: LancerCombatSession };
  commit_lancer_attack: { Args: UnknownArgs; Returns: LancerEntity };
  resolve_lancer_pending_combat_effect: { Args: UnknownArgs; Returns: LancerPendingCombatEffect };
  start_lancer_encounter: { Args: UnknownArgs; Returns: LancerEncounterInstance };
  gm_override_lancer_entity: { Args: UnknownArgs; Returns: LancerEntity };
  undo_lancer_transaction: { Args: UnknownArgs; Returns: LancerCombatTransaction };
  gm_set_lancer_token_hidden: { Args: UnknownArgs; Returns: LancerMapToken };
  gm_advance_lancer_round: { Args: UnknownArgs; Returns: LancerCombatSession };
  gm_finish_lancer_encounter: { Args: UnknownArgs; Returns: LancerEncounterInstance };
};

type GeneratedPublic = GeneratedDatabase["public"];
type GeneratedTables = GeneratedPublic["Tables"];

type VersionedTable<
  T extends { Row: object; Insert: object; Update: object; Relationships: readonly unknown[] },
> = {
  Row: T["Row"] & { row_version: number };
  Insert: T["Insert"] & { row_version?: number };
  Update: T["Update"] & { row_version?: number };
  Relationships: T["Relationships"];
};

type TableOverrides = {
  pokemon: VersionedTable<GeneratedTables["pokemon"]>;
  trainers: VersionedTable<GeneratedTables["trainers"]>;
};

export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedPublic, "Tables" | "Functions"> & {
    Tables: Omit<GeneratedTables, keyof TableOverrides> & TableOverrides & AdditionalTables;
    Functions: GeneratedPublic["Functions"] & AdditionalFunctions;
  };
};

export type AppTableName = keyof Database["public"]["Tables"];
