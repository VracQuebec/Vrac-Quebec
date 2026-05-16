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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      custom_fields: {
        Row: {
          created_at: string
          field_type: string
          id: string
          key: string
          label: string
          options: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_type: string
          id?: string
          key: string
          label: string
          options?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_type?: string
          id?: string
          key?: string
          label?: string
          options?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      entrepreneurs: {
        Row: {
          address: string | null
          company: string | null
          created_at: string
          email: string | null
          id: string
          map_number: string | null
          name: string
          notes: string | null
          phone: string | null
          truck_count: string | null
          truck_types: string[] | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          map_number?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          truck_count?: string | null
          truck_types?: string[] | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          map_number?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          truck_count?: string | null
          truck_types?: string[] | null
          user_id?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount_before_tax: number | null
          amount_total: number | null
          category: string | null
          company: string | null
          created_at: string
          expense_date: string | null
          fees: number | null
          id: string
          invoice_number: string | null
          notes: string | null
          tps: number | null
          tvq: number | null
        }
        Insert: {
          amount_before_tax?: number | null
          amount_total?: number | null
          category?: string | null
          company?: string | null
          created_at?: string
          expense_date?: string | null
          fees?: number | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          tps?: number | null
          tvq?: number | null
        }
        Update: {
          amount_before_tax?: number | null
          amount_total?: number | null
          category?: string | null
          company?: string | null
          created_at?: string
          expense_date?: string | null
          fees?: number | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          tps?: number | null
          tvq?: number | null
        }
        Relationships: []
      }
      lead_notes: {
        Row: {
          author_email: string | null
          author_id: string
          created_at: string
          id: string
          note: string
          submission_id: string
        }
        Insert: {
          author_email?: string | null
          author_id: string
          created_at?: string
          id?: string
          note: string
          submission_id: string
        }
        Update: {
          author_email?: string | null
          author_id?: string
          created_at?: string
          id?: string
          note?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_statuses: {
        Row: {
          color: string
          created_at: string
          enabled: boolean
          id: string
          label: string
          sort_order: number
          text_color: string
          updated_at: string
          value: string
        }
        Insert: {
          color?: string
          created_at?: string
          enabled?: boolean
          id?: string
          label: string
          sort_order?: number
          text_color?: string
          updated_at?: string
          value: string
        }
        Update: {
          color?: string
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          sort_order?: number
          text_color?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      lead_trips: {
        Row: {
          created_at: string
          delivery_date: string | null
          entrepreneur_id: string | null
          id: string
          invoice_number: string
          material: string
          notes: string
          payment_date: string | null
          payment_method: string
          payment_status: string
          price_per_trip: number
          submission_id: string
          total_price: number
          trip_type: string
          trips_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_date?: string | null
          entrepreneur_id?: string | null
          id?: string
          invoice_number?: string
          material?: string
          notes?: string
          payment_date?: string | null
          payment_method?: string
          payment_status?: string
          price_per_trip?: number
          submission_id: string
          total_price?: number
          trip_type?: string
          trips_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_date?: string | null
          entrepreneur_id?: string | null
          id?: string
          invoice_number?: string
          material?: string
          notes?: string
          payment_date?: string | null
          payment_method?: string
          payment_status?: string
          price_per_trip?: number
          submission_id?: string
          total_price?: number
          trip_type?: string
          trips_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_trips_entrepreneur_id_fkey"
            columns: ["entrepreneur_id"]
            isOneToOne: false
            referencedRelation: "entrepreneurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_trips_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          charged_to_entrepreneur: number | null
          client_address: string | null
          client_confirmation: string | null
          client_email: string | null
          client_invoiced: string | null
          client_name: string | null
          client_payment_date: string | null
          client_phone: string | null
          created_at: string
          delivery_date: string | null
          entrepreneur_confirmation: string | null
          entrepreneur_invoiced: string | null
          entrepreneur_payment_date: string | null
          id: string
          map_point: string | null
          material: string | null
          notes: string | null
          price_sold: number | null
          total: number | null
          trips: string | null
        }
        Insert: {
          charged_to_entrepreneur?: number | null
          client_address?: string | null
          client_confirmation?: string | null
          client_email?: string | null
          client_invoiced?: string | null
          client_name?: string | null
          client_payment_date?: string | null
          client_phone?: string | null
          created_at?: string
          delivery_date?: string | null
          entrepreneur_confirmation?: string | null
          entrepreneur_invoiced?: string | null
          entrepreneur_payment_date?: string | null
          id?: string
          map_point?: string | null
          material?: string | null
          notes?: string | null
          price_sold?: number | null
          total?: number | null
          trips?: string | null
        }
        Update: {
          charged_to_entrepreneur?: number | null
          client_address?: string | null
          client_confirmation?: string | null
          client_email?: string | null
          client_invoiced?: string | null
          client_name?: string | null
          client_payment_date?: string | null
          client_phone?: string | null
          created_at?: string
          delivery_date?: string | null
          entrepreneur_confirmation?: string | null
          entrepreneur_invoiced?: string | null
          entrepreneur_payment_date?: string | null
          id?: string
          map_point?: string | null
          material?: string | null
          notes?: string | null
          price_sold?: number | null
          total?: number | null
          trips?: string | null
        }
        Relationships: []
      }
      submission_audit_log: {
        Row: {
          changed_at: string
          field_key: string
          field_label: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          submission_id: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          changed_at?: string
          field_key: string
          field_label?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          submission_id: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          changed_at?: string
          field_key?: string
          field_label?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          submission_id?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submission_audit_log_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_custom_values: {
        Row: {
          field_id: string
          id: string
          submission_id: string
          updated_at: string
          value: Json | null
        }
        Insert: {
          field_id: string
          id?: string
          submission_id: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          field_id?: string
          id?: string
          submission_id?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "submission_custom_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "custom_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_custom_values_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          accessibility: string[] | null
          address: string
          assigned_entrepreneur: string | null
          budget_max: string | null
          budget_unit: string | null
          contamination: string | null
          created_at: string
          deliver_or_remove: string | null
          delivery_deadline: string | null
          delivery_timeframe: string | null
          depth_in: string | null
          description: string | null
          dompe_number: string | null
          email: string
          id: string
          internal_notes: string
          latitude: number | null
          length_ft: string | null
          longitude: number | null
          machinery_available: boolean | null
          machinery_description: string | null
          materials: string[]
          name: string
          other_material: string | null
          phone: string | null
          photos: string[] | null
          postal_code: string | null
          priority: string
          property_type: string
          quantity: string
          request_type: string
          show_on_admin_map: boolean
          status: string
          submission_number: number
          tonnage: string
          visible_to_entrepreneur: boolean
          width_ft: string | null
        }
        Insert: {
          accessibility?: string[] | null
          address: string
          assigned_entrepreneur?: string | null
          budget_max?: string | null
          budget_unit?: string | null
          contamination?: string | null
          created_at?: string
          deliver_or_remove?: string | null
          delivery_deadline?: string | null
          delivery_timeframe?: string | null
          depth_in?: string | null
          description?: string | null
          dompe_number?: string | null
          email: string
          id?: string
          internal_notes?: string
          latitude?: number | null
          length_ft?: string | null
          longitude?: number | null
          machinery_available?: boolean | null
          machinery_description?: string | null
          materials: string[]
          name: string
          other_material?: string | null
          phone?: string | null
          photos?: string[] | null
          postal_code?: string | null
          priority?: string
          property_type: string
          quantity: string
          request_type?: string
          show_on_admin_map?: boolean
          status?: string
          submission_number?: number
          tonnage: string
          visible_to_entrepreneur?: boolean
          width_ft?: string | null
        }
        Update: {
          accessibility?: string[] | null
          address?: string
          assigned_entrepreneur?: string | null
          budget_max?: string | null
          budget_unit?: string | null
          contamination?: string | null
          created_at?: string
          deliver_or_remove?: string | null
          delivery_deadline?: string | null
          delivery_timeframe?: string | null
          depth_in?: string | null
          description?: string | null
          dompe_number?: string | null
          email?: string
          id?: string
          internal_notes?: string
          latitude?: number | null
          length_ft?: string | null
          longitude?: number | null
          machinery_available?: boolean | null
          machinery_description?: string | null
          materials?: string[]
          name?: string
          other_material?: string | null
          phone?: string | null
          photos?: string[] | null
          postal_code?: string | null
          priority?: string
          property_type?: string
          quantity?: string
          request_type?: string
          show_on_admin_map?: boolean
          status?: string
          submission_number?: number
          tonnage?: string
          visible_to_entrepreneur?: boolean
          width_ft?: string | null
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          approved: boolean
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          approved?: boolean
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          approved?: boolean
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_email: { Args: never; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_entrepreneur_leads: {
        Args: never
        Returns: {
          accessibility: string[]
          contamination: string
          created_at: string
          deliver_or_remove: string
          dompe_number: string
          id: string
          is_assigned: boolean
          latitude: number
          longitude: number
          machinery_available: boolean
          machinery_description: string
          materials: string[]
          other_material: string
          postal_prefix: string
          priority: string
          property_type: string
          quantity: string
          request_type: string
          status: string
          submission_number: number
          tonnage: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved_entrepreneur: { Args: { _uid: string }; Returns: boolean }
      list_users_with_roles: {
        Args: never
        Returns: {
          approved: boolean
          created_at: string
          email: string
          roles: Database["public"]["Enums"]["app_role"][]
          user_id: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "entrepreneur"
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
      app_role: ["admin", "user", "entrepreneur"],
    },
  },
} as const
