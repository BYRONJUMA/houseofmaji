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
      commissions: {
        Row: {
          amount: number
          computed_at: string
          fulfillment_id: string
          id: string
          paid: boolean
          paid_at: string | null
          role: Database["public"]["Enums"]["commission_role"]
          user_id: string
        }
        Insert: {
          amount: number
          computed_at?: string
          fulfillment_id: string
          id?: string
          paid?: boolean
          paid_at?: string | null
          role: Database["public"]["Enums"]["commission_role"]
          user_id: string
        }
        Update: {
          amount?: number
          computed_at?: string
          fulfillment_id?: string
          id?: string
          paid?: boolean
          paid_at?: string | null
          role?: Database["public"]["Enums"]["commission_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            isOneToOne: false
            referencedRelation: "fulfillments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_checklists: {
        Row: {
          capacity_lph: number | null
          chief_signoff_at: string | null
          chief_signoff_name: string | null
          client_signature_data: string | null
          client_signoff_at: string | null
          completed_at: string | null
          created_at: string
          date_delivered: string | null
          delivery_no: string
          engineer_signoff_at: string | null
          engineer_signoff_name: string | null
          fulfillment_id: string
          id: string
          machine_serial_no: string
          remarks: string | null
          sections: Json
          started_at: string
          started_by: string | null
          updated_at: string
        }
        Insert: {
          capacity_lph?: number | null
          chief_signoff_at?: string | null
          chief_signoff_name?: string | null
          client_signature_data?: string | null
          client_signoff_at?: string | null
          completed_at?: string | null
          created_at?: string
          date_delivered?: string | null
          delivery_no?: string
          engineer_signoff_at?: string | null
          engineer_signoff_name?: string | null
          fulfillment_id: string
          id?: string
          machine_serial_no?: string
          remarks?: string | null
          sections?: Json
          started_at?: string
          started_by?: string | null
          updated_at?: string
        }
        Update: {
          capacity_lph?: number | null
          chief_signoff_at?: string | null
          chief_signoff_name?: string | null
          client_signature_data?: string | null
          client_signoff_at?: string | null
          completed_at?: string | null
          created_at?: string
          date_delivered?: string | null
          delivery_no?: string
          engineer_signoff_at?: string | null
          engineer_signoff_name?: string | null
          fulfillment_id?: string
          id?: string
          machine_serial_no?: string
          remarks?: string | null
          sections?: Json
          started_at?: string
          started_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_checklists_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            isOneToOne: false
            referencedRelation: "fulfillments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_checklists_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillments: {
        Row: {
          additional_notes: string | null
          agreed_delivery_date: string
          agreed_price: number
          assembly_engineer_id: string | null
          chief_engineer_id: string | null
          client_contact: string | null
          client_name: string
          created_at: string
          current_stage: string
          frame_ordered_at: string | null
          id: string
          installation_engineer_id: string | null
          location: string
          machine_type: string
          sales_rep_id: string
          updated_at: string
          water_analysis_file_url: string | null
          water_analysis_notes: string | null
        }
        Insert: {
          additional_notes?: string | null
          agreed_delivery_date: string
          agreed_price: number
          assembly_engineer_id?: string | null
          chief_engineer_id?: string | null
          client_contact?: string | null
          client_name: string
          created_at?: string
          current_stage?: string
          frame_ordered_at?: string | null
          id?: string
          installation_engineer_id?: string | null
          location: string
          machine_type: string
          sales_rep_id: string
          updated_at?: string
          water_analysis_file_url?: string | null
          water_analysis_notes?: string | null
        }
        Update: {
          additional_notes?: string | null
          agreed_delivery_date?: string
          agreed_price?: number
          assembly_engineer_id?: string | null
          chief_engineer_id?: string | null
          client_contact?: string | null
          client_name?: string
          created_at?: string
          current_stage?: string
          frame_ordered_at?: string | null
          id?: string
          installation_engineer_id?: string | null
          location?: string
          machine_type?: string
          sales_rep_id?: string
          updated_at?: string
          water_analysis_file_url?: string | null
          water_analysis_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fulfillments_assembly_engineer_id_fkey"
            columns: ["assembly_engineer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillments_chief_engineer_id_fkey"
            columns: ["chief_engineer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillments_installation_engineer_id_fkey"
            columns: ["installation_engineer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillments_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          fulfillment_id: string | null
          id: string
          message: string
          read: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          fulfillment_id?: string | null
          id?: string
          message: string
          read?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          fulfillment_id?: string | null
          id?: string
          message?: string
          read?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            isOneToOne: false
            referencedRelation: "fulfillments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          fulfillment_id: string
          id: string
          notes: string | null
          paid_at: string
          recorded_by: string
        }
        Insert: {
          amount: number
          created_at?: string
          fulfillment_id: string
          id?: string
          notes?: string | null
          paid_at?: string
          recorded_by: string
        }
        Update: {
          amount?: number
          created_at?: string
          fulfillment_id?: string
          id?: string
          notes?: string | null
          paid_at?: string
          recorded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            isOneToOne: false
            referencedRelation: "fulfillments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      stage_events: {
        Row: {
          actor_id: string | null
          entered_at: string
          exited_at: string | null
          fulfillment_id: string
          id: string
          notes: string | null
          stage: string
        }
        Insert: {
          actor_id?: string | null
          entered_at?: string
          exited_at?: string | null
          fulfillment_id: string
          id?: string
          notes?: string | null
          stage: string
        }
        Update: {
          actor_id?: string | null
          entered_at?: string
          exited_at?: string | null
          fulfillment_id?: string
          id?: string
          notes?: string | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_events_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            isOneToOne: false
            referencedRelation: "fulfillments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "sales_rep" | "chief_engineer" | "engineer" | "admin"
      commission_role: "sales" | "assembly" | "installation"
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
      app_role: ["sales_rep", "chief_engineer", "engineer", "admin"],
      commission_role: ["sales", "assembly", "installation"],
    },
  },
} as const
