export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

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
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
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
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          detail: Json | null;
          group_id: string | null;
          id: string;
          target_user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          detail?: Json | null;
          group_id?: string | null;
          id?: string;
          target_user_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          detail?: Json | null;
          group_id?: string | null;
          id?: string;
          target_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_log_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_log_target_user_id_fkey";
            columns: ["target_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      badge_awards: {
        Row: {
          badge_id: string;
          earned_on: string;
          group_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          badge_id: string;
          earned_on: string;
          group_id: string;
          user_id: string;
        };
        Update: {
          badge_id?: string;
          earned_on?: string;
          group_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "badge_awards_badge_id_fkey";
            columns: ["badge_id"];
            isOneToOne: false;
            referencedRelation: "badges";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "badge_awards_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "badge_awards_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      badges: {
        Row: {
          description: string;
          glyph: string;
          id: string;
          kind: string;
          label: string;
          sort_order: number;
          threshold: number;
          window_days: number | null;
        };
        ComputedFields: never;
        Insert: {
          description: string;
          glyph: string;
          id: string;
          kind: string;
          label: string;
          sort_order: number;
          threshold: number;
          window_days?: number | null;
        };
        Update: {
          description?: string;
          glyph?: string;
          id?: string;
          kind?: string;
          label?: string;
          sort_order?: number;
          threshold?: number;
          window_days?: number | null;
        };
        Relationships: [];
      };
      banner_dismissals: {
        Row: {
          dismissed_at: string;
          key: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          dismissed_at?: string;
          key: string;
          user_id: string;
        };
        Update: {
          dismissed_at?: string;
          key?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "banner_dismissals_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      branch_requests: {
        Row: {
          branch_id: string;
          created_at: string;
          group_id: string;
          requested_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          created_at?: string;
          group_id: string;
          requested_by?: string | null;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          group_id?: string;
          requested_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "branch_requests_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branch_requests_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: true;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branch_requests_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      branch_roadmaps: {
        Row: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          roadmap_id: string;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          created_at?: string;
          created_by?: string | null;
          roadmap_id: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          created_by?: string | null;
          roadmap_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branch_roadmaps_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branch_roadmaps_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branch_roadmaps_roadmap_id_fkey";
            columns: ["roadmap_id"];
            isOneToOne: false;
            referencedRelation: "roadmaps";
            referencedColumns: ["id"];
          },
        ];
      };
      branch_stewards: {
        Row: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          created_at?: string;
          created_by?: string | null;
          user_id: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          created_by?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branch_stewards_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branch_stewards_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branch_stewards_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      branches: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          parent_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          parent_id?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          parent_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "branches_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branches_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_completion: {
        Row: {
          completion_pct: number;
          date: string;
          group_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          completion_pct: number;
          date: string;
          group_id: string;
          user_id: string;
        };
        Update: {
          completion_pct?: number;
          date?: string;
          group_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_completion_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_completion_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      event_questions: {
        Row: {
          answered_at: string | null;
          asker_id: string | null;
          body: string;
          created_at: string;
          event_id: string;
          hidden_at: string | null;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          answered_at?: string | null;
          asker_id?: string | null;
          body: string;
          created_at?: string;
          event_id: string;
          hidden_at?: string | null;
          id?: string;
        };
        Update: {
          answered_at?: string | null;
          asker_id?: string | null;
          body?: string;
          created_at?: string;
          event_id?: string;
          hidden_at?: string | null;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_questions_asker_id_fkey";
            columns: ["asker_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_questions_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      event_rsvps: {
        Row: {
          event_id: string;
          note: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          event_id: string;
          note?: string;
          status: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          event_id?: string;
          note?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_rsvps_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      event_series: {
        Row: {
          active: boolean;
          branch_id: string;
          created_at: string;
          created_by: string | null;
          details: string;
          duration_minutes: number;
          id: string;
          start_time: string;
          timezone: string;
          title: string;
          venue: string;
          weekday: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          branch_id: string;
          created_at?: string;
          created_by?: string | null;
          details?: string;
          duration_minutes?: number;
          id?: string;
          start_time: string;
          timezone: string;
          title: string;
          venue?: string;
          weekday: number;
        };
        Update: {
          active?: boolean;
          branch_id?: string;
          created_at?: string;
          created_by?: string | null;
          details?: string;
          duration_minutes?: number;
          id?: string;
          start_time?: string;
          timezone?: string;
          title?: string;
          venue?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "event_series_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_series_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          branch_id: string;
          bring: string[];
          capacity: number | null;
          contact_detail: string;
          contact_name: string;
          cost: string;
          created_at: string;
          created_by: string | null;
          details: string;
          ends_at: string;
          id: string;
          kind: string;
          rsvp_closes_at: string | null;
          schedule: NonNullable<Json>;
          series_id: string | null;
          starts_at: string;
          status: string;
          timezone: string;
          title: string;
          updated_at: string;
          venue: string;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          bring?: string[];
          capacity?: number | null;
          contact_detail?: string;
          contact_name?: string;
          cost?: string;
          created_at?: string;
          created_by?: string | null;
          details?: string;
          ends_at: string;
          id?: string;
          kind: string;
          rsvp_closes_at?: string | null;
          schedule?: NonNullable<Json>;
          series_id?: string | null;
          starts_at: string;
          status?: string;
          timezone: string;
          title: string;
          updated_at?: string;
          venue?: string;
        };
        Update: {
          branch_id?: string;
          bring?: string[];
          capacity?: number | null;
          contact_detail?: string;
          contact_name?: string;
          cost?: string;
          created_at?: string;
          created_by?: string | null;
          details?: string;
          ends_at?: string;
          id?: string;
          kind?: string;
          rsvp_closes_at?: string | null;
          schedule?: NonNullable<Json>;
          series_id?: string | null;
          starts_at?: string;
          status?: string;
          timezone?: string;
          title?: string;
          updated_at?: string;
          venue?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_series_id_fkey";
            columns: ["series_id"];
            isOneToOne: false;
            referencedRelation: "event_series";
            referencedColumns: ["id"];
          },
        ];
      };
      group_roadmaps: {
        Row: {
          created_at: string;
          group_id: string;
          roadmap_id: string;
          via_branch: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          group_id: string;
          roadmap_id: string;
          via_branch?: string | null;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          roadmap_id?: string;
          via_branch?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "group_roadmaps_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_roadmaps_roadmap_id_fkey";
            columns: ["roadmap_id"];
            isOneToOne: false;
            referencedRelation: "roadmaps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_roadmaps_via_branch_fkey";
            columns: ["via_branch"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      groups: {
        Row: {
          branch_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          branch_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          branch_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "groups_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "groups_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      invites: {
        Row: {
          code: string;
          created_at: string;
          email: string | null;
          group_id: string;
          id: string;
          role: string;
        };
        ComputedFields: never;
        Insert: {
          code?: string;
          created_at?: string;
          email?: string | null;
          group_id: string;
          id?: string;
          role?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          email?: string | null;
          group_id?: string;
          id?: string;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invites_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      logs: {
        Row: {
          count: number;
          date: string;
          id: string;
          logged_by: string | null;
          task_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          count?: number;
          date: string;
          id?: string;
          logged_by?: string | null;
          task_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          count?: number;
          date?: string;
          id?: string;
          logged_by?: string | null;
          task_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "logs_logged_by_fkey";
            columns: ["logged_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "logs_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      member_task_goals: {
        Row: {
          frequency_days: number | null;
          target_count: number | null;
          task_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          frequency_days?: number | null;
          target_count?: number | null;
          task_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          frequency_days?: number | null;
          target_count?: number | null;
          task_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "member_task_goals_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_task_goals_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      member_task_links: {
        Row: {
          cluster_id: string;
          created_at: string;
          task_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          cluster_id?: string;
          created_at?: string;
          task_id: string;
          user_id: string;
        };
        Update: {
          cluster_id?: string;
          created_at?: string;
          task_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "member_task_links_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_task_links_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      member_task_shares: {
        Row: {
          effective_from: string;
          effective_to: string | null;
          id: string;
          set_by: string | null;
          target_count: number;
          task_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          set_by?: string | null;
          target_count: number;
          task_id: string;
          user_id: string;
        };
        Update: {
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          set_by?: string | null;
          target_count?: number;
          task_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "member_task_shares_set_by_fkey";
            columns: ["set_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_task_shares_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_task_shares_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          created_at: string;
          group_id: string;
          id: string;
          role: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          group_id: string;
          id?: string;
          role?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      poll_options: {
        Row: {
          id: string;
          label: string;
          poll_id: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          label: string;
          poll_id: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          label?: string;
          poll_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "poll_options_poll_id_fkey";
            columns: ["poll_id"];
            isOneToOne: false;
            referencedRelation: "polls";
            referencedColumns: ["id"];
          },
        ];
      };
      poll_votes: {
        Row: {
          option_id: string;
          poll_id: string;
          user_id: string;
          voted_at: string;
        };
        ComputedFields: never;
        Insert: {
          option_id: string;
          poll_id: string;
          user_id: string;
          voted_at?: string;
        };
        Update: {
          option_id?: string;
          poll_id?: string;
          user_id?: string;
          voted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "poll_votes_option_id_fkey";
            columns: ["option_id"];
            isOneToOne: false;
            referencedRelation: "poll_options";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "poll_votes_poll_id_fkey";
            columns: ["poll_id"];
            isOneToOne: false;
            referencedRelation: "polls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "poll_votes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      polls: {
        Row: {
          closes_at: string | null;
          created_at: string;
          created_by: string | null;
          event_id: string;
          id: string;
          kind: string;
          question: string;
        };
        ComputedFields: never;
        Insert: {
          closes_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          event_id: string;
          id?: string;
          kind: string;
          question: string;
        };
        Update: {
          closes_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          event_id?: string;
          id?: string;
          kind?: string;
          question?: string;
        };
        Relationships: [
          {
            foreignKeyName: "polls_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "polls_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          id: string;
          is_super_admin: boolean;
          name: string;
          timezone: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          id: string;
          is_super_admin?: boolean;
          name: string;
          timezone?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          id?: string;
          is_super_admin?: boolean;
          name?: string;
          timezone?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          user_agent: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      question_upvotes: {
        Row: {
          question_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          question_id: string;
          user_id: string;
        };
        Update: {
          question_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_upvotes_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "event_questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_upvotes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reactions: {
        Row: {
          created_at: string;
          date: string;
          from_user_id: string;
          group_id: string;
          id: string;
          kind: string;
          to_user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          date: string;
          from_user_id: string;
          group_id: string;
          id?: string;
          kind: string;
          to_user_id: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          from_user_id?: string;
          group_id?: string;
          id?: string;
          kind?: string;
          to_user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reactions_from_user_id_fkey";
            columns: ["from_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reactions_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reactions_to_user_id_fkey";
            columns: ["to_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reminders: {
        Row: {
          created_at: string;
          enabled: boolean;
          id: string;
          label: string;
          last_sent_on: string | null;
          time_of_day: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          label: string;
          last_sent_on?: string | null;
          time_of_day: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          label?: string;
          last_sent_on?: string | null;
          time_of_day?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminders_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string;
          group_id: string | null;
          id: string;
          reason: string;
          reported_user_id: string | null;
          reporter_id: string;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          group_id?: string | null;
          id?: string;
          reason: string;
          reported_user_id?: string | null;
          reporter_id: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
        };
        Update: {
          created_at?: string;
          group_id?: string | null;
          id?: string;
          reason?: string;
          reported_user_id?: string | null;
          reporter_id?: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reports_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reported_user_id_fkey";
            columns: ["reported_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      roadmap_items: {
        Row: {
          category: string;
          compulsory: boolean;
          description: string | null;
          id: string;
          image_url: string | null;
          level: number;
          roadmap_id: string;
          sort_order: number;
          source: string | null;
          target: number;
          title: string;
          unit: string;
          url: string | null;
        };
        ComputedFields: never;
        Insert: {
          category: string;
          compulsory?: boolean;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          level: number;
          roadmap_id: string;
          sort_order?: number;
          source?: string | null;
          target: number;
          title: string;
          unit: string;
          url?: string | null;
        };
        Update: {
          category?: string;
          compulsory?: boolean;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          level?: number;
          roadmap_id?: string;
          sort_order?: number;
          source?: string | null;
          target?: number;
          title?: string;
          unit?: string;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "roadmap_items_roadmap_id_fkey";
            columns: ["roadmap_id"];
            isOneToOne: false;
            referencedRelation: "roadmaps";
            referencedColumns: ["id"];
          },
        ];
      };
      roadmap_level_requirements: {
        Row: {
          category: string;
          level: number;
          min_total: number;
          roadmap_id: string;
        };
        ComputedFields: never;
        Insert: {
          category: string;
          level: number;
          min_total: number;
          roadmap_id: string;
        };
        Update: {
          category?: string;
          level?: number;
          min_total?: number;
          roadmap_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roadmap_level_requirements_roadmap_id_fkey";
            columns: ["roadmap_id"];
            isOneToOne: false;
            referencedRelation: "roadmaps";
            referencedColumns: ["id"];
          },
        ];
      };
      roadmap_participants: {
        Row: {
          created_at: string;
          roadmap_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          roadmap_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          roadmap_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roadmap_participants_roadmap_id_fkey";
            columns: ["roadmap_id"];
            isOneToOne: false;
            referencedRelation: "roadmaps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "roadmap_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      roadmap_progress: {
        Row: {
          done: number;
          item_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          done: number;
          item_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          done?: number;
          item_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roadmap_progress_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "roadmap_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "roadmap_progress_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      roadmap_rewards: {
        Row: {
          description: string | null;
          id: string;
          label: string;
          roadmap_id: string;
          threshold: number;
        };
        ComputedFields: never;
        Insert: {
          description?: string | null;
          id?: string;
          label: string;
          roadmap_id: string;
          threshold: number;
        };
        Update: {
          description?: string | null;
          id?: string;
          label?: string;
          roadmap_id?: string;
          threshold?: number;
        };
        Relationships: [
          {
            foreignKeyName: "roadmap_rewards_roadmap_id_fkey";
            columns: ["roadmap_id"];
            isOneToOne: false;
            referencedRelation: "roadmaps";
            referencedColumns: ["id"];
          },
        ];
      };
      roadmaps: {
        Row: {
          created_at: string;
          ends_on: string;
          id: string;
          name: string;
          published: boolean;
          starts_on: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          ends_on: string;
          id?: string;
          name: string;
          published?: boolean;
          starts_on: string;
        };
        Update: {
          created_at?: string;
          ends_on?: string;
          id?: string;
          name?: string;
          published?: boolean;
          starts_on?: string;
        };
        Relationships: [];
      };
      series_hosts: {
        Row: {
          created_at: string;
          series_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          series_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          series_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "series_hosts_series_id_fkey";
            columns: ["series_id"];
            isOneToOne: false;
            referencedRelation: "event_series";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "series_hosts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      streaks: {
        Row: {
          current: number;
          freezes_left: number;
          last_active: string | null;
          longest: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          current?: number;
          freezes_left?: number;
          last_active?: string | null;
          longest?: number;
          user_id: string;
        };
        Update: {
          current?: number;
          freezes_left?: number;
          last_active?: string | null;
          longest?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "streaks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      task_assignments: {
        Row: {
          assigned_at: string;
          id: string;
          task_id: string;
          unassigned_at: string | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          assigned_at?: string;
          id?: string;
          task_id: string;
          unassigned_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          assigned_at?: string;
          id?: string;
          task_id?: string;
          unassigned_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "task_assignments_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      task_config_versions: {
        Row: {
          effective_from: string;
          effective_to: string | null;
          frequency_days: number;
          id: string;
          target_count: number;
          task_id: string;
        };
        ComputedFields: never;
        Insert: {
          effective_from?: string;
          effective_to?: string | null;
          frequency_days: number;
          id?: string;
          target_count: number;
          task_id: string;
        };
        Update: {
          effective_from?: string;
          effective_to?: string | null;
          frequency_days?: number;
          id?: string;
          target_count?: number;
          task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_config_versions_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          created_at: string;
          frequency_days: number;
          group_id: string;
          id: string;
          label: string;
          personal_for: string | null;
          sort_order: number;
          subtitle: string | null;
          target_count: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          frequency_days?: number;
          group_id: string;
          id?: string;
          label: string;
          personal_for?: string | null;
          sort_order?: number;
          subtitle?: string | null;
          target_count: number;
        };
        Update: {
          created_at?: string;
          frequency_days?: number;
          group_id?: string;
          id?: string;
          label?: string;
          personal_for?: string | null;
          sort_order?: number;
          subtitle?: string | null;
          target_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_personal_for_fkey";
            columns: ["personal_for"];
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
      accept_invite: {
        Args: { p_code: string };
        Returns: {
          branch_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
        };
        SetofOptions: {
          from: "*";
          to: "groups";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      add_personal_task: {
        Args: {
          p_frequency: number;
          p_group: string;
          p_label: string;
          p_subtitle: string;
          p_target: number;
        };
        Returns: {
          created_at: string;
          frequency_days: number;
          group_id: string;
          id: string;
          label: string;
          personal_for: string | null;
          sort_order: number;
          subtitle: string | null;
          target_count: number;
        };
        SetofOptions: {
          from: "*";
          to: "tasks";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      appoint_series_host: {
        Args: { p_email: string; p_series: string };
        Returns: {
          name: string;
          user_id: string;
        }[];
      };
      appoint_steward: {
        Args: { p_branch: string; p_email: string };
        Returns: {
          name: string;
          user_id: string;
        }[];
      };
      ask_question: {
        Args: { p_body: string; p_event: string };
        Returns: string;
      };
      branch_circles: {
        Args: { p_branch: string };
        Returns: {
          group_id: string;
          members: number;
          name: string;
          pending: boolean;
          requested_at: string;
        }[];
      };
      branch_directory: {
        Args: Record<PropertyKey, never>;
        Returns: {
          depth: number;
          id: string;
          label: string;
        }[];
      };
      can_claim_ownership: { Args: { p_group: string }; Returns: boolean };
      can_read_roadmap_cohort: {
        Args: { p_roadmap: string };
        Returns: boolean;
      };
      cancel_branch_request: { Args: { p_group: string }; Returns: undefined };
      claim_due_reminders: {
        Args: Record<PropertyKey, never>;
        Returns: {
          auth: string;
          endpoint: string;
          label: string;
          p256dh: string;
          reminder_id: string;
          user_id: string;
        }[];
      };
      claim_ownership: { Args: { p_group: string }; Returns: undefined };
      create_branch: {
        Args: { p_name: string; p_parent: string };
        Returns: string;
      };
      create_group: {
        Args: { p_name: string };
        Returns: {
          branch_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
        };
        SetofOptions: {
          from: "*";
          to: "groups";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_poll: {
        Args: {
          p_closes_at?: string;
          p_event: string;
          p_kind: string;
          p_options: string[];
          p_question: string;
        };
        Returns: string;
      };
      create_roadmap: {
        Args: { p_ends_on: string; p_name: string; p_starts_on: string };
        Returns: string;
      };
      create_roadmap_item: {
        Args: {
          p_category: string;
          p_compulsory: boolean;
          p_level: number;
          p_roadmap: string;
          p_sort_order: number;
          p_source: string;
          p_target: number;
          p_title: string;
          p_unit: string;
        };
        Returns: string;
      };
      decide_branch_request: {
        Args: { p_approve: boolean; p_group: string };
        Returns: undefined;
      };
      delete_branch: { Args: { p_branch: string }; Returns: undefined };
      delete_event: { Args: { p_event: string }; Returns: undefined };
      delete_my_question: { Args: { p_question: string }; Returns: undefined };
      delete_poll: { Args: { p_poll: string }; Returns: undefined };
      delete_roadmap: { Args: { p_roadmap: string }; Returns: undefined };
      delete_roadmap_item: { Args: { p_item: string }; Returns: undefined };
      delete_roadmap_reward: { Args: { p_reward: string }; Returns: undefined };
      event_attendees: {
        Args: { p_event: string };
        Returns: {
          name: string;
          note: string;
          status: string;
          updated_at: string;
          user_id: string;
        }[];
      };
      event_detail: {
        Args: { p_event: string };
        Returns: {
          branch_id: string;
          branch_name: string;
          can_lead: boolean;
          can_steward: boolean;
          capacity: number;
          details: string;
          ends_at: string;
          going: number;
          id: string;
          kind: string;
          maybe: number;
          my_note: string;
          my_status: string;
          no: number;
          rsvp_closes_at: string;
          series_id: string;
          starts_at: string;
          status: string;
          timezone: string;
          title: string;
          venue: string;
        }[];
      };
      event_polls: {
        Args: { p_event: string };
        Returns: {
          closes_at: string;
          kind: string;
          label: string;
          mine: boolean;
          option_id: string;
          poll_id: string;
          question: string;
          sort_order: number;
          votes: number;
        }[];
      };
      event_question_list: {
        Args: { p_event: string };
        Returns: {
          answered: boolean;
          body: string;
          created_at: string;
          hidden: boolean;
          i_upvoted: boolean;
          id: string;
          mine: boolean;
          upvotes: number;
        }[];
      };
      events_i_lead: {
        Args: Record<PropertyKey, never>;
        Returns: {
          branch_id: string;
          branch_name: string;
          can_steward: boolean;
          ends_at: string;
          going: number;
          id: string;
          kind: string;
          questions: number;
          series_id: string;
          starts_at: string;
          status: string;
          timezone: string;
          title: string;
        }[];
      };
      grant_super_admin: {
        Args: { p_email: string };
        Returns: {
          name: string;
          user_id: string;
        }[];
      };
      group_consistency: {
        Args: { p_days: number; p_group: string };
        Returns: number;
      };
      increment_count: {
        Args: { p_date: string; p_delta: number; p_task: string };
        Returns: number;
      };
      leave_branch: { Args: { p_group: string }; Returns: undefined };
      link_tasks: {
        Args: { p_task_a: string; p_task_b: string };
        Returns: string;
      };
      list_branch_stewards: {
        Args: { p_branch: string };
        Returns: {
          email: string;
          name: string;
          user_id: string;
        }[];
      };
      list_series_hosts: {
        Args: { p_series: string };
        Returns: {
          email: string;
          name: string;
          user_id: string;
        }[];
      };
      list_super_admins: {
        Args: Record<PropertyKey, never>;
        Returns: {
          email: string;
          name: string;
          user_id: string;
        }[];
      };
      lookup_invite: {
        Args: { p_code: string };
        Returns: {
          already_member: boolean;
          email_locked: boolean;
          email_matches: boolean;
          group_id: string;
          group_name: string;
          invite_role: string;
        }[];
      };
      mcp_session_active: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      my_steward_tree: {
        Args: Record<PropertyKey, never>;
        Returns: {
          circles: number;
          depth: number;
          direct: boolean;
          id: string;
          name: string;
          parent_id: string;
          pending: number;
        }[];
      };
      my_upcoming_events: {
        Args: { p_limit?: number };
        Returns: {
          branch_name: string;
          capacity: number;
          ends_at: string;
          going: number;
          id: string;
          kind: string;
          maybe: number;
          my_open_votes: number;
          my_status: string;
          open_polls: number;
          questions: number;
          rsvp_closes_at: string;
          starts_at: string;
          status: string;
          timezone: string;
          title: string;
          venue: string;
        }[];
      };
      reassign_owner: {
        Args: { p_group: string; p_new_owner: string };
        Returns: undefined;
      };
      regenerate_invite: { Args: { p_group_id: string }; Returns: string };
      remove_series_host: {
        Args: { p_series: string; p_user: string };
        Returns: undefined;
      };
      remove_steward: {
        Args: { p_branch: string; p_user: string };
        Returns: undefined;
      };
      rename_branch: {
        Args: { p_branch: string; p_name: string };
        Returns: undefined;
      };
      reorder_roadmap_items: {
        Args: {
          p_category: string;
          p_items: string[];
          p_level: number;
          p_roadmap: string;
        };
        Returns: undefined;
      };
      request_branch: {
        Args: { p_branch: string; p_group: string };
        Returns: string;
      };
      resolve_report: {
        Args: { p_note?: string; p_report: string; p_status: string };
        Returns: undefined;
      };
      revoke_super_admin: { Args: { p_user: string }; Returns: undefined };
      roadmap_circles: {
        Args: { p_roadmap: string };
        Returns: {
          following: boolean;
          group_id: string;
          member_count: number;
          name: string;
          via_branch_name: string;
        }[];
      };
      roadmap_reach: { Args: { p_roadmap: string }; Returns: number };
      roadmap_roster: {
        Args: Record<PropertyKey, never>;
        Returns: {
          name: string;
          roadmap_id: string;
          user_id: string;
        }[];
      };
      save_camp: {
        Args: {
          p_branch: string;
          p_bring?: string[];
          p_capacity: number;
          p_contact_detail?: string;
          p_contact_name?: string;
          p_cost?: string;
          p_details: string;
          p_ends_at: string;
          p_id: string;
          p_rsvp_closes_at: string;
          p_schedule?: Json;
          p_starts_at: string;
          p_status: string;
          p_timezone: string;
          p_title: string;
          p_venue: string;
        };
        Returns: string;
      };
      save_push_subscription: {
        Args: {
          p_auth: string;
          p_endpoint: string;
          p_p256dh: string;
          p_user_agent: string;
        };
        Returns: undefined;
      };
      save_series: {
        Args: {
          p_active: boolean;
          p_branch: string;
          p_details: string;
          p_duration_minutes: number;
          p_id: string;
          p_start_time: string;
          p_timezone: string;
          p_title: string;
          p_venue: string;
          p_weekday: number;
        };
        Returns: string;
      };
      set_branch_on_roadmap: {
        Args: { p_assign: boolean; p_branch: string; p_roadmap: string };
        Returns: undefined;
      };
      set_circle_on_roadmap: {
        Args: { p_follow: boolean; p_group: string; p_roadmap: string };
        Returns: undefined;
      };
      set_count: {
        Args: {
          p_count: number;
          p_date: string;
          p_task: string;
          p_user: string;
        };
        Returns: number;
      };
      set_event_cancelled: {
        Args: { p_cancelled: boolean; p_event: string };
        Returns: undefined;
      };
      set_member_task_share: {
        Args: { p_target: number; p_task: string; p_user: string };
        Returns: number;
      };
      set_question_state: {
        Args: { p_answered: boolean; p_hidden: boolean; p_question: string };
        Returns: undefined;
      };
      set_reminder: {
        Args: {
          p_enabled: boolean;
          p_id: string;
          p_label: string;
          p_time: string;
        };
        Returns: string;
      };
      set_roadmap_item_content: {
        Args: {
          p_description: string;
          p_image_url: string;
          p_item: string;
          p_url: string;
        };
        Returns: undefined;
      };
      set_roadmap_item_shape: {
        Args: {
          p_category: string;
          p_compulsory: boolean;
          p_item: string;
          p_level: number;
          p_sort_order: number;
          p_source: string;
          p_target: number;
          p_title: string;
          p_unit: string;
        };
        Returns: undefined;
      };
      set_roadmap_level_requirement: {
        Args: {
          p_category: string;
          p_level: number;
          p_min_total: number;
          p_roadmap: string;
        };
        Returns: undefined;
      };
      set_roadmap_progress: {
        Args: { p_done: number; p_item: string };
        Returns: number;
      };
      set_roadmap_published: {
        Args: { p_published: boolean; p_roadmap: string };
        Returns: undefined;
      };
      set_rsvp: {
        Args: { p_event: string; p_note?: string; p_status: string };
        Returns: string;
      };
      set_task_assignees: {
        Args: { p_task: string; p_user_ids: string[] };
        Returns: undefined;
      };
      set_task_frequency: {
        Args: { p_days: number; p_task: string };
        Returns: number;
      };
      set_task_goal: {
        Args: { p_target: number; p_task: string };
        Returns: number;
      };
      sync_badges: { Args: { p_group: string }; Returns: undefined };
      take_part_in_roadmap: {
        Args: { p_roadmap: string; p_take_part: boolean };
        Returns: undefined;
      };
      toggle_reaction: {
        Args: { p_group: string; p_kind: string; p_to: string };
        Returns: boolean;
      };
      transfer_ownership: {
        Args: { p_group: string; p_new_owner: string };
        Returns: undefined;
      };
      unlink_task: { Args: { p_task: string }; Returns: undefined };
      update_roadmap: {
        Args: {
          p_ends_on: string;
          p_name: string;
          p_roadmap: string;
          p_starts_on: string;
        };
        Returns: undefined;
      };
      upsert_roadmap_reward: {
        Args: {
          p_description: string;
          p_label: string;
          p_reward?: string;
          p_roadmap: string;
          p_threshold: number;
        };
        Returns: string;
      };
      upvote_question: {
        Args: { p_on: boolean; p_question: string };
        Returns: undefined;
      };
      vote_poll: {
        Args: { p_option: string; p_poll: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
