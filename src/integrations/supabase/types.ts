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
            isOneToOne: true
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
          capacity_lph: number | null
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
          sales_rep_id: string | null
          updated_at: string
          water_analysis_file_url: string | null
          water_analysis_notes: string | null
        }
        Insert: {
          additional_notes?: string | null
          agreed_delivery_date: string
          agreed_price: number
          assembly_engineer_id?: string | null
          capacity_lph?: number | null
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
          sales_rep_id?: string | null
          updated_at?: string
          water_analysis_file_url?: string | null
          water_analysis_notes?: string | null
        }
        Update: {
          additional_notes?: string | null
          agreed_delivery_date?: string
          agreed_price?: number
          assembly_engineer_id?: string | null
          capacity_lph?: number | null
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
          sales_rep_id?: string | null
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
      inventory: {
        Row: {
          buying_price: number | null
          created_at: string
          id: string
          in_stock: number
          model: string | null
          product_name: string
          selling_price: number | null
          updated_at: string
        }
        Insert: {
          buying_price?: number | null
          created_at?: string
          id?: string
          in_stock?: number
          model?: string | null
          product_name?: string
          selling_price?: number | null
          updated_at?: string
        }
        Update: {
          buying_price?: number | null
          created_at?: string
          id?: string
          in_stock?: number
          model?: string | null
          product_name?: string
          selling_price?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          balance: number | null
          client_name: string
          created_at: string
          date: string
          id: string
          invoice_no: string
          machine: string | null
          rep_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          balance?: number | null
          client_name?: string
          created_at?: string
          date?: string
          id?: string
          invoice_no?: string
          machine?: string | null
          rep_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          balance?: number | null
          client_name?: string
          created_at?: string
          date?: string
          id?: string
          invoice_no?: string
          machine?: string | null
          rep_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          outcome_note: string | null
          reached: boolean
          rep_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          outcome_note?: string | null
          reached?: boolean
          rep_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          outcome_note?: string | null
          reached?: boolean
          rep_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          deal_value: number | null
          follow_up_due_at: string | null
          id: string
          location: string | null
          machine_interest: string | null
          name: string
          phone: string
          rep_id: string | null
          source: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deal_value?: number | null
          follow_up_due_at?: string | null
          id?: string
          location?: string | null
          machine_interest?: string | null
          name?: string
          phone?: string
          rep_id?: string | null
          source?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deal_value?: number | null
          follow_up_due_at?: string | null
          id?: string
          location?: string | null
          machine_interest?: string | null
          name?: string
          phone?: string
          rep_id?: string | null
          source?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_capacities: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      machine_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      machine_types: {
        Row: {
          active: boolean
          category_id: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_types_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "machine_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_targets: {
        Row: {
          created_at: string
          deals_target: number
          id: string
          month: string
          revenue_target: number
          set_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deals_target?: number
          id?: string
          month: string
          revenue_target?: number
          set_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deals_target?: number
          id?: string
          month?: string
          revenue_target?: number
          set_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_targets_set_by_fkey"
            columns: ["set_by"]
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
          recorded_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          fulfillment_id: string
          id?: string
          notes?: string | null
          paid_at?: string
          recorded_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          fulfillment_id?: string
          id?: string
          notes?: string | null
          paid_at?: string
          recorded_by?: string | null
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
      projects: {
        Row: {
          balance: number | null
          client_name: string | null
          created_at: string
          created_by: string | null
          date: string
          id: string
          location: string | null
          machine_description: string | null
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          balance?: number | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          location?: string | null
          machine_description?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          balance?: number | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          location?: string | null
          machine_description?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recordings: {
        Row: {
          audio_file_url: string
          created_at: string
          deal_id: string | null
          id: string
          uploaded_by: string | null
        }
        Insert: {
          audio_file_url: string
          created_at?: string
          deal_id?: string | null
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          audio_file_url?: string
          created_at?: string
          deal_id?: string | null
          id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recordings_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recordings_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          area: string | null
          county: string | null
          created_at: string
          id: string
          last_contact_date: string | null
          next_follow_up_date: string | null
          rep_id: string | null
          school_name: string
          status: string
          tier: string | null
          updated_at: string
          visit_count: number
        }
        Insert: {
          area?: string | null
          county?: string | null
          created_at?: string
          id?: string
          last_contact_date?: string | null
          next_follow_up_date?: string | null
          rep_id?: string | null
          school_name?: string
          status?: string
          tier?: string | null
          updated_at?: string
          visit_count?: number
        }
        Update: {
          area?: string | null
          county?: string | null
          created_at?: string
          id?: string
          last_contact_date?: string | null
          next_follow_up_date?: string | null
          rep_id?: string | null
          school_name?: string
          status?: string
          tier?: string | null
          updated_at?: string
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "schools_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          client_name: string
          contact: string | null
          created_at: string
          id: string
          last_service_date: string | null
          machine_type: string | null
          next_due_date: string | null
          recorded_by: string | null
          updated_at: string
          visit_count: number
        }
        Insert: {
          client_name?: string
          contact?: string | null
          created_at?: string
          id?: string
          last_service_date?: string | null
          machine_type?: string | null
          next_due_date?: string | null
          recorded_by?: string | null
          updated_at?: string
          visit_count?: number
        }
        Update: {
          client_name?: string
          contact?: string | null
          created_at?: string
          id?: string
          last_service_date?: string | null
          machine_type?: string | null
          next_due_date?: string | null
          recorded_by?: string | null
          updated_at?: string
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "services_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visit_photos: {
        Row: {
          caption: string | null
          id: string
          photo_url: string
          site_visit_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          id?: string
          photo_url: string
          site_visit_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          id?: string
          photo_url?: string
          site_visit_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_visit_photos_site_visit_id_fkey"
            columns: ["site_visit_id"]
            isOneToOne: false
            referencedRelation: "site_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visit_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visits: {
        Row: {
          checklist: Json
          client_name: string
          created_at: string
          created_by: string | null
          deal_id: string | null
          engineer_id: string | null
          id: string
          location: string | null
          notes: string | null
          status: string
          updated_at: string
          visit_date: string
          visit_type: string
        }
        Insert: {
          checklist?: Json
          client_name: string
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          engineer_id?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
          visit_date?: string
          visit_type?: string
        }
        Update: {
          checklist?: Json
          client_name?: string
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          engineer_id?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
          visit_date?: string
          visit_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_visits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_engineer_id_fkey"
            columns: ["engineer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      transcripts: {
        Row: {
          applied_at: string | null
          coaching_notes: string | null
          created_at: string
          id: string
          recording_id: string
          score: number | null
          transcript_text: string | null
        }
        Insert: {
          applied_at?: string | null
          coaching_notes?: string | null
          created_at?: string
          id?: string
          recording_id: string
          score?: number | null
          transcript_text?: string | null
        }
        Update: {
          applied_at?: string | null
          coaching_notes?: string | null
          created_at?: string
          id?: string
          recording_id?: string
          score?: number | null
          transcript_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_recipients: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          phone: string
          region: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          phone: string
          region?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          phone?: string
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_sequence_steps: {
        Row: {
          created_at: string
          delay_hours: number
          id: string
          position: number
          sequence_id: string
          template_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delay_hours?: number
          id?: string
          position?: number
          sequence_id: string
          template_text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delay_hours?: number
          id?: string
          position?: number
          sequence_id?: string
          template_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sequences: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
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
      is_crm_manager: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "sales_rep"
        | "chief_engineer"
        | "engineer"
        | "admin"
        | "sales_manager"
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
      app_role: [
        "sales_rep",
        "chief_engineer",
        "engineer",
        "admin",
        "sales_manager",
      ],
      commission_role: ["sales", "assembly", "installation"],
    },
  },
} as const
