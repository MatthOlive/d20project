export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abilities: {
        Row: {
          effect: string
          id: string
          name: string
        }
        Insert: {
          effect?: string
          id?: string
          name: string
        }
        Update: {
          effect?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          body: string
          created_at: string
          game_id: string
          id: string
          kind: string
          roll_data: Json | null
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          game_id: string
          id?: string
          kind?: string
          roll_data?: Json | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          game_id?: string
          id?: string
          kind?: string
          roll_data?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_members: {
        Row: {
          game_id: string
          joined_at: string
          role: Database["public"]["Enums"]["game_role"]
          user_id: string
        }
        Insert: {
          game_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["game_role"]
          user_id: string
        }
        Update: {
          game_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["game_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_members_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          background_url: string | null
          created_at: string
          id: string
          invite_code: string
          language: string
          name: string
          narrator_id: string
          narrator_type: string
        }
        Insert: {
          background_url?: string | null
          created_at?: string
          id?: string
          invite_code?: string
          language?: string
          name: string
          narrator_id: string
          narrator_type?: string
        }
        Update: {
          background_url?: string | null
          created_at?: string
          id?: string
          invite_code?: string
          language?: string
          name?: string
          narrator_id?: string
          narrator_type?: string
        }
        Relationships: []
      }
      initiative: {
        Row: {
          character_kind: string
          character_name: string
          character_ref: string | null
          created_at: string
          game_id: string
          id: string
          position: number
          successes: number
        }
        Insert: {
          character_kind?: string
          character_name: string
          character_ref?: string | null
          created_at?: string
          game_id: string
          id?: string
          position?: number
          successes?: number
        }
        Update: {
          character_kind?: string
          character_name?: string
          character_ref?: string | null
          created_at?: string
          game_id?: string
          id?: string
          position?: number
          successes?: number
        }
        Relationships: [
          {
            foreignKeyName: "initiative_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          embedding: string
          id: string
          source: string
        }
        Insert: {
          chunk_index?: number
          content: string
          created_at?: string
          embedding: string
          id?: string
          source?: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string
          id?: string
          source?: string
        }
        Relationships: []
      }
      moves: {
        Row: {
          accuracy_skill: string | null
          accuracy_stat: string | null
          category: string
          damage_stat: string | null
          effect: string
          id: string
          name: string
          power: number
          target: string
          type: Database["public"]["Enums"]["pokemon_type"]
        }
        Insert: {
          accuracy_skill?: string | null
          accuracy_stat?: string | null
          category?: string
          damage_stat?: string | null
          effect?: string
          id?: string
          name: string
          power?: number
          target?: string
          type: Database["public"]["Enums"]["pokemon_type"]
        }
        Update: {
          accuracy_skill?: string | null
          accuracy_stat?: string | null
          category?: string
          damage_stat?: string | null
          effect?: string
          id?: string
          name?: string
          power?: number
          target?: string
          type?: Database["public"]["Enums"]["pokemon_type"]
        }
        Relationships: []
      }
      natures: {
        Row: {
          confidence: number
          description: string
          id: string
          keywords: string
          name: string
          sort_order: number
        }
        Insert: {
          confidence?: number
          description?: string
          id?: string
          keywords?: string
          name: string
          sort_order?: number
        }
        Update: {
          confidence?: number
          description?: string
          id?: string
          keywords?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      pokemon: {
        Row: {
          ai_scene_id: string | null
          ai_spawned: boolean
          battles: number
          confidence: number
          created_at: string
          current_attrs: Json
          current_hp: number | null
          current_will: number | null
          folder: string | null
          game_id: string
          happiness: number
          held_item: string | null
          hp: number
          id: string
          image_url: string | null
          loyalty: number
          modifiers: Json
          nature: string | null
          nickname: string | null
          notes: string
          owner_id: string
          rank: Database["public"]["Enums"]["pokerole_rank"]
          skills: Json
          social_attrs: Json
          species_id: string
          status: string[]
          victories: number
          will: number
        }
        Insert: {
          ai_scene_id?: string | null
          ai_spawned?: boolean
          battles?: number
          confidence?: number
          created_at?: string
          current_attrs?: Json
          current_hp?: number | null
          current_will?: number | null
          folder?: string | null
          game_id: string
          happiness?: number
          held_item?: string | null
          hp?: number
          id?: string
          image_url?: string | null
          loyalty?: number
          modifiers?: Json
          nature?: string | null
          nickname?: string | null
          notes?: string
          owner_id: string
          rank?: Database["public"]["Enums"]["pokerole_rank"]
          skills?: Json
          social_attrs?: Json
          species_id: string
          status?: string[]
          victories?: number
          will?: number
        }
        Update: {
          ai_scene_id?: string | null
          ai_spawned?: boolean
          battles?: number
          confidence?: number
          created_at?: string
          current_attrs?: Json
          current_hp?: number | null
          current_will?: number | null
          folder?: string | null
          game_id?: string
          happiness?: number
          held_item?: string | null
          hp?: number
          id?: string
          image_url?: string | null
          loyalty?: number
          modifiers?: Json
          nature?: string | null
          nickname?: string | null
          notes?: string
          owner_id?: string
          rank?: Database["public"]["Enums"]["pokerole_rank"]
          skills?: Json
          social_attrs?: Json
          species_id?: string
          status?: string[]
          victories?: number
          will?: number
        }
        Relationships: [
          {
            foreignKeyName: "pokemon_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pokemon_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      pokemon_moves: {
        Row: {
          move_id: string
          pokemon_id: string
        }
        Insert: {
          move_id: string
          pokemon_id: string
        }
        Update: {
          move_id?: string
          pokemon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pokemon_moves_move_id_fkey"
            columns: ["move_id"]
            isOneToOne: false
            referencedRelation: "moves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pokemon_moves_pokemon_id_fkey"
            columns: ["pokemon_id"]
            isOneToOne: false
            referencedRelation: "pokemon"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          theme: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          theme?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          theme?: string
        }
        Relationships: []
      }
      scenarios: {
        Row: {
          background_url: string | null
          created_at: string
          game_id: string
          id: string
          name: string
          notes: string
        }
        Insert: {
          background_url?: string | null
          created_at?: string
          game_id: string
          id?: string
          name?: string
          notes?: string
        }
        Update: {
          background_url?: string | null
          created_at?: string
          game_id?: string
          id?: string
          name?: string
          notes?: string
        }
        Relationships: []
      }
      species: {
        Row: {
          abilities: string[]
          attr_limits: Json
          base_attrs: Json
          base_hp: number
          dex_number: number | null
          evolutions: string[]
          hidden_ability: string | null
          id: string
          name: string
          sprite_url: string | null
          suggested_rank: Database["public"]["Enums"]["pokerole_rank"] | null
          types: Database["public"]["Enums"]["pokemon_type"][]
        }
        Insert: {
          abilities?: string[]
          attr_limits?: Json
          base_attrs?: Json
          base_hp?: number
          dex_number?: number | null
          evolutions?: string[]
          hidden_ability?: string | null
          id?: string
          name: string
          sprite_url?: string | null
          suggested_rank?: Database["public"]["Enums"]["pokerole_rank"] | null
          types?: Database["public"]["Enums"]["pokemon_type"][]
        }
        Update: {
          abilities?: string[]
          attr_limits?: Json
          base_attrs?: Json
          base_hp?: number
          dex_number?: number | null
          evolutions?: string[]
          hidden_ability?: string | null
          id?: string
          name?: string
          sprite_url?: string | null
          suggested_rank?: Database["public"]["Enums"]["pokerole_rank"] | null
          types?: Database["public"]["Enums"]["pokemon_type"][]
        }
        Relationships: []
      }
      species_moves: {
        Row: {
          min_rank: Database["public"]["Enums"]["pokerole_rank"]
          move_id: string
          species_id: string
        }
        Insert: {
          min_rank?: Database["public"]["Enums"]["pokerole_rank"]
          move_id: string
          species_id: string
        }
        Update: {
          min_rank?: Database["public"]["Enums"]["pokerole_rank"]
          move_id?: string
          species_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "species_moves_move_id_fkey"
            columns: ["move_id"]
            isOneToOne: false
            referencedRelation: "moves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "species_moves_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      tokens: {
        Row: {
          character_id: string
          character_kind: string
          created_at: string
          game_id: string
          id: string
          image_url: string | null
          label: string
          owner_id: string
          size: number
          x: number
          y: number
        }
        Insert: {
          character_id: string
          character_kind: string
          created_at?: string
          game_id: string
          id?: string
          image_url?: string | null
          label?: string
          owner_id: string
          size?: number
          x?: number
          y?: number
        }
        Update: {
          character_id?: string
          character_kind?: string
          created_at?: string
          game_id?: string
          id?: string
          image_url?: string | null
          label?: string
          owner_id?: string
          size?: number
          x?: number
          y?: number
        }
        Relationships: []
      }
      trainer_moves: {
        Row: {
          move_id: string
          trainer_id: string
        }
        Insert: {
          move_id: string
          trainer_id: string
        }
        Update: {
          move_id?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_moves_move_id_fkey"
            columns: ["move_id"]
            isOneToOne: false
            referencedRelation: "moves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_moves_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainers: {
        Row: {
          achievements: Json
          age: number | null
          ai_scene_id: string | null
          ai_spawned: boolean
          attrs: Json
          background: string | null
          bag: string
          bag_list: Json
          battle_items: string
          battle_items_list: Json
          concept: string | null
          confidence: number
          created_at: string
          current_hp: number | null
          current_will: number | null
          folder: string | null
          game_id: string
          id: string
          image_url: string | null
          money: number
          name: string
          nature: string | null
          notes: string
          owner_id: string
          pokedex: Json
          potions: Json
          rank: Database["public"]["Enums"]["pokerole_rank"]
          skills: Json
          social_attrs: Json
          status_conditions: string[]
        }
        Insert: {
          achievements?: Json
          age?: number | null
          ai_scene_id?: string | null
          ai_spawned?: boolean
          attrs?: Json
          background?: string | null
          bag?: string
          bag_list?: Json
          battle_items?: string
          battle_items_list?: Json
          concept?: string | null
          confidence?: number
          created_at?: string
          current_hp?: number | null
          current_will?: number | null
          folder?: string | null
          game_id: string
          id?: string
          image_url?: string | null
          money?: number
          name?: string
          nature?: string | null
          notes?: string
          owner_id: string
          pokedex?: Json
          potions?: Json
          rank?: Database["public"]["Enums"]["pokerole_rank"]
          skills?: Json
          social_attrs?: Json
          status_conditions?: string[]
        }
        Update: {
          achievements?: Json
          age?: number | null
          ai_scene_id?: string | null
          ai_spawned?: boolean
          attrs?: Json
          background?: string | null
          bag?: string
          bag_list?: Json
          battle_items?: string
          battle_items_list?: Json
          concept?: string | null
          confidence?: number
          created_at?: string
          current_hp?: number | null
          current_will?: number | null
          folder?: string | null
          game_id?: string
          id?: string
          image_url?: string | null
          money?: number
          name?: string
          nature?: string | null
          notes?: string
          owner_id?: string
          pokedex?: Json
          potions?: Json
          rank?: Database["public"]["Enums"]["pokerole_rank"]
          skills?: Json
          social_attrs?: Json
          status_conditions?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "trainers_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit_character: {
        Args: { _game: string; _owner: string }
        Returns: boolean
      }
      is_game_member: {
        Args: { _game: string; _user: string }
        Returns: boolean
      }
      is_game_narrator: {
        Args: { _game: string; _user: string }
        Returns: boolean
      }
      match_knowledge: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          content: string
          id: string
          similarity: number
          source: string
        }[]
      }
    }
    Enums: {
      attr_key:
        | "strength"
        | "dexterity"
        | "vitality"
        | "insight"
        | "toughness"
        | "appeal"
        | "control"
        | "hp"
        | "will"
        | "defense"
        | "special_defense"
        | "special"
      game_role: "narrator" | "player"
      pokemon_type:
        | "normal"
        | "fire"
        | "water"
        | "electric"
        | "grass"
        | "ice"
        | "fighting"
        | "poison"
        | "ground"
        | "flying"
        | "psychic"
        | "bug"
        | "rock"
        | "ghost"
        | "dragon"
        | "dark"
        | "steel"
        | "fairy"
        | "typeless"
      pokerole_rank:
        | "starter"
        | "beginner"
        | "amateur"
        | "ace"
        | "pro"
        | "master"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      attr_key: [
        "strength",
        "dexterity",
        "vitality",
        "insight",
        "toughness",
        "appeal",
        "control",
        "hp",
        "will",
        "defense",
        "special_defense",
        "special",
      ],
      game_role: ["narrator", "player"],
      pokemon_type: [
        "normal",
        "fire",
        "water",
        "electric",
        "grass",
        "ice",
        "fighting",
        "poison",
        "ground",
        "flying",
        "psychic",
        "bug",
        "rock",
        "ghost",
        "dragon",
        "dark",
        "steel",
        "fairy",
        "typeless",
      ],
      pokerole_rank: ["starter", "beginner", "amateur", "ace", "pro", "master"],
    },
  },
} as const
