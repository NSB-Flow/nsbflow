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
      agent_runs: {
        Row: {
          agent: string
          agent_id: string | null
          cnpj: string | null
          company_id: string | null
          company_name: string | null
          created_at: string
          created_by: string
          error: string | null
          favorite: boolean
          id: string
          payload: Json
          result: Json | null
          status: string
          tags: string[]
          title: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          agent: string
          agent_id?: string | null
          cnpj?: string | null
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          created_by: string
          error?: string | null
          favorite?: boolean
          id?: string
          payload?: Json
          result?: Json | null
          status?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          agent?: string
          agent_id?: string | null
          cnpj?: string | null
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string
          error?: string | null
          favorite?: boolean
          id?: string
          payload?: Json
          result?: Json | null
          status?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          category: string | null
          created_at: string
          credit_cost: number
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          min_plan: string
          n8n_webhook_url: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          credit_cost?: number
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          min_plan?: string
          n8n_webhook_url?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          credit_cost?: number
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          min_plan?: string
          n8n_webhook_url?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      attachments: {
        Row: {
          created_at: string
          created_by: string
          filename: string | null
          id: string
          mime: string | null
          path: string
          run_id: string | null
          size: number | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          filename?: string | null
          id?: string
          mime?: string | null
          path: string
          run_id?: string | null
          size?: number | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          filename?: string | null
          id?: string
          mime?: string | null
          path?: string
          run_id?: string | null
          size?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          cnpj: string | null
          created_at: string
          created_by: string | null
          id: string
          razao_social: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          razao_social: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          razao_social?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          amount_off_cents: number | null
          code: string
          created_at: string
          currency: string | null
          id: string
          max_redemptions: number | null
          percent_off: number | null
          redeemed_count: number
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          amount_off_cents?: number | null
          code: string
          created_at?: string
          currency?: string | null
          id?: string
          max_redemptions?: number | null
          percent_off?: number | null
          redeemed_count?: number
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          amount_off_cents?: number | null
          code?: string
          created_at?: string
          currency?: string | null
          id?: string
          max_redemptions?: number | null
          percent_off?: number | null
          redeemed_count?: number
          valid_until?: string | null
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          kind: string
          reference_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          reference_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          reference_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      enterprise_module_grants: {
        Row: {
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          subscription_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          subscription_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_module_grants_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_features: {
        Row: {
          enabled: boolean
          feature_key: string
          id: string
          plan_id: string
          quota: number | null
        }
        Insert: {
          enabled?: boolean
          feature_key: string
          id?: string
          plan_id: string
          quota?: number | null
        }
        Update: {
          enabled?: boolean
          feature_key?: string
          id?: string
          plan_id?: string
          quota?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          description: string | null
          id: string
          max_users: number | null
          monthly_credits: number | null
          name: string
          price_monthly_cents: number
          price_yearly_cents: number
          sort_order: number
          tier: Database["public"]["Enums"]["plan_tier"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          max_users?: number | null
          monthly_credits?: number | null
          name: string
          price_monthly_cents?: number
          price_yearly_cents?: number
          sort_order?: number
          tier: Database["public"]["Enums"]["plan_tier"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          max_users?: number | null
          monthly_credits?: number | null
          name?: string
          price_monthly_cents?: number
          price_yearly_cents?: number
          sort_order?: number
          tier?: Database["public"]["Enums"]["plan_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          referral_code: string | null
          sector: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          referral_code?: string | null
          sector?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          referral_code?: string | null
          sector?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          code: string
          converted_at: string | null
          created_at: string
          credits_awarded: number
          id: string
          referred_user_id: string | null
          referrer_user_id: string
          signed_up_at: string | null
          status: string
        }
        Insert: {
          code: string
          converted_at?: string | null
          created_at?: string
          credits_awarded?: number
          id?: string
          referred_user_id?: string | null
          referrer_user_id: string
          signed_up_at?: string | null
          status?: string
        }
        Update: {
          code?: string
          converted_at?: string | null
          created_at?: string
          credits_awarded?: number
          id?: string
          referred_user_id?: string | null
          referrer_user_id?: string
          signed_up_at?: string | null
          status?: string
        }
        Relationships: []
      }
      subscription_invoices: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          pdf_url: string | null
          provider_invoice_id: string | null
          status: string
          subscription_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          pdf_url?: string | null
          provider_invoice_id?: string | null
          status?: string
          subscription_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          pdf_url?: string | null
          provider_invoice_id?: string | null
          status?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string
          id: string
          plan_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_customer_id: string | null
          provider_subscription_id: string | null
          seats: number
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          id?: string
          plan_id: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          seats?: number
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          id?: string
          plan_id?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          seats?: number
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_credits: {
        Row: {
          balance: number
          created_at: string
          lifetime_earned: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          lifetime_earned?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          lifetime_earned?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string
          dedupe_key: string
          id: string
          kind: string
          read_at: string | null
          severity: string
          title: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          dedupe_key: string
          id?: string
          kind: string
          read_at?: string | null
          severity?: string
          title: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: string
          read_at?: string | null
          severity?: string
          title?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_role_audit: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          ip: string | null
          role: Database["public"]["Enums"]["app_role"]
          target_user_id: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          role: Database["public"]["Enums"]["app_role"]
          target_user_id: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          target_user_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_credit_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: string
          reference_id: string | null
          workspace_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind: string
          reference_id?: string | null
          workspace_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          reference_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_credit_transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_credits: {
        Row: {
          balance: number
          created_at: string
          period_start: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          period_start?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          period_start?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_credits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          active: boolean
          id: string
          invited_by: string | null
          joined_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          is_personal: boolean
          logo_url: string | null
          name: string
          owner_user_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_personal?: boolean
          logo_url?: string | null
          name: string
          owner_user_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_personal?: boolean
          logo_url?: string | null
          name?: string
          owner_user_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_referral_paid: {
        Args: { _referred_user_id: string }
        Returns: Json
      }
      apply_workspace_allotment: {
        Args: { _workspace_id: string }
        Returns: undefined
      }
      has_active_paid_subscription: {
        Args: { _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_workspace_admin: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      referral_code_exists: { Args: { _code: string }; Returns: boolean }
      try_consume_agent_credit: {
        Args: {
          _description: string
          _run_id: string
          _user_id: string
          _workspace_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "ceo"
        | "diretor"
        | "gerente"
        | "coordenador"
        | "vendedor"
        | "consultor"
        | "sdr"
        | "super_admin"
        | "admin_empresa"
        | "cliente"
      billing_cycle: "monthly" | "yearly"
      payment_provider:
        | "stripe"
        | "mercadopago"
        | "asaas"
        | "pagseguro"
        | "manual"
      plan_tier: "smart" | "pro" | "enterprise"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "expired"
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
      app_role: [
        "admin",
        "ceo",
        "diretor",
        "gerente",
        "coordenador",
        "vendedor",
        "consultor",
        "sdr",
        "super_admin",
        "admin_empresa",
        "cliente",
      ],
      billing_cycle: ["monthly", "yearly"],
      payment_provider: [
        "stripe",
        "mercadopago",
        "asaas",
        "pagseguro",
        "manual",
      ],
      plan_tier: ["smart", "pro", "enterprise"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "expired",
      ],
    },
  },
} as const
