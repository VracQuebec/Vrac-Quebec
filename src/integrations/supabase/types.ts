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
      blacklist_entries: {
        Row: {
          active: boolean
          blocked_at: string
          blocked_by: string | null
          blocked_by_email: string | null
          created_at: string
          entity_id: string
          entity_label: string | null
          entity_type: string
          id: string
          note: string | null
          reasons: string[]
          unblock_note: string | null
          unblocked_at: string | null
          unblocked_by: string | null
          unblocked_by_email: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          blocked_at?: string
          blocked_by?: string | null
          blocked_by_email?: string | null
          created_at?: string
          entity_id: string
          entity_label?: string | null
          entity_type: string
          id?: string
          note?: string | null
          reasons?: string[]
          unblock_note?: string | null
          unblocked_at?: string | null
          unblocked_by?: string | null
          unblocked_by_email?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          blocked_at?: string
          blocked_by?: string | null
          blocked_by_email?: string | null
          created_at?: string
          entity_id?: string
          entity_label?: string | null
          entity_type?: string
          id?: string
          note?: string | null
          reasons?: string[]
          unblock_note?: string | null
          unblocked_at?: string | null
          unblocked_by?: string | null
          unblocked_by_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      blacklist_history: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_label: string | null
          entity_type: string
          entry_id: string | null
          id: string
          note: string | null
          reasons: string[] | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_label?: string | null
          entity_type: string
          entry_id?: string | null
          id?: string
          note?: string | null
          reasons?: string[] | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_label?: string | null
          entity_type?: string
          entry_id?: string | null
          id?: string
          note?: string | null
          reasons?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "blacklist_history_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "blacklist_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_author_emails: {
        Row: {
          author_id: string
          created_at: string
          email: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          created_at?: string
          email?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          created_at?: string
          email?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_author_emails_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: true
            referencedRelation: "blog_authors"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_authors: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          id: string
          name: string
          slug: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      blog_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          meta_description: string | null
          meta_title: string | null
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "blog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_post_ideas: {
        Row: {
          category: string
          created_at: string
          created_post_id: string | null
          description: string
          id: string
          monthly_searches: number | null
          notes: string | null
          planned_publish_date: string | null
          primary_keyword: string
          priority: number
          search_intent: string
          secondary_keywords: string[]
          seo_difficulty: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_post_id?: string | null
          description: string
          id?: string
          monthly_searches?: number | null
          notes?: string | null
          planned_publish_date?: string | null
          primary_keyword: string
          priority?: number
          search_intent: string
          secondary_keywords?: string[]
          seo_difficulty: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_post_id?: string | null
          description?: string
          id?: string
          monthly_searches?: number | null
          notes?: string | null
          planned_publish_date?: string | null
          primary_keyword?: string
          priority?: number
          search_intent?: string
          secondary_keywords?: string[]
          seo_difficulty?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_post_ideas_created_post_id_fkey"
            columns: ["created_post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_post_related: {
        Row: {
          post_id: string
          related_post_id: string
          sort_order: number
        }
        Insert: {
          post_id: string
          related_post_id: string
          sort_order?: number
        }
        Update: {
          post_id?: string
          related_post_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "blog_post_related_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_post_related_related_post_id_fkey"
            columns: ["related_post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_post_tags: {
        Row: {
          post_id: string
          tag_id: string
        }
        Insert: {
          post_id: string
          tag_id: string
        }
        Update: {
          post_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_post_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_post_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "blog_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_post_views: {
        Row: {
          id: string
          ip_hash: string | null
          post_id: string
          referrer: string | null
          user_agent: string | null
          viewed_at: string
        }
        Insert: {
          id?: string
          ip_hash?: string | null
          post_id: string
          referrer?: string | null
          user_agent?: string | null
          viewed_at?: string
        }
        Update: {
          id?: string
          ip_hash?: string | null
          post_id?: string
          referrer?: string | null
          user_agent?: string | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_id: string | null
          canonical_url: string | null
          category_id: string | null
          content: string
          content_format: string
          cover_image_alt: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          excerpt: string | null
          gallery: Json
          id: string
          is_featured: boolean
          is_popular: boolean
          meta_description: string | null
          meta_title: string | null
          noindex: boolean
          og_image_url: string | null
          previous_slugs: string[]
          published_at: string | null
          reading_time_minutes: number
          scheduled_at: string | null
          search_tsv: unknown
          slug: string
          status: Database["public"]["Enums"]["blog_post_status"]
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          author_id?: string | null
          canonical_url?: string | null
          category_id?: string | null
          content?: string
          content_format?: string
          cover_image_alt?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          gallery?: Json
          id?: string
          is_featured?: boolean
          is_popular?: boolean
          meta_description?: string | null
          meta_title?: string | null
          noindex?: boolean
          og_image_url?: string | null
          previous_slugs?: string[]
          published_at?: string | null
          reading_time_minutes?: number
          scheduled_at?: string | null
          search_tsv?: unknown
          slug: string
          status?: Database["public"]["Enums"]["blog_post_status"]
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          author_id?: string | null
          canonical_url?: string | null
          category_id?: string | null
          content?: string
          content_format?: string
          cover_image_alt?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          gallery?: Json
          id?: string
          is_featured?: boolean
          is_popular?: boolean
          meta_description?: string | null
          meta_title?: string | null
          noindex?: boolean
          og_image_url?: string | null
          previous_slugs?: string[]
          published_at?: string | null
          reading_time_minutes?: number
          scheduled_at?: string | null
          search_tsv?: unknown
          slug?: string
          status?: Database["public"]["Enums"]["blog_post_status"]
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "blog_authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "blog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_tags: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          admin_notes: string | null
          client_name: string | null
          client_signature_url: string | null
          created_at: string
          created_by: string | null
          delivery_address: string | null
          dompe_address: string | null
          dompe_number: string | null
          driver_id: string | null
          end_at: string | null
          entrepreneur_id: string | null
          google_event_id: string | null
          id: string
          last_known_lat: number | null
          last_known_lng: number | null
          loading_address: string | null
          material_type: string | null
          quantity_estimated: string | null
          sms_sent_at: string | null
          special_instructions: string | null
          start_at: string
          status: Database["public"]["Enums"]["calendar_event_status"]
          submission_id: string | null
          title: string
          tonnage_estimated: number | null
          trips_planned: number | null
          truck_id: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          client_name?: string | null
          client_signature_url?: string | null
          created_at?: string
          created_by?: string | null
          delivery_address?: string | null
          dompe_address?: string | null
          dompe_number?: string | null
          driver_id?: string | null
          end_at?: string | null
          entrepreneur_id?: string | null
          google_event_id?: string | null
          id?: string
          last_known_lat?: number | null
          last_known_lng?: number | null
          loading_address?: string | null
          material_type?: string | null
          quantity_estimated?: string | null
          sms_sent_at?: string | null
          special_instructions?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["calendar_event_status"]
          submission_id?: string | null
          title: string
          tonnage_estimated?: number | null
          trips_planned?: number | null
          truck_id?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          client_name?: string | null
          client_signature_url?: string | null
          created_at?: string
          created_by?: string | null
          delivery_address?: string | null
          dompe_address?: string | null
          dompe_number?: string | null
          driver_id?: string | null
          end_at?: string | null
          entrepreneur_id?: string | null
          google_event_id?: string | null
          id?: string
          last_known_lat?: number | null
          last_known_lng?: number | null
          loading_address?: string | null
          material_type?: string | null
          quantity_estimated?: string | null
          sms_sent_at?: string | null
          special_instructions?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["calendar_event_status"]
          submission_id?: string | null
          title?: string
          tonnage_estimated?: number | null
          trips_planned?: number | null
          truck_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_entrepreneur_id_fkey"
            columns: ["entrepreneur_id"]
            isOneToOne: false
            referencedRelation: "entrepreneurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
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
      drivers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["driver_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["driver_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["driver_status"]
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
      entrepreneur_profiles: {
        Row: {
          average_volume: string
          created_at: string
          distance_surcharge: number | null
          equipment: string[]
          id: string
          internal_notes: string
          materials_transported: string[]
          partner_status: string
          price_10w: number | null
          price_12w: number | null
          price_6w: number | null
          price_semi: number | null
          price_trailer_2: number | null
          price_trailer_3: number | null
          price_trailer_4: number | null
          updated_at: string
          user_id: string
          wait_time_price: number | null
        }
        Insert: {
          average_volume?: string
          created_at?: string
          distance_surcharge?: number | null
          equipment?: string[]
          id?: string
          internal_notes?: string
          materials_transported?: string[]
          partner_status?: string
          price_10w?: number | null
          price_12w?: number | null
          price_6w?: number | null
          price_semi?: number | null
          price_trailer_2?: number | null
          price_trailer_3?: number | null
          price_trailer_4?: number | null
          updated_at?: string
          user_id: string
          wait_time_price?: number | null
        }
        Update: {
          average_volume?: string
          created_at?: string
          distance_surcharge?: number | null
          equipment?: string[]
          id?: string
          internal_notes?: string
          materials_transported?: string[]
          partner_status?: string
          price_10w?: number | null
          price_12w?: number | null
          price_6w?: number | null
          price_semi?: number | null
          price_trailer_2?: number | null
          price_trailer_3?: number | null
          price_trailer_4?: number | null
          updated_at?: string
          user_id?: string
          wait_time_price?: number | null
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
          amount_paid: number
          created_at: string
          delivery_date: string | null
          description: string
          due_date: string | null
          due_days: number
          entrepreneur_id: string | null
          id: string
          invoice_number: string
          material: string
          notes: string
          payment_date: string | null
          payment_method: string
          payment_status: string
          price_per_trip: number
          submission_id: string | null
          taxable: boolean
          total_price: number
          total_with_tax: number
          tps_amount: number
          tps_rate: number
          trip_type: string
          trips_count: number
          tvq_amount: number
          tvq_rate: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          delivery_date?: string | null
          description?: string
          due_date?: string | null
          due_days?: number
          entrepreneur_id?: string | null
          id?: string
          invoice_number?: string
          material?: string
          notes?: string
          payment_date?: string | null
          payment_method?: string
          payment_status?: string
          price_per_trip?: number
          submission_id?: string | null
          taxable?: boolean
          total_price?: number
          total_with_tax?: number
          tps_amount?: number
          tps_rate?: number
          trip_type?: string
          trips_count?: number
          tvq_amount?: number
          tvq_rate?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          delivery_date?: string | null
          description?: string
          due_date?: string | null
          due_days?: number
          entrepreneur_id?: string | null
          id?: string
          invoice_number?: string
          material?: string
          notes?: string
          payment_date?: string | null
          payment_method?: string
          payment_status?: string
          price_per_trip?: number
          submission_id?: string | null
          taxable?: boolean
          total_price?: number
          total_with_tax?: number
          tps_amount?: number
          tps_rate?: number
          trip_type?: string
          trips_count?: number
          tvq_amount?: number
          tvq_rate?: number
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
          city: string | null
          company: string | null
          contamination: string | null
          created_at: string
          created_by: string | null
          creation_origin: string
          deliver_or_remove: string | null
          delivery_deadline: string | null
          delivery_timeframe: string | null
          depth_in: string | null
          description: string | null
          desired_date: string | null
          dompe_number: string | null
          email: string
          formatted_address: string | null
          geocoding_provider: string | null
          geocoding_status: string
          id: string
          internal_notes: string
          latitude: number | null
          latitude_old: number | null
          lead_category: string | null
          lead_source: string | null
          length_ft: string | null
          location_type: string | null
          longitude: number | null
          longitude_old: number | null
          machinery_available: boolean | null
          machinery_description: string | null
          materials: string[]
          name: string
          other_material: string | null
          phone: string | null
          photos: string[] | null
          place_id: string | null
          postal_code: string | null
          postal_latitude: number | null
          postal_latitude_old: number | null
          postal_longitude: number | null
          postal_longitude_old: number | null
          priority: string
          property_type: string
          province: string | null
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
          city?: string | null
          company?: string | null
          contamination?: string | null
          created_at?: string
          created_by?: string | null
          creation_origin?: string
          deliver_or_remove?: string | null
          delivery_deadline?: string | null
          delivery_timeframe?: string | null
          depth_in?: string | null
          description?: string | null
          desired_date?: string | null
          dompe_number?: string | null
          email: string
          formatted_address?: string | null
          geocoding_provider?: string | null
          geocoding_status?: string
          id?: string
          internal_notes?: string
          latitude?: number | null
          latitude_old?: number | null
          lead_category?: string | null
          lead_source?: string | null
          length_ft?: string | null
          location_type?: string | null
          longitude?: number | null
          longitude_old?: number | null
          machinery_available?: boolean | null
          machinery_description?: string | null
          materials: string[]
          name: string
          other_material?: string | null
          phone?: string | null
          photos?: string[] | null
          place_id?: string | null
          postal_code?: string | null
          postal_latitude?: number | null
          postal_latitude_old?: number | null
          postal_longitude?: number | null
          postal_longitude_old?: number | null
          priority?: string
          property_type: string
          province?: string | null
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
          city?: string | null
          company?: string | null
          contamination?: string | null
          created_at?: string
          created_by?: string | null
          creation_origin?: string
          deliver_or_remove?: string | null
          delivery_deadline?: string | null
          delivery_timeframe?: string | null
          depth_in?: string | null
          description?: string | null
          desired_date?: string | null
          dompe_number?: string | null
          email?: string
          formatted_address?: string | null
          geocoding_provider?: string | null
          geocoding_status?: string
          id?: string
          internal_notes?: string
          latitude?: number | null
          latitude_old?: number | null
          lead_category?: string | null
          lead_source?: string | null
          length_ft?: string | null
          location_type?: string | null
          longitude?: number | null
          longitude_old?: number | null
          machinery_available?: boolean | null
          machinery_description?: string | null
          materials?: string[]
          name?: string
          other_material?: string | null
          phone?: string | null
          photos?: string[] | null
          place_id?: string | null
          postal_code?: string | null
          postal_latitude?: number | null
          postal_latitude_old?: number | null
          postal_longitude?: number | null
          postal_longitude_old?: number | null
          priority?: string
          property_type?: string
          province?: string | null
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
      submissions_geo_backup: {
        Row: {
          address: string | null
          backed_up_at: string
          backup_label: string
          formatted_address: string | null
          geocoding_provider: string | null
          geocoding_status: string | null
          id: string
          latitude: number | null
          location_type: string | null
          longitude: number | null
          place_id: string | null
          postal_code: string | null
          postal_latitude: number | null
          postal_longitude: number | null
          submission_id: string
          submission_number: number | null
        }
        Insert: {
          address?: string | null
          backed_up_at?: string
          backup_label?: string
          formatted_address?: string | null
          geocoding_provider?: string | null
          geocoding_status?: string | null
          id?: string
          latitude?: number | null
          location_type?: string | null
          longitude?: number | null
          place_id?: string | null
          postal_code?: string | null
          postal_latitude?: number | null
          postal_longitude?: number | null
          submission_id: string
          submission_number?: number | null
        }
        Update: {
          address?: string | null
          backed_up_at?: string
          backup_label?: string
          formatted_address?: string | null
          geocoding_provider?: string | null
          geocoding_status?: string | null
          id?: string
          latitude?: number | null
          location_type?: string | null
          longitude?: number | null
          place_id?: string | null
          postal_code?: string | null
          postal_latitude?: number | null
          postal_longitude?: number | null
          submission_id?: string
          submission_number?: number | null
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
      trucks: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          notes: string | null
          plate: string | null
          type: Database["public"]["Enums"]["truck_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          plate?: string | null
          type?: Database["public"]["Enums"]["truck_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          plate?: string | null
          type?: Database["public"]["Enums"]["truck_type"]
          updated_at?: string
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
      blog_increment_view: { Args: { _post_id: string }; Returns: undefined }
      blog_search: {
        Args: { _limit?: number; _query: string }
        Returns: {
          category_id: string
          cover_image_url: string
          excerpt: string
          id: string
          published_at: string
          rank: number
          reading_time_minutes: number
          slug: string
          title: string
        }[]
      }
      blog_slugify: { Args: { input: string }; Returns: string }
      current_user_email: { Args: never; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
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
      is_blacklisted: {
        Args: { _entity_id: string; _entity_type: string }
        Returns: boolean
      }
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
      unaccent_string: { Args: { input: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "user" | "entrepreneur"
      blog_post_status: "draft" | "published" | "scheduled" | "archived"
      calendar_event_status:
        | "a_planifier"
        | "planifie"
        | "en_cours"
        | "termine"
        | "reporte"
        | "annule"
      driver_status: "disponible" | "occupe" | "inactif"
      truck_type:
        | "6_roues"
        | "10_roues"
        | "12_roues"
        | "semi_remorque"
        | "fardier"
        | "autre"
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
      blog_post_status: ["draft", "published", "scheduled", "archived"],
      calendar_event_status: [
        "a_planifier",
        "planifie",
        "en_cours",
        "termine",
        "reporte",
        "annule",
      ],
      driver_status: ["disponible", "occupe", "inactif"],
      truck_type: [
        "6_roues",
        "10_roues",
        "12_roues",
        "semi_remorque",
        "fardier",
        "autre",
      ],
    },
  },
} as const
