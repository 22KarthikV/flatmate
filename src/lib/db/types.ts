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
      availability: {
        Row: {
          assumed: boolean;
          available: boolean;
          household_id: string;
          on_date: string;
          profile_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          assumed?: boolean;
          available: boolean;
          household_id: string;
          on_date: string;
          profile_id: string;
          updated_at?: string;
        };
        Update: {
          assumed?: boolean;
          available?: boolean;
          household_id?: string;
          on_date?: string;
          profile_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "availability_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "availability_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
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
          availability_deadline: string;
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
          availability_deadline?: string;
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
          availability_deadline?: string;
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
      recurring_instances: {
        Row: {
          created_at: string;
          due_on: string;
          expense_id: string | null;
          household_id: string;
          id: string;
          period: string;
          status: string;
          template_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          due_on: string;
          expense_id?: string | null;
          household_id: string;
          id?: string;
          period: string;
          status: string;
          template_id: string;
        };
        Update: {
          created_at?: string;
          due_on?: string;
          expense_id?: string | null;
          household_id?: string;
          id?: string;
          period?: string;
          status?: string;
          template_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_instances_expense_id_fkey";
            columns: ["expense_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_instances_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_instances_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "recurring_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_rooms: {
        Row: {
          household_id: string;
          id: string;
          name: string;
          rent_pence: number;
          template_id: string;
        };
        ComputedFields: never;
        Insert: {
          household_id: string;
          id?: string;
          name: string;
          rent_pence: number;
          template_id: string;
        };
        Update: {
          household_id?: string;
          id?: string;
          name?: string;
          rent_pence?: number;
          template_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_rooms_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_rooms_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "recurring_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_template_log: {
        Row: {
          change: string;
          changed_by: string;
          created_at: string;
          detail: NonNullable<Json>;
          household_id: string;
          id: string;
          template_id: string;
        };
        ComputedFields: never;
        Insert: {
          change: string;
          changed_by: string;
          created_at?: string;
          detail?: NonNullable<Json>;
          household_id: string;
          id?: string;
          template_id: string;
        };
        Update: {
          change?: string;
          changed_by?: string;
          created_at?: string;
          detail?: NonNullable<Json>;
          household_id?: string;
          id?: string;
          template_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_template_log_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_template_log_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_template_log_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "recurring_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_template_shares: {
        Row: {
          household_id: string;
          profile_id: string;
          room_id: string | null;
          share_value: number | null;
          template_id: string;
        };
        ComputedFields: never;
        Insert: {
          household_id: string;
          profile_id: string;
          room_id?: string | null;
          share_value?: number | null;
          template_id: string;
        };
        Update: {
          household_id?: string;
          profile_id?: string;
          room_id?: string | null;
          share_value?: number | null;
          template_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_template_shares_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_template_shares_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_template_shares_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "recurring_rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_template_shares_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "recurring_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_templates: {
        Row: {
          active_months: number[];
          amount_mode: string;
          amount_pence: number | null;
          created_at: string;
          created_by: string;
          due_day: number;
          ended_at: string | null;
          household_id: string;
          id: string;
          kind: string;
          name: string;
          paid_by: string;
          paused_at: string | null;
          paused_reason: string | null;
          split_mode: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active_months?: number[];
          amount_mode: string;
          amount_pence?: number | null;
          created_at?: string;
          created_by: string;
          due_day: number;
          ended_at?: string | null;
          household_id: string;
          id?: string;
          kind: string;
          name: string;
          paid_by: string;
          paused_at?: string | null;
          paused_reason?: string | null;
          split_mode: string;
          updated_at?: string;
        };
        Update: {
          active_months?: number[];
          amount_mode?: string;
          amount_pence?: number | null;
          created_at?: string;
          created_by?: string;
          due_day?: number;
          ended_at?: string | null;
          household_id?: string;
          id?: string;
          kind?: string;
          name?: string;
          paid_by?: string;
          paused_at?: string | null;
          paused_reason?: string | null;
          split_mode?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_templates_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_templates_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_templates_paid_by_fkey";
            columns: ["paid_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      rent_charges: {
        Row: {
          amount_pence: number;
          collector_id: string;
          created_at: string;
          due_on: string;
          household_id: string;
          id: string;
          instance_id: string;
          period: string;
          profile_id: string;
          room_name: string | null;
          template_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_pence: number;
          collector_id: string;
          created_at?: string;
          due_on: string;
          household_id: string;
          id?: string;
          instance_id: string;
          period: string;
          profile_id: string;
          room_name?: string | null;
          template_id: string;
        };
        Update: {
          amount_pence?: number;
          collector_id?: string;
          created_at?: string;
          due_on?: string;
          household_id?: string;
          id?: string;
          instance_id?: string;
          period?: string;
          profile_id?: string;
          room_name?: string | null;
          template_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rent_charges_collector_id_fkey";
            columns: ["collector_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rent_charges_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rent_charges_instance_id_fkey";
            columns: ["instance_id"];
            isOneToOne: false;
            referencedRelation: "recurring_instances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rent_charges_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rent_charges_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "recurring_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      rent_payments: {
        Row: {
          amount_pence: number;
          collector_id: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          household_id: string;
          id: string;
          kind: string;
          payer_id: string;
          reason: string | null;
          status: string;
          template_id: string;
          voided_at: string | null;
          voided_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          amount_pence: number;
          collector_id: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          household_id: string;
          id?: string;
          kind?: string;
          payer_id: string;
          reason?: string | null;
          status: string;
          template_id: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          amount_pence?: number;
          collector_id?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          household_id?: string;
          id?: string;
          kind?: string;
          payer_id?: string;
          reason?: string | null;
          status?: string;
          template_id?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "rent_payments_collector_id_fkey";
            columns: ["collector_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rent_payments_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rent_payments_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rent_payments_payer_id_fkey";
            columns: ["payer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rent_payments_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "recurring_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rent_payments_voided_by_fkey";
            columns: ["voided_by"];
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
      cancel_rent_payment: { Args: { p_payment_id: string }; Returns: undefined };
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
      confirm_rent_payment: { Args: { p_payment_id: string }; Returns: undefined };
      confirm_settlement: { Args: { p_settlement_id: string }; Returns: undefined };
      create_household: { Args: { p_name: string }; Returns: string };
      create_invite: { Args: Record<PropertyKey, never>; Returns: string };
      decline_rent_payment: { Args: { p_payment_id: string }; Returns: undefined };
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
      end_recurring_template: { Args: { p_template_id: string }; Returns: undefined };
      enter_bill_amount: { Args: { p_amount_pence: number; p_instance: string }; Returns: string };
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
      my_rent: {
        Args: Record<PropertyKey, never>;
        Returns: {
          amount_pence: number;
          charge_id: string;
          collector_id: string;
          collector_name: string;
          covered_pence: number;
          due_on: string;
          outstanding_pence: number;
          pending_pence: number;
          period: string;
          status: string;
          template_id: string;
        }[];
      };
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
      pause_recurring_template: { Args: { p_template_id: string }; Returns: undefined };
      preview_invite: {
        Args: { p_token: string };
        Returns: {
          household_name: string;
          inviter_name: string;
          member_count: number;
        }[];
      };
      record_rent_payment: { Args: { p_amount_pence: number }; Returns: string };
      record_settlement: { Args: { p_amount_pence: number; p_to: string }; Returns: string };
      remove_member: { Args: { p_profile_id: string }; Returns: undefined };
      rename_household: { Args: { p_name: string }; Returns: undefined };
      rent_dashboard: {
        Args: { p_period: string };
        Returns: {
          amount_pence: number;
          charge_id: string;
          covered_pence: number;
          display_name: string;
          due_on: string;
          outstanding_pence: number;
          pending_pence: number;
          period: string;
          profile_id: string;
          room_name: string;
          status: string;
          still_in_flat: boolean;
        }[];
      };
      resume_recurring_template: { Args: { p_template_id: string }; Returns: undefined };
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
      save_recurring_template: {
        Args: { p_payload: Json; p_template_id: string };
        Returns: string;
      };
      set_availability: { Args: { p_days: boolean[]; p_week_start: string }; Returns: undefined };
      set_member_role: {
        Args: { p_profile_id: string; p_role: Database["public"]["Enums"]["household_role"] };
        Returns: undefined;
      };
      set_notification_preference: {
        Args: { p_in_app: boolean; p_push: boolean; p_type: string };
        Returns: undefined;
      };
      set_nudge_interval: { Args: { p_days: number }; Returns: undefined };
      skip_recurring_month: {
        Args: { p_period: string; p_template_id: string };
        Returns: undefined;
      };
      snooze: { Args: { p_id: string; p_until: string }; Returns: undefined };
      transfer_ownership: { Args: { p_profile_id: string }; Returns: undefined };
      verify_scheduler_secret: { Args: { candidate: string }; Returns: boolean };
      void_expense: { Args: { p_expense_id: string }; Returns: undefined };
      void_rent_payment: { Args: { p_payment_id: string }; Returns: undefined };
      waive_rent: {
        Args: { p_amount_pence: number; p_payer_id: string; p_reason: string };
        Returns: string;
      };
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
