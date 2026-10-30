export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      chore_checklist_items: {
        Row: {
          chore_id: string;
          id: string;
          position: number;
          text: string;
        };
        ComputedFields: never;
        Insert: {
          chore_id: string;
          id?: string;
          position: number;
          text: string;
        };
        Update: {
          chore_id?: string;
          id?: string;
          position?: number;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chore_checklist_items_chore_id_fkey";
            columns: ["chore_id"];
            isOneToOne: false;
            referencedRelation: "chores";
            referencedColumns: ["id"];
          },
        ];
      };
      chores: {
        Row: {
          archived_at: string | null;
          cadence: string;
          created_at: string;
          effort: number;
          every_n_days: number | null;
          household_id: string;
          id: string;
          name: string;
          needs_signoff: boolean;
          preferred_dow: number | null;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          cadence: string;
          created_at?: string;
          effort?: number;
          every_n_days?: number | null;
          household_id: string;
          id?: string;
          name: string;
          needs_signoff?: boolean;
          preferred_dow?: number | null;
        };
        Update: {
          archived_at?: string | null;
          cadence?: string;
          created_at?: string;
          effort?: number;
          every_n_days?: number | null;
          household_id?: string;
          id?: string;
          name?: string;
          needs_signoff?: boolean;
          preferred_dow?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "chores_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_shares: {
        Row: {
          expense_id: string;
          household_id: string;
          profile_id: string;
          share_pence: number;
        };
        ComputedFields: never;
        Insert: {
          expense_id: string;
          household_id: string;
          profile_id: string;
          share_pence: number;
        };
        Update: {
          expense_id?: string;
          household_id?: string;
          profile_id?: string;
          share_pence?: number;
        };
        Relationships: [
          {
            foreignKeyName: "expense_shares_expense_id_household_id_fkey";
            columns: ["expense_id", "household_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["id", "household_id"];
          },
          {
            foreignKeyName: "expense_shares_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          amount_pence: number;
          category: string;
          created_at: string;
          created_by: string;
          description: string;
          household_id: string;
          id: string;
          occurred_on: string;
          paid_by: string;
          replaces_id: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          amount_pence: number;
          category: string;
          created_at?: string;
          created_by: string;
          description: string;
          household_id: string;
          id?: string;
          occurred_on: string;
          paid_by: string;
          replaces_id?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          amount_pence?: number;
          category?: string;
          created_at?: string;
          created_by?: string;
          description?: string;
          household_id?: string;
          id?: string;
          occurred_on?: string;
          paid_by?: string;
          replaces_id?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_paid_by_fkey";
            columns: ["paid_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_replaces_id_fkey";
            columns: ["replaces_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_voided_by_fkey";
            columns: ["voided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      households: {
        Row: {
          closed_at: string | null;
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          nudge_after_days: number | null;
          timezone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          closed_at?: string | null;
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          nudge_after_days?: number | null;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          closed_at?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          nudge_after_days?: number | null;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "households_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      invites: {
        Row: {
          created_at: string;
          created_by: string;
          expires_at: string;
          household_id: string;
          id: string;
          revoked_at: string | null;
          token_hash: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by: string;
          expires_at: string;
          household_id: string;
          id?: string;
          revoked_at?: string | null;
          token_hash: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          household_id?: string;
          id?: string;
          revoked_at?: string | null;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      job_runs: {
        Row: {
          created_at: string;
          error: string | null;
          finished_at: string | null;
          id: string;
          idempotency_key: string;
          job_name: string;
          started_at: string;
          status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          idempotency_key: string;
          job_name: string;
          started_at?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          idempotency_key?: string;
          job_name?: string;
          started_at?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          household_id: string;
          id: string;
          joined_at: string;
          left_at: string | null;
          left_reason: string | null;
          profile_id: string;
          role: Database["public"]["Enums"]["household_role"];
        };
        ComputedFields: never;
        Insert: {
          household_id: string;
          id?: string;
          joined_at?: string;
          left_at?: string | null;
          left_reason?: string | null;
          profile_id: string;
          role?: Database["public"]["Enums"]["household_role"];
        };
        Update: {
          household_id?: string;
          id?: string;
          joined_at?: string;
          left_at?: string | null;
          left_reason?: string | null;
          profile_id?: string;
          role?: Database["public"]["Enums"]["household_role"];
        };
        Relationships: [
          {
            foreignKeyName: "memberships_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_preferences: {
        Row: {
          in_app: boolean;
          profile_id: string;
          push: boolean;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          in_app: boolean;
          profile_id: string;
          push: boolean;
          type: string;
        };
        Update: {
          in_app?: boolean;
          profile_id?: string;
          push?: boolean;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_preferences_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_preferences_type_fkey";
            columns: ["type"];
            isOneToOne: false;
            referencedRelation: "notification_types";
            referencedColumns: ["type"];
          },
        ];
      };
      notification_types: {
        Row: {
          default_in_app: boolean;
          default_push: boolean;
          push_body: string | null;
          push_title: string | null;
          snoozable: boolean;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          default_in_app: boolean;
          default_push: boolean;
          push_body?: string | null;
          push_title?: string | null;
          snoozable?: boolean;
          type: string;
        };
        Update: {
          default_in_app?: boolean;
          default_push?: boolean;
          push_body?: string | null;
          push_title?: string | null;
          snoozable?: boolean;
          type?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          body: string;
          created_at: string;
          dedupe_key: string;
          household_id: string;
          href: string;
          id: string;
          read_at: string | null;
          recipient_id: string;
          snoozed_until: string | null;
          title: string;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          body?: string;
          created_at?: string;
          dedupe_key: string;
          household_id: string;
          href: string;
          id?: string;
          read_at?: string | null;
          recipient_id: string;
          snoozed_until?: string | null;
          title: string;
          type: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          dedupe_key?: string;
          household_id?: string;
          href?: string;
          id?: string;
          read_at?: string | null;
          recipient_id?: string;
          snoozed_until?: string | null;
          title?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_type_fkey";
            columns: ["type"];
            isOneToOne: false;
            referencedRelation: "notification_types";
            referencedColumns: ["type"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          deleted_at: string | null;
          display_name: string;
          id: string;
          updated_at: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          display_name: string;
          id?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          display_name?: string;
          id?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      push_outbox: {
        Row: {
          attempts: number;
          id: string;
          last_error: string | null;
          next_attempt_at: string;
          notification_id: string;
          sent_at: string | null;
          subscription_id: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          id?: string;
          last_error?: string | null;
          next_attempt_at?: string;
          notification_id: string;
          sent_at?: string | null;
          subscription_id: string;
        };
        Update: {
          attempts?: number;
          id?: string;
          last_error?: string | null;
          next_attempt_at?: string;
          notification_id?: string;
          sent_at?: string | null;
          subscription_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_outbox_notification_id_fkey";
            columns: ["notification_id"];
            isOneToOne: false;
            referencedRelation: "notifications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "push_outbox_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "push_subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          failed_at: string | null;
          id: string;
          last_success_at: string | null;
          p256dh: string;
          profile_id: string;
          user_agent: string | null;
        };
        ComputedFields: never;
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          failed_at?: string | null;
          id?: string;
          last_success_at?: string | null;
          p256dh: string;
          profile_id: string;
          user_agent?: string | null;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          failed_at?: string | null;
          id?: string;
          last_success_at?: string | null;
          p256dh?: string;
          profile_id?: string;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      settlements: {
        Row: {
          amount_pence: number;
          confirmed_by: string | null;
          created_at: string;
          decided_at: string | null;
          from_profile: string;
          household_id: string;
          id: string;
          status: string;
          to_profile: string;
        };
        ComputedFields: never;
        Insert: {
          amount_pence: number;
          confirmed_by?: string | null;
          created_at?: string;
          decided_at?: string | null;
          from_profile: string;
          household_id: string;
          id?: string;
          status?: string;
          to_profile: string;
        };
        Update: {
          amount_pence?: number;
          confirmed_by?: string | null;
          created_at?: string;
          decided_at?: string | null;
          from_profile?: string;
          household_id?: string;
          id?: string;
          status?: string;
          to_profile?: string;
        };
        Relationships: [
          {
            foreignKeyName: "settlements_confirmed_by_fkey";
            columns: ["confirmed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlements_from_profile_fkey";
            columns: ["from_profile"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlements_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlements_to_profile_fkey";
            columns: ["to_profile"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_expense: {
        Args: {
          p_amount_pence: number;
          p_category: string;
          p_description: string;
          p_occurred_on: string;
          p_paid_by: string;
          p_profile_ids: string[];
          p_share_pence: number[];
        };
        Returns: string;
      };
      anonymise_profile: { Args: { p_user_id: string }; Returns: undefined };
      archive_chore: { Args: { p_chore_id: string }; Returns: undefined };
      cancel_settlement: { Args: { p_settlement_id: string }; Returns: undefined };
      claim_push_outbox: {
        Args: { p_limit?: number };
        Returns: {
          attempts: number;
          auth: string;
          body: string;
          endpoint: string;
          href: string;
          outbox_id: string;
          p256dh: string;
          title: string;
        }[];
      };
      close_household: { Args: Record<PropertyKey, never>; Returns: undefined };
      complete_push: {
        Args: {
          p_error?: string;
          p_outbox_id: string;
          p_result: string;
          p_retry_in_seconds?: number;
        };
        Returns: undefined;
      };
      confirm_settlement: { Args: { p_settlement_id: string }; Returns: undefined };
      create_household: { Args: { p_name: string }; Returns: string };
      create_invite: { Args: Record<PropertyKey, never>; Returns: string };
      decline_settlement: { Args: { p_settlement_id: string }; Returns: undefined };
      edit_expense: {
        Args: {
          p_amount_pence: number;
          p_category: string;
          p_description: string;
          p_expense_id: string;
          p_occurred_on: string;
          p_paid_by: string;
          p_profile_ids: string[];
          p_share_pence: number[];
        };
        Returns: string;
      };
      end_memberships_for_account: { Args: { p_user_id: string }; Returns: string };
      health_ping: { Args: Record<PropertyKey, never>; Returns: boolean };
      household_balances: {
        Args: { p_household_id: string };
        Returns: {
          balance_pence: number;
          profile_id: string;
        }[];
      };
      join_household: { Args: { p_token: string }; Returns: string };
      leave_household: { Args: Record<PropertyKey, never>; Returns: undefined };
      load_default_chores: { Args: Record<PropertyKey, never>; Returns: number };
      mark_all_read: { Args: Record<PropertyKey, never>; Returns: undefined };
      mark_read: { Args: { p_id: string }; Returns: undefined };
      notify: {
        Args: {
          p_body: string;
          p_dedupe_key: string;
          p_household: string;
          p_href: string;
          p_recipient: string;
          p_title: string;
          p_type: string;
        };
        Returns: string;
      };
      preview_invite: {
        Args: { p_token: string };
        Returns: {
          household_name: string;
          inviter_name: string;
          member_count: number;
        }[];
      };
      record_settlement: { Args: { p_amount_pence: number; p_to: string }; Returns: string };
      remove_member: { Args: { p_profile_id: string }; Returns: undefined };
      rename_household: { Args: { p_name: string }; Returns: undefined };
      revoke_invite: { Args: Record<PropertyKey, never>; Returns: undefined };
      save_chore: {
        Args: {
          p_cadence?: string;
          p_chore_id?: string;
          p_effort?: number;
          p_every_n_days?: number;
          p_items?: string[];
          p_name?: string;
          p_needs_signoff?: boolean;
          p_preferred_dow?: number;
        };
        Returns: string;
      };
      save_push_subscription: {
        Args: { p_auth: string; p_endpoint: string; p_p256dh: string; p_user_agent: string };
        Returns: string;
      };
      set_member_role: {
        Args: { p_profile_id: string; p_role: Database["public"]["Enums"]["household_role"] };
        Returns: undefined;
      };
      set_notification_preference: {
        Args: { p_in_app: boolean; p_push: boolean; p_type: string };
        Returns: undefined;
      };
      set_nudge_interval: { Args: { p_days: number }; Returns: undefined };
      snooze: { Args: { p_id: string; p_until: string }; Returns: undefined };
      transfer_ownership: { Args: { p_profile_id: string }; Returns: undefined };
      verify_scheduler_secret: { Args: { candidate: string }; Returns: boolean };
      void_expense: { Args: { p_expense_id: string }; Returns: undefined };
    };
    Enums: {
      household_role: "owner" | "admin" | "member";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      household_role: ["owner", "admin", "member"],
    },
  },
} as const;
