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
      admin_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          level: string
          link: string | null
          meta: Json
          read_at: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          level?: string
          link?: string | null
          meta?: Json
          read_at?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          level?: string
          link?: string | null
          meta?: Json
          read_at?: string | null
          title?: string
        }
        Relationships: []
      }
      ai_cache: {
        Row: {
          cache_key: string
          completion_tokens: number | null
          created_at: string
          estimated_credits_saved: number
          function_name: string | null
          hit_count: number
          last_used_at: string
          model: string
          prompt_tokens: number | null
          response: Json
        }
        Insert: {
          cache_key: string
          completion_tokens?: number | null
          created_at?: string
          estimated_credits_saved?: number
          function_name?: string | null
          hit_count?: number
          last_used_at?: string
          model: string
          prompt_tokens?: number | null
          response: Json
        }
        Update: {
          cache_key?: string
          completion_tokens?: number | null
          created_at?: string
          estimated_credits_saved?: number
          function_name?: string | null
          hit_count?: number
          last_used_at?: string
          model?: string
          prompt_tokens?: number | null
          response?: Json
        }
        Relationships: []
      }
      ai_call_log: {
        Row: {
          cache_key: string | null
          cached: boolean
          completion_tokens: number | null
          created_at: string
          duration_ms: number | null
          estimated_credits: number
          function_name: string | null
          id: number
          model: string | null
          prompt_tokens: number | null
        }
        Insert: {
          cache_key?: string | null
          cached?: boolean
          completion_tokens?: number | null
          created_at?: string
          duration_ms?: number | null
          estimated_credits?: number
          function_name?: string | null
          id?: number
          model?: string | null
          prompt_tokens?: number | null
        }
        Update: {
          cache_key?: string | null
          cached?: boolean
          completion_tokens?: number | null
          created_at?: string
          duration_ms?: number | null
          estimated_credits?: number
          function_name?: string | null
          id?: number
          model?: string | null
          prompt_tokens?: number | null
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          economy_mode: boolean
          id: number
          updated_at: string
        }
        Insert: {
          economy_mode?: boolean
          id?: number
          updated_at?: string
        }
        Update: {
          economy_mode?: boolean
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
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
      blog_mesh_batches: {
        Row: {
          attempts: number
          created_at: string
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          item_ids: string[]
          kind: string
          max_attempts: number
          next_attempt_at: string | null
          processed_count: number
          run_id: string
          sort_order: number
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          item_ids?: string[]
          kind: string
          max_attempts?: number
          next_attempt_at?: string | null
          processed_count?: number
          run_id: string
          sort_order?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          item_ids?: string[]
          kind?: string
          max_attempts?: number
          next_attempt_at?: string | null
          processed_count?: number
          run_id?: string
          sort_order?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_mesh_batches_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "blog_mesh_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_mesh_runs: {
        Row: {
          batch_size_pages: number
          batch_size_posts: number
          created_at: string
          created_by: string | null
          done_batches: number
          done_items: number
          error: string | null
          failed_items: number
          finished_at: string | null
          id: string
          item_ids: string[]
          last_progress_at: string
          mode: string
          opportunities: Json
          orphan_post_ids: string[]
          started_at: string
          stats: Json
          status: string
          total_batches: number
          total_items: number
        }
        Insert: {
          batch_size_pages?: number
          batch_size_posts?: number
          created_at?: string
          created_by?: string | null
          done_batches?: number
          done_items?: number
          error?: string | null
          failed_items?: number
          finished_at?: string | null
          id?: string
          item_ids?: string[]
          last_progress_at?: string
          mode?: string
          opportunities?: Json
          orphan_post_ids?: string[]
          started_at?: string
          stats?: Json
          status?: string
          total_batches?: number
          total_items?: number
        }
        Update: {
          batch_size_pages?: number
          batch_size_posts?: number
          created_at?: string
          created_by?: string | null
          done_batches?: number
          done_items?: number
          error?: string | null
          failed_items?: number
          finished_at?: string | null
          id?: string
          item_ids?: string[]
          last_progress_at?: string
          mode?: string
          opportunities?: Json
          orphan_post_ids?: string[]
          started_at?: string
          stats?: Json
          status?: string
          total_batches?: number
          total_items?: number
        }
        Relationships: []
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
          mesh_analyzed_at: string | null
          mesh_content_hash: string | null
          mesh_score: number
          meta_description: string | null
          meta_title: string | null
          noindex: boolean
          og_image_url: string | null
          previous_slugs: string[]
          published_at: string | null
          reading_time_minutes: number
          related_city_slugs: string[]
          related_material_slugs: string[]
          related_service_slugs: string[]
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
          mesh_analyzed_at?: string | null
          mesh_content_hash?: string | null
          mesh_score?: number
          meta_description?: string | null
          meta_title?: string | null
          noindex?: boolean
          og_image_url?: string | null
          previous_slugs?: string[]
          published_at?: string | null
          reading_time_minutes?: number
          related_city_slugs?: string[]
          related_material_slugs?: string[]
          related_service_slugs?: string[]
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
          mesh_analyzed_at?: string | null
          mesh_content_hash?: string | null
          mesh_score?: number
          meta_description?: string | null
          meta_title?: string | null
          noindex?: boolean
          og_image_url?: string | null
          previous_slugs?: string[]
          published_at?: string | null
          reading_time_minutes?: number
          related_city_slugs?: string[]
          related_material_slugs?: string[]
          related_service_slugs?: string[]
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
      blog_seo_links: {
        Row: {
          auto_generated: boolean
          blog_post_id: string
          confirmed_by_admin: boolean
          created_at: string
          id: string
          link_direction: string
          match_reasons: Json
          relevance_score: number
          seo_page_id: string
          updated_at: string
        }
        Insert: {
          auto_generated?: boolean
          blog_post_id: string
          confirmed_by_admin?: boolean
          created_at?: string
          id?: string
          link_direction?: string
          match_reasons?: Json
          relevance_score?: number
          seo_page_id: string
          updated_at?: string
        }
        Update: {
          auto_generated?: boolean
          blog_post_id?: string
          confirmed_by_admin?: boolean
          created_at?: string
          id?: string
          link_direction?: string
          match_reasons?: Json
          relevance_score?: number
          seo_page_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_seo_links_blog_post_id_fkey"
            columns: ["blog_post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_seo_links_seo_page_id_fkey"
            columns: ["seo_page_id"]
            isOneToOne: false
            referencedRelation: "seo_bulk_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_seo_links_seo_page_id_fkey"
            columns: ["seo_page_id"]
            isOneToOne: false
            referencedRelation: "seo_gsc_ga4_merged_v"
            referencedColumns: ["page_id"]
          },
          {
            foreignKeyName: "blog_seo_links_seo_page_id_fkey"
            columns: ["seo_page_id"]
            isOneToOne: false
            referencedRelation: "seo_page_triage_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_seo_links_seo_page_id_fkey"
            columns: ["seo_page_id"]
            isOneToOne: false
            referencedRelation: "seo_pages"
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
          fleet_ref_id: string | null
          fleet_ref_type: string | null
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
          vehicle_id: string | null
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
          fleet_ref_id?: string | null
          fleet_ref_type?: string | null
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
          vehicle_id?: string | null
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
          fleet_ref_id?: string | null
          fleet_ref_type?: string | null
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
          vehicle_id?: string | null
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
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
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
          {
            foreignKeyName: "calendar_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      carriers: {
        Row: {
          address: string | null
          archived_at: string | null
          assignee_id: string | null
          base_rate_per_hour: number | null
          base_rate_per_km: number | null
          city: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          insurance_expires_at: string | null
          insurance_policy: string | null
          is_active: boolean
          is_favorite: boolean
          last_activity_at: string | null
          merged_into_id: string | null
          name: string
          notes: string | null
          permit_expires_at: string | null
          permit_number: string | null
          phone: string | null
          postal_code: string | null
          rating: number | null
          service_zones: string[]
          status_label: string
          tags: string[]
          truck_types: string[]
          updated_at: string
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          assignee_id?: string | null
          base_rate_per_hour?: number | null
          base_rate_per_km?: number | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          insurance_expires_at?: string | null
          insurance_policy?: string | null
          is_active?: boolean
          is_favorite?: boolean
          last_activity_at?: string | null
          merged_into_id?: string | null
          name: string
          notes?: string | null
          permit_expires_at?: string | null
          permit_number?: string | null
          phone?: string | null
          postal_code?: string | null
          rating?: number | null
          service_zones?: string[]
          status_label?: string
          tags?: string[]
          truck_types?: string[]
          updated_at?: string
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          assignee_id?: string | null
          base_rate_per_hour?: number | null
          base_rate_per_km?: number | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          insurance_expires_at?: string | null
          insurance_policy?: string | null
          is_active?: boolean
          is_favorite?: boolean
          last_activity_at?: string | null
          merged_into_id?: string | null
          name?: string
          notes?: string | null
          permit_expires_at?: string | null
          permit_number?: string | null
          phone?: string | null
          postal_code?: string | null
          rating?: number | null
          service_zones?: string[]
          status_label?: string
          tags?: string[]
          truck_types?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carriers_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carriers_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "crm_carriers_v"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          archived_at: string | null
          assignee_id: string | null
          city: string | null
          company: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          is_favorite: boolean
          last_activity_at: string | null
          latitude: number | null
          longitude: number | null
          merged_into_id: string | null
          name: string
          notes: string | null
          phone: string | null
          postal_code: string | null
          source: string | null
          status_label: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          assignee_id?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_favorite?: boolean
          last_activity_at?: string | null
          latitude?: number | null
          longitude?: number | null
          merged_into_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          source?: string | null
          status_label?: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          assignee_id?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_favorite?: boolean
          last_activity_at?: string | null
          latitude?: number | null
          longitude?: number | null
          merged_into_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          source?: string | null
          status_label?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "crm_clients_v"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          body: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          due_at: string | null
          id: string
          kind: string
          metadata: Json
          outcome: string | null
          owner_id: string
          owner_type: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          kind: string
          metadata?: Json
          outcome?: string | null
          owner_id: string
          owner_type: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          kind?: string
          metadata?: Json
          outcome?: string | null
          owner_id?: string
          owner_type?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          company_id: string | null
          created_at: string
          field: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          origin: string
          owner_id: string
          owner_type: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          company_id?: string | null
          created_at?: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          origin?: string
          owner_id: string
          owner_type: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          company_id?: string | null
          created_at?: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          origin?: string
          owner_id?: string
          owner_type?: string
        }
        Relationships: []
      }
      crm_documents: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          mime_type: string | null
          owner_id: string
          owner_type: string
          size_bytes: number | null
          title: string | null
          updated_at: string
          uploaded_by: string | null
          url: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          mime_type?: string | null
          owner_id: string
          owner_type: string
          size_bytes?: number | null
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          url: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          owner_id?: string
          owner_type?: string
          size_bytes?: number | null
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          url?: string
        }
        Relationships: []
      }
      crm_notification_settings: {
        Row: {
          categories: Json
          created_at: string
          delays: Json
          options: Json
          push_categories: Json
          scope: string
          updated_at: string
        }
        Insert: {
          categories?: Json
          created_at?: string
          delays?: Json
          options?: Json
          push_categories?: Json
          scope?: string
          updated_at?: string
        }
        Update: {
          categories?: Json
          created_at?: string
          delays?: Json
          options?: Json
          push_categories?: Json
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_notifications: {
        Row: {
          action_url: string | null
          body: string | null
          category: string
          client_name: string | null
          created_at: string
          dedupe_key: string
          due_at: string | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string | null
          id: string
          lead_number: string | null
          meta: Json
          priority: string
          push_error: string | null
          push_sent_at: string | null
          push_status: string
          read_at: string | null
          resolved_at: string | null
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          category: string
          client_name?: string | null
          created_at?: string
          dedupe_key: string
          due_at?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          id?: string
          lead_number?: string | null
          meta?: Json
          priority?: string
          push_error?: string | null
          push_sent_at?: string | null
          push_status?: string
          read_at?: string | null
          resolved_at?: string | null
          status?: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          category?: string
          client_name?: string | null
          created_at?: string
          dedupe_key?: string
          due_at?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          id?: string
          lead_number?: string | null
          meta?: Json
          priority?: string
          push_error?: string | null
          push_sent_at?: string | null
          push_status?: string
          read_at?: string | null
          resolved_at?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_push_subscriptions: {
        Row: {
          auth: string
          categories: Json
          created_at: string
          endpoint: string
          id: string
          is_enabled: boolean
          label: string | null
          last_error: string | null
          last_success_at: string | null
          last_test_at: string | null
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          categories?: Json
          created_at?: string
          endpoint: string
          id?: string
          is_enabled?: boolean
          label?: string | null
          last_error?: string | null
          last_success_at?: string | null
          last_test_at?: string | null
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          categories?: Json
          created_at?: string
          endpoint?: string
          id?: string
          is_enabled?: boolean
          label?: string | null
          last_error?: string | null
          last_success_at?: string | null
          last_test_at?: string | null
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      cron_auth: {
        Row: {
          created_at: string
          id: boolean
          secret: string
        }
        Insert: {
          created_at?: string
          id?: boolean
          secret?: string
        }
        Update: {
          created_at?: string
          id?: boolean
          secret?: string
        }
        Relationships: []
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
      dispatch_rules: {
        Row: {
          active: boolean
          key: string
          label: string
          updated_at: string
          weight: number
        }
        Insert: {
          active?: boolean
          key: string
          label: string
          updated_at?: string
          weight?: number
        }
        Update: {
          active?: boolean
          key?: string
          label?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      dispatch_scenarios: {
        Row: {
          breakdown: Json
          carrier_id: string | null
          chosen_at: string | null
          chosen_by: string | null
          created_at: string
          driver_id: string | null
          dump_id: string | null
          estimated_cost: number | null
          estimated_distance_km: number | null
          estimated_duration_min: number | null
          estimated_margin: number | null
          estimated_revenue: number | null
          expires_at: string
          id: string
          rank: number
          reasons: Json
          score: number
          transport_request_id: string
          trip_id: string | null
          truck_id: string | null
        }
        Insert: {
          breakdown?: Json
          carrier_id?: string | null
          chosen_at?: string | null
          chosen_by?: string | null
          created_at?: string
          driver_id?: string | null
          dump_id?: string | null
          estimated_cost?: number | null
          estimated_distance_km?: number | null
          estimated_duration_min?: number | null
          estimated_margin?: number | null
          estimated_revenue?: number | null
          expires_at?: string
          id?: string
          rank: number
          reasons?: Json
          score?: number
          transport_request_id: string
          trip_id?: string | null
          truck_id?: string | null
        }
        Update: {
          breakdown?: Json
          carrier_id?: string | null
          chosen_at?: string | null
          chosen_by?: string | null
          created_at?: string
          driver_id?: string | null
          dump_id?: string | null
          estimated_cost?: number | null
          estimated_distance_km?: number | null
          estimated_duration_min?: number | null
          estimated_margin?: number | null
          estimated_revenue?: number | null
          expires_at?: string
          id?: string
          rank?: number
          reasons?: Json
          score?: number
          transport_request_id?: string
          trip_id?: string | null
          truck_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_scenarios_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_scenarios_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "crm_carriers_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_scenarios_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_scenarios_dump_id_fkey"
            columns: ["dump_id"]
            isOneToOne: false
            referencedRelation: "crm_dumps_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_scenarios_dump_id_fkey"
            columns: ["dump_id"]
            isOneToOne: false
            referencedRelation: "dumps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_scenarios_transport_request_id_fkey"
            columns: ["transport_request_id"]
            isOneToOne: false
            referencedRelation: "transport_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_scenarios_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_scenarios_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      dompe_availability_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value_int: number | null
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value_int?: number | null
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value_int?: number | null
        }
        Relationships: []
      }
      dompe_public_point_backup: {
        Row: {
          created_at: string
          id: string
          old_public_latitude: number | null
          old_public_longitude: number | null
          old_public_point_updated_at: string | null
          reason: string
          submission_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          old_public_latitude?: number | null
          old_public_longitude?: number | null
          old_public_point_updated_at?: string | null
          reason: string
          submission_id: string
        }
        Update: {
          created_at?: string
          id?: string
          old_public_latitude?: number | null
          old_public_longitude?: number | null
          old_public_point_updated_at?: string | null
          reason?: string
          submission_id?: string
        }
        Relationships: []
      }
      drivers: {
        Row: {
          carrier_id: string | null
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
          carrier_id?: string | null
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
          carrier_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["driver_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drivers_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "crm_carriers_v"
            referencedColumns: ["id"]
          },
        ]
      }
      dumps: {
        Row: {
          accessibility: string[]
          address: string | null
          archived_at: string | null
          assignee_id: string | null
          availability_status: string
          capacity_remaining_m3: number | null
          capacity_total_m3: number | null
          city: string | null
          created_at: string
          equipment: string[]
          id: string
          is_active: boolean
          is_favorite: boolean
          last_activity_at: string | null
          latitude: number | null
          longitude: number | null
          materials_accepted: string[]
          merged_into_id: string | null
          name: string
          notes: string | null
          opening_hours: string | null
          owner_entrepreneur_id: string | null
          photos: string[]
          postal_code: string | null
          price_per_material: Json
          rating: number | null
          status_label: string
          submission_id: string | null
          tags: string[]
          truck_types_allowed: string[]
          updated_at: string
        }
        Insert: {
          accessibility?: string[]
          address?: string | null
          archived_at?: string | null
          assignee_id?: string | null
          availability_status?: string
          capacity_remaining_m3?: number | null
          capacity_total_m3?: number | null
          city?: string | null
          created_at?: string
          equipment?: string[]
          id?: string
          is_active?: boolean
          is_favorite?: boolean
          last_activity_at?: string | null
          latitude?: number | null
          longitude?: number | null
          materials_accepted?: string[]
          merged_into_id?: string | null
          name: string
          notes?: string | null
          opening_hours?: string | null
          owner_entrepreneur_id?: string | null
          photos?: string[]
          postal_code?: string | null
          price_per_material?: Json
          rating?: number | null
          status_label?: string
          submission_id?: string | null
          tags?: string[]
          truck_types_allowed?: string[]
          updated_at?: string
        }
        Update: {
          accessibility?: string[]
          address?: string | null
          archived_at?: string | null
          assignee_id?: string | null
          availability_status?: string
          capacity_remaining_m3?: number | null
          capacity_total_m3?: number | null
          city?: string | null
          created_at?: string
          equipment?: string[]
          id?: string
          is_active?: boolean
          is_favorite?: boolean
          last_activity_at?: string | null
          latitude?: number | null
          longitude?: number | null
          materials_accepted?: string[]
          merged_into_id?: string | null
          name?: string
          notes?: string | null
          opening_hours?: string | null
          owner_entrepreneur_id?: string | null
          photos?: string[]
          postal_code?: string | null
          price_per_material?: Json
          rating?: number | null
          status_label?: string
          submission_id?: string | null
          tags?: string[]
          truck_types_allowed?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dumps_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "crm_dumps_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dumps_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "dumps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dumps_owner_entrepreneur_id_fkey"
            columns: ["owner_entrepreneur_id"]
            isOneToOne: false
            referencedRelation: "entrepreneurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dumps_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "dumps_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
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
          billing_address: string | null
          city: string | null
          company: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_network_visible: boolean
          map_number: string | null
          name: string
          notes: string | null
          phone: string | null
          postal_sector: string | null
          province: string | null
          province_name: string | null
          region: string | null
          tax_tps: string | null
          tax_tvq: string | null
          truck_count: string | null
          truck_types: string[] | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          billing_address?: string | null
          city?: string | null
          company?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_network_visible?: boolean
          map_number?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          postal_sector?: string | null
          province?: string | null
          province_name?: string | null
          region?: string | null
          tax_tps?: string | null
          tax_tvq?: string | null
          truck_count?: string | null
          truck_types?: string[] | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          billing_address?: string | null
          city?: string | null
          company?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_network_visible?: boolean
          map_number?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          postal_sector?: string | null
          province?: string | null
          province_name?: string | null
          region?: string | null
          tax_tps?: string | null
          tax_tvq?: string | null
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
      fleet_costs: {
        Row: {
          amount: number
          company_id: string | null
          cost_type: string
          created_at: string
          id: string
          incurred_on: string
          notes: string | null
          source_id: string | null
          source_table: string | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          amount?: number
          company_id?: string | null
          cost_type: string
          created_at?: string
          id?: string
          incurred_on?: string
          notes?: string | null
          source_id?: string | null
          source_table?: string | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          amount?: number
          company_id?: string | null
          cost_type?: string
          created_at?: string
          id?: string
          incurred_on?: string
          notes?: string | null
          source_id?: string | null
          source_table?: string | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_costs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_expenses: {
        Row: {
          amount: number
          amount_before_tax: number | null
          category: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          document_url: string | null
          engine_hours: number | null
          id: string
          maintenance_id: string | null
          notes: string | null
          odometer_km: number | null
          repair_id: string | null
          spent_on: string
          supplier: string | null
          taxes: number | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          amount?: number
          amount_before_tax?: number | null
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_url?: string | null
          engine_hours?: number | null
          id?: string
          maintenance_id?: string | null
          notes?: string | null
          odometer_km?: number | null
          repair_id?: string | null
          spent_on?: string
          supplier?: string | null
          taxes?: number | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          amount?: number
          amount_before_tax?: number | null
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_url?: string | null
          engine_hours?: number | null
          id?: string
          maintenance_id?: string | null
          notes?: string | null
          odometer_km?: number | null
          repair_id?: string | null
          spent_on?: string
          supplier?: string | null
          taxes?: number | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_expenses_maintenance_id_fkey"
            columns: ["maintenance_id"]
            isOneToOne: false
            referencedRelation: "fleet_maintenance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_expenses_repair_id_fkey"
            columns: ["repair_id"]
            isOneToOne: false
            referencedRelation: "fleet_repairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_expenses_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_inspection_templates: {
        Row: {
          category: string | null
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          points: Json
          updated_at: string
        }
        Insert: {
          category?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          points?: Json
          updated_at?: string
        }
        Update: {
          category?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          points?: Json
          updated_at?: string
        }
        Relationships: []
      }
      fleet_inspections: {
        Row: {
          calendar_event_id: string | null
          checks: Json
          comment: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          driver_id: string | null
          engine_hours: number | null
          has_problem: boolean
          id: string
          inspected_on: string
          odometer_km: number | null
          signature: string | null
          template_id: string | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          calendar_event_id?: string | null
          checks?: Json
          comment?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          engine_hours?: number | null
          has_problem?: boolean
          id?: string
          inspected_on?: string
          odometer_km?: number | null
          signature?: string | null
          template_id?: string | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          calendar_event_id?: string | null
          checks?: Json
          comment?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          engine_hours?: number | null
          has_problem?: boolean
          id?: string
          inspected_on?: string
          odometer_km?: number | null
          signature?: string | null
          template_id?: string | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_inspections_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_inspections_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_inspections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "fleet_inspection_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_inspections_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_maintenance: {
        Row: {
          alert_days_before: number
          alert_hours_margin: number
          alert_km_margin: number
          calendar_event_id: string | null
          company_id: string | null
          completed_engine_hours: number | null
          cost: number
          created_at: string
          created_by: string | null
          document_url: string | null
          engine_hours: number | null
          id: string
          maintenance_type: string
          next_due_date: string | null
          next_due_hours: number | null
          next_due_km: number | null
          next_type: string | null
          notes: string | null
          odometer_km: number | null
          parts_summary: string | null
          performed_on: string | null
          program_id: string | null
          supplier: string | null
          updated_at: string
          vehicle_id: string
          work_done: string | null
        }
        Insert: {
          alert_days_before?: number
          alert_hours_margin?: number
          alert_km_margin?: number
          calendar_event_id?: string | null
          company_id?: string | null
          completed_engine_hours?: number | null
          cost?: number
          created_at?: string
          created_by?: string | null
          document_url?: string | null
          engine_hours?: number | null
          id?: string
          maintenance_type?: string
          next_due_date?: string | null
          next_due_hours?: number | null
          next_due_km?: number | null
          next_type?: string | null
          notes?: string | null
          odometer_km?: number | null
          parts_summary?: string | null
          performed_on?: string | null
          program_id?: string | null
          supplier?: string | null
          updated_at?: string
          vehicle_id: string
          work_done?: string | null
        }
        Update: {
          alert_days_before?: number
          alert_hours_margin?: number
          alert_km_margin?: number
          calendar_event_id?: string | null
          company_id?: string | null
          completed_engine_hours?: number | null
          cost?: number
          created_at?: string
          created_by?: string | null
          document_url?: string | null
          engine_hours?: number | null
          id?: string
          maintenance_type?: string
          next_due_date?: string | null
          next_due_hours?: number | null
          next_due_km?: number | null
          next_type?: string | null
          notes?: string | null
          odometer_km?: number | null
          parts_summary?: string | null
          performed_on?: string | null
          program_id?: string | null
          supplier?: string | null
          updated_at?: string
          vehicle_id?: string
          work_done?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_maintenance_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_maintenance_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "fleet_service_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_maintenance_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_meter_readings: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          engine_hours: number | null
          id: string
          is_correction: boolean
          notes: string | null
          odometer_km: number | null
          read_at: string
          source: string
          source_id: string | null
          source_table: string | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          engine_hours?: number | null
          id?: string
          is_correction?: boolean
          notes?: string | null
          odometer_km?: number | null
          read_at?: string
          source?: string
          source_id?: string | null
          source_table?: string | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          engine_hours?: number | null
          id?: string
          is_correction?: boolean
          notes?: string | null
          odometer_km?: number | null
          read_at?: string
          source?: string
          source_id?: string | null
          source_table?: string | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_meter_readings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_part_refs: {
        Row: {
          brand: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          notes: string | null
          part_number: string | null
          supplier: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          brand?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          part_number?: string | null
          supplier?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          brand?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          part_number?: string | null
          supplier?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_part_refs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_parts: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          installed_on: string | null
          maintenance_id: string | null
          name: string
          notes: string | null
          part_number: string | null
          quantity: number
          repair_id: string | null
          supplier: string | null
          unit_cost: number
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          installed_on?: string | null
          maintenance_id?: string | null
          name: string
          notes?: string | null
          part_number?: string | null
          quantity?: number
          repair_id?: string | null
          supplier?: string | null
          unit_cost?: number
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          installed_on?: string | null
          maintenance_id?: string | null
          name?: string
          notes?: string | null
          part_number?: string | null
          quantity?: number
          repair_id?: string | null
          supplier?: string | null
          unit_cost?: number
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_parts_maintenance_id_fkey"
            columns: ["maintenance_id"]
            isOneToOne: false
            referencedRelation: "fleet_maintenance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_parts_repair_id_fkey"
            columns: ["repair_id"]
            isOneToOne: false
            referencedRelation: "fleet_repairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_parts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_repairs: {
        Row: {
          calendar_event_id: string | null
          company_id: string | null
          completed_date: string | null
          completed_engine_hours: number | null
          cost_actual: number | null
          cost_estimated: number | null
          created_at: string
          created_by: string | null
          description: string | null
          document_url: string | null
          id: string
          inspection_id: string | null
          labor_hours: number | null
          mechanic: string | null
          notes: string | null
          odometer_km: number | null
          parts_summary: string | null
          priority: string
          problem: string
          reported_on: string
          scheduled_date: string | null
          status: string
          supplier: string | null
          updated_at: string
          vehicle_id: string
          work_item_id: string | null
        }
        Insert: {
          calendar_event_id?: string | null
          company_id?: string | null
          completed_date?: string | null
          completed_engine_hours?: number | null
          cost_actual?: number | null
          cost_estimated?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_url?: string | null
          id?: string
          inspection_id?: string | null
          labor_hours?: number | null
          mechanic?: string | null
          notes?: string | null
          odometer_km?: number | null
          parts_summary?: string | null
          priority?: string
          problem: string
          reported_on?: string
          scheduled_date?: string | null
          status?: string
          supplier?: string | null
          updated_at?: string
          vehicle_id: string
          work_item_id?: string | null
        }
        Update: {
          calendar_event_id?: string | null
          company_id?: string | null
          completed_date?: string | null
          completed_engine_hours?: number | null
          cost_actual?: number | null
          cost_estimated?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_url?: string | null
          id?: string
          inspection_id?: string | null
          labor_hours?: number | null
          mechanic?: string | null
          notes?: string | null
          odometer_km?: number | null
          parts_summary?: string | null
          priority?: string
          problem?: string
          reported_on?: string
          scheduled_date?: string | null
          status?: string
          supplier?: string | null
          updated_at?: string
          vehicle_id?: string
          work_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_repairs_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_repairs_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "fleet_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_repairs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_repairs_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "fleet_work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_service_programs: {
        Row: {
          alert_days_before: number
          alert_hours_margin: number
          alert_km_margin: number
          category: string | null
          company_id: string
          created_at: string
          id: string
          interval_days: number | null
          interval_hours: number | null
          interval_km: number | null
          is_active: boolean
          name: string
          notes: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          alert_days_before?: number
          alert_hours_margin?: number
          alert_km_margin?: number
          category?: string | null
          company_id?: string
          created_at?: string
          id?: string
          interval_days?: number | null
          interval_hours?: number | null
          interval_km?: number | null
          is_active?: boolean
          name: string
          notes?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          alert_days_before?: number
          alert_hours_margin?: number
          alert_km_margin?: number
          category?: string | null
          company_id?: string
          created_at?: string
          id?: string
          interval_days?: number | null
          interval_hours?: number | null
          interval_km?: number | null
          is_active?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_service_programs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_work_items: {
        Row: {
          check_key: string | null
          closed_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          inspection_id: string | null
          last_seen_on: string
          occurrences: number
          priority: string
          repair_id: string | null
          scheduled_date: string | null
          source: string
          status: string
          title: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          check_key?: string | null
          closed_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          inspection_id?: string | null
          last_seen_on?: string
          occurrences?: number
          priority?: string
          repair_id?: string | null
          scheduled_date?: string | null
          source?: string
          status?: string
          title: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          check_key?: string | null
          closed_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          inspection_id?: string | null
          last_seen_on?: string
          occurrences?: number
          priority?: string
          repair_id?: string | null
          scheduled_date?: string | null
          source?: string
          status?: string
          title?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_work_items_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "fleet_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_items_repair_id_fkey"
            columns: ["repair_id"]
            isOneToOne: false
            referencedRelation: "fleet_repairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_work_items_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      ga4_daily_summary: {
        Row: {
          avg_engagement_time_sec: number
          conversions: number
          created_at: string
          date: string
          engagement_rate: number
          events_count: number
          fetched_at: string
          id: string
          new_users: number
          page_views: number
          sessions: number
          users: number
        }
        Insert: {
          avg_engagement_time_sec?: number
          conversions?: number
          created_at?: string
          date: string
          engagement_rate?: number
          events_count?: number
          fetched_at?: string
          id?: string
          new_users?: number
          page_views?: number
          sessions?: number
          users?: number
        }
        Update: {
          avg_engagement_time_sec?: number
          conversions?: number
          created_at?: string
          date?: string
          engagement_rate?: number
          events_count?: number
          fetched_at?: string
          id?: string
          new_users?: number
          page_views?: number
          sessions?: number
          users?: number
        }
        Relationships: []
      }
      ga4_page_metrics: {
        Row: {
          avg_engagement_time_sec: number
          conversions: number
          created_at: string
          engagement_rate: number
          events_count: number
          fetched_at: string
          id: string
          new_users: number
          page_path: string
          page_views: number
          period: string
          sessions: number
          users: number
        }
        Insert: {
          avg_engagement_time_sec?: number
          conversions?: number
          created_at?: string
          engagement_rate?: number
          events_count?: number
          fetched_at?: string
          id?: string
          new_users?: number
          page_path: string
          page_views?: number
          period: string
          sessions?: number
          users?: number
        }
        Update: {
          avg_engagement_time_sec?: number
          conversions?: number
          created_at?: string
          engagement_rate?: number
          events_count?: number
          fetched_at?: string
          id?: string
          new_users?: number
          page_path?: string
          page_views?: number
          period?: string
          sessions?: number
          users?: number
        }
        Relationships: []
      }
      ga4_traffic_sources: {
        Row: {
          channel: string | null
          conversions: number
          created_at: string
          fetched_at: string
          id: string
          medium: string
          period: string
          sessions: number
          source: string
          users: number
        }
        Insert: {
          channel?: string | null
          conversions?: number
          created_at?: string
          fetched_at?: string
          id?: string
          medium: string
          period: string
          sessions?: number
          source: string
          users?: number
        }
        Update: {
          channel?: string | null
          conversions?: number
          created_at?: string
          fetched_at?: string
          id?: string
          medium?: string
          period?: string
          sessions?: number
          source?: string
          users?: number
        }
        Relationships: []
      }
      gbp_config: {
        Row: {
          account_display_name: string | null
          account_name: string | null
          connected_at: string
          connected_by: string | null
          created_at: string
          google_email: string | null
          id: string
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          location_address: string | null
          location_display_name: string | null
          location_name: string | null
          refresh_token: string
          updated_at: string
        }
        Insert: {
          account_display_name?: string | null
          account_name?: string | null
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          google_email?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          location_address?: string | null
          location_display_name?: string | null
          location_name?: string | null
          refresh_token: string
          updated_at?: string
        }
        Update: {
          account_display_name?: string | null
          account_name?: string | null
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          google_email?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          location_address?: string | null
          location_display_name?: string | null
          location_name?: string | null
          refresh_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      gbp_daily_metrics: {
        Row: {
          fetched_at: string
          id: string
          metric_date: string
          metric_name: string
          value: number
        }
        Insert: {
          fetched_at?: string
          id?: string
          metric_date: string
          metric_name: string
          value?: number
        }
        Update: {
          fetched_at?: string
          id?: string
          metric_date?: string
          metric_name?: string
          value?: number
        }
        Relationships: []
      }
      gbp_location: {
        Row: {
          address_lines: Json
          average_rating: number | null
          categories: Json
          display_name: string | null
          fetched_at: string
          id: string
          labels: Json
          locality: string | null
          location_name: string
          maps_uri: string | null
          phone: string | null
          postal_code: string | null
          primary_category: string | null
          raw: Json | null
          region: string | null
          total_photos: number
          total_reviews: number
          updated_at: string
          website_uri: string | null
        }
        Insert: {
          address_lines?: Json
          average_rating?: number | null
          categories?: Json
          display_name?: string | null
          fetched_at?: string
          id?: string
          labels?: Json
          locality?: string | null
          location_name: string
          maps_uri?: string | null
          phone?: string | null
          postal_code?: string | null
          primary_category?: string | null
          raw?: Json | null
          region?: string | null
          total_photos?: number
          total_reviews?: number
          updated_at?: string
          website_uri?: string | null
        }
        Update: {
          address_lines?: Json
          average_rating?: number | null
          categories?: Json
          display_name?: string | null
          fetched_at?: string
          id?: string
          labels?: Json
          locality?: string | null
          location_name?: string
          maps_uri?: string | null
          phone?: string | null
          postal_code?: string | null
          primary_category?: string | null
          raw?: Json | null
          region?: string | null
          total_photos?: number
          total_reviews?: number
          updated_at?: string
          website_uri?: string | null
        }
        Relationships: []
      }
      gbp_oauth_state: {
        Row: {
          created_at: string
          expires_at: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      gbp_posts: {
        Row: {
          created_at: string
          created_by: string | null
          cta_type: string | null
          cta_url: string | null
          error_message: string | null
          event_end_at: string | null
          event_start_at: string | null
          event_title: string | null
          google_name: string | null
          google_search_url: string | null
          id: string
          media_url: string | null
          offer_coupon_code: string | null
          offer_terms: string | null
          published_at: string | null
          raw_response: Json | null
          scheduled_for: string | null
          status: string
          summary: string
          topic_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cta_type?: string | null
          cta_url?: string | null
          error_message?: string | null
          event_end_at?: string | null
          event_start_at?: string | null
          event_title?: string | null
          google_name?: string | null
          google_search_url?: string | null
          id?: string
          media_url?: string | null
          offer_coupon_code?: string | null
          offer_terms?: string | null
          published_at?: string | null
          raw_response?: Json | null
          scheduled_for?: string | null
          status?: string
          summary: string
          topic_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cta_type?: string | null
          cta_url?: string | null
          error_message?: string | null
          event_end_at?: string | null
          event_start_at?: string | null
          event_title?: string | null
          google_name?: string | null
          google_search_url?: string | null
          id?: string
          media_url?: string | null
          offer_coupon_code?: string | null
          offer_terms?: string | null
          published_at?: string | null
          raw_response?: Json | null
          scheduled_for?: string | null
          status?: string
          summary?: string
          topic_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      gbp_questions: {
        Row: {
          author_display_name: string | null
          author_type: string | null
          created_at_google: string | null
          fetched_at: string
          google_name: string
          id: string
          owner_answer: string | null
          owner_answered_at: string | null
          owner_answered_by: string | null
          question_text: string
          raw: Json | null
          status: string
          total_answer_count: number
          updated_at: string
          upvote_count: number
        }
        Insert: {
          author_display_name?: string | null
          author_type?: string | null
          created_at_google?: string | null
          fetched_at?: string
          google_name: string
          id?: string
          owner_answer?: string | null
          owner_answered_at?: string | null
          owner_answered_by?: string | null
          question_text: string
          raw?: Json | null
          status?: string
          total_answer_count?: number
          updated_at?: string
          upvote_count?: number
        }
        Update: {
          author_display_name?: string | null
          author_type?: string | null
          created_at_google?: string | null
          fetched_at?: string
          google_name?: string
          id?: string
          owner_answer?: string | null
          owner_answered_at?: string | null
          owner_answered_by?: string | null
          question_text?: string
          raw?: Json | null
          status?: string
          total_answer_count?: number
          updated_at?: string
          upvote_count?: number
        }
        Relationships: []
      }
      geo_services: {
        Row: {
          category: string
          created_at: string
          description: string | null
          label: string
          service_key: string
          sort_order: number
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          label: string
          service_key: string
          sort_order?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          label?: string
          service_key?: string
          sort_order?: number
        }
        Relationships: []
      }
      geo_territories: {
        Row: {
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          merged_into_id: string | null
          mrc: string | null
          municipality: string | null
          name: string
          normalized_name: string
          notes: string | null
          parent_id: string | null
          province: string
          region: string | null
          request_count: number
          sector: string | null
          seo_city_slug: string | null
          source: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          merged_into_id?: string | null
          mrc?: string | null
          municipality?: string | null
          name: string
          normalized_name: string
          notes?: string | null
          parent_id?: string | null
          province?: string
          region?: string | null
          request_count?: number
          sector?: string | null
          seo_city_slug?: string | null
          source?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          merged_into_id?: string | null
          mrc?: string | null
          municipality?: string | null
          name?: string
          normalized_name?: string
          notes?: string | null
          parent_id?: string | null
          province?: string
          region?: string | null
          request_count?: number
          sector?: string | null
          seo_city_slug?: string | null
          source?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "geo_territories_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "geo_territories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geo_territories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "geo_territories"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_territory_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          normalized_alias: string
          source: string
          territory_id: string
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          normalized_alias: string
          source?: string
          territory_id: string
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          normalized_alias?: string
          source?: string
          territory_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "geo_territory_aliases_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "geo_territories"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_territory_history: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          id: string
          previous_territory_id: string | null
          reason: string | null
          submission_id: string | null
          territory_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          id?: string
          previous_territory_id?: string | null
          reason?: string | null
          submission_id?: string | null
          territory_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          id?: string
          previous_territory_id?: string | null
          reason?: string | null
          submission_id?: string | null
          territory_id?: string | null
        }
        Relationships: []
      }
      geo_territory_queue: {
        Row: {
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          normalized_city: string
          raw_city: string
          request_count: number
          resolved_at: string | null
          resolved_by: string | null
          status: string
          suggested_territory_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          normalized_city: string
          raw_city: string
          request_count?: number
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          suggested_territory_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          normalized_city?: string
          raw_city?: string
          request_count?: number
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          suggested_territory_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_territory_queue_suggested_territory_id_fkey"
            columns: ["suggested_territory_id"]
            isOneToOne: false
            referencedRelation: "geo_territories"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_territory_services: {
        Row: {
          evidence: Json
          id: string
          request_count: number
          service_key: string
          status: string
          territory_id: string
          updated_at: string
        }
        Insert: {
          evidence?: Json
          id?: string
          request_count?: number
          service_key: string
          status?: string
          territory_id: string
          updated_at?: string
        }
        Update: {
          evidence?: Json
          id?: string
          request_count?: number
          service_key?: string
          status?: string
          territory_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "geo_territory_services_service_key_fkey"
            columns: ["service_key"]
            isOneToOne: false
            referencedRelation: "geo_services"
            referencedColumns: ["service_key"]
          },
          {
            foreignKeyName: "geo_territory_services_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "geo_territories"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_ai_insights: {
        Row: {
          body: string | null
          company_id: string | null
          created_at: string
          id: string
          impact_amount: number | null
          kind: string
          model: string | null
          payload: Json
          period_end: string | null
          period_start: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          impact_amount?: number | null
          kind?: string
          model?: string | null
          payload?: Json
          period_end?: string | null
          period_start?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          impact_amount?: number | null
          kind?: string
          model?: string | null
          payload?: Json
          period_end?: string | null
          period_start?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_ai_insights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_api_keys: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_api_keys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_api_requests: {
        Row: {
          api_key_id: string | null
          company_id: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          ip_address: string | null
          method: string
          path: string
          status_code: number
        }
        Insert: {
          api_key_id?: string | null
          company_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          ip_address?: string | null
          method: string
          path: string
          status_code: number
        }
        Update: {
          api_key_id?: string | null
          company_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          ip_address?: string | null
          method?: string
          path?: string
          status_code?: number
        }
        Relationships: [
          {
            foreignKeyName: "jsc_api_requests_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "jsc_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          changed_fields: string[]
          company_id: string | null
          context: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          record_label: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          changed_fields?: string[]
          company_id?: string | null
          context?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          record_label?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          changed_fields?: string[]
          company_id?: string | null
          context?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          record_label?: string | null
          table_name?: string
        }
        Relationships: []
      }
      jsc_automation_rules: {
        Row: {
          action: Json
          archived_at: string | null
          archived_by: string | null
          code: string
          company_id: string | null
          created_at: string
          delay_minutes: number
          description: string | null
          id: string
          is_active: boolean
          label: string
          sort_order: number
          trigger_event: string
          updated_at: string
        }
        Insert: {
          action?: Json
          archived_at?: string | null
          archived_by?: string | null
          code: string
          company_id?: string | null
          created_at?: string
          delay_minutes?: number
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          trigger_event: string
          updated_at?: string
        }
        Update: {
          action?: Json
          archived_at?: string | null
          archived_by?: string | null
          code?: string
          company_id?: string | null
          created_at?: string
          delay_minutes?: number
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_automation_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_automation_runs: {
        Row: {
          company_id: string | null
          created_at: string
          detail: string | null
          entity_id: string | null
          entity_type: string
          executed_at: string
          id: string
          result: Json
          rule_code: string
          status: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type: string
          executed_at?: string
          id?: string
          result?: Json
          rule_code: string
          status?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type?: string
          executed_at?: string
          id?: string
          result?: Json
          rule_code?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_automation_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_autopilot_log: {
        Row: {
          action: string
          company_id: string | null
          decision_id: string | null
          detail: string | null
          entity_id: string | null
          entity_type: string | null
          executed_at: string
          id: string
          payload: Json
          status: string
        }
        Insert: {
          action: string
          company_id?: string | null
          decision_id?: string | null
          detail?: string | null
          entity_id?: string | null
          entity_type?: string | null
          executed_at?: string
          id?: string
          payload?: Json
          status?: string
        }
        Update: {
          action?: string
          company_id?: string | null
          decision_id?: string | null
          detail?: string | null
          entity_id?: string | null
          entity_type?: string | null
          executed_at?: string
          id?: string
          payload?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_autopilot_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_autopilot_log_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "jsc_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_autopilot_settings: {
        Row: {
          auto_assign_drivers: boolean
          auto_dispatch_orders: boolean
          auto_execute_decisions: boolean
          auto_followups: boolean
          auto_invoices: boolean
          auto_schedule_deliveries: boolean
          auto_send_quotes: boolean
          company_id: string | null
          created_at: string
          enabled: boolean
          id: string
          max_auto_amount: number
          min_confidence: number
          updated_at: string
        }
        Insert: {
          auto_assign_drivers?: boolean
          auto_dispatch_orders?: boolean
          auto_execute_decisions?: boolean
          auto_followups?: boolean
          auto_invoices?: boolean
          auto_schedule_deliveries?: boolean
          auto_send_quotes?: boolean
          company_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          max_auto_amount?: number
          min_confidence?: number
          updated_at?: string
        }
        Update: {
          auto_assign_drivers?: boolean
          auto_dispatch_orders?: boolean
          auto_execute_decisions?: boolean
          auto_followups?: boolean
          auto_invoices?: boolean
          auto_schedule_deliveries?: boolean
          auto_send_quotes?: boolean
          company_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          max_auto_amount?: number
          min_confidence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_autopilot_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_availability: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          available_quantity: number | null
          company_id: string | null
          created_at: string
          daily_capacity_tonnes: number | null
          id: string
          is_active: boolean
          lead_time_days: number | null
          material_id: string | null
          note: string | null
          pickup_location_id: string | null
          price_indication: number | null
          profile_id: string | null
          status: string
          supplier_id: string | null
          unit: string | null
          updated_at: string
          wait_time_minutes: number | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          available_quantity?: number | null
          company_id?: string | null
          created_at?: string
          daily_capacity_tonnes?: number | null
          id?: string
          is_active?: boolean
          lead_time_days?: number | null
          material_id?: string | null
          note?: string | null
          pickup_location_id?: string | null
          price_indication?: number | null
          profile_id?: string | null
          status?: string
          supplier_id?: string | null
          unit?: string | null
          updated_at?: string
          wait_time_minutes?: number | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          available_quantity?: number | null
          company_id?: string | null
          created_at?: string
          daily_capacity_tonnes?: number | null
          id?: string
          is_active?: boolean
          lead_time_days?: number | null
          material_id?: string | null
          note?: string | null
          pickup_location_id?: string | null
          price_indication?: number | null
          profile_id?: string | null
          status?: string
          supplier_id?: string | null
          unit?: string | null
          updated_at?: string
          wait_time_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "jsc_availability_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_availability_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "jsc_availability_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "jsc_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_availability_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["pickup_location_id"]
          },
          {
            foreignKeyName: "jsc_availability_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "jsc_pickup_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_availability_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "jsc_marketplace_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_availability_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "jsc_marketplace_profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_availability_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "jsc_availability_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_bi_goals: {
        Row: {
          archived_at: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          ends_on: string
          id: string
          is_active: boolean
          metric: string
          name: string
          notes: string | null
          period: string
          starts_on: string
          target_value: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_on?: string
          id?: string
          is_active?: boolean
          metric: string
          name: string
          notes?: string | null
          period?: string
          starts_on?: string
          target_value?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_on?: string
          id?: string
          is_active?: boolean
          metric?: string
          name?: string
          notes?: string | null
          period?: string
          starts_on?: string
          target_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_bi_goals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_bi_layouts: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
          widgets: Json
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id: string
          widgets?: Json
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
          widgets?: Json
        }
        Relationships: [
          {
            foreignKeyName: "jsc_bi_layouts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_clients: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          billing_address: string | null
          city: string | null
          client_type: string
          company_id: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          internal_notes: string | null
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          payment_terms: string | null
          phone: string | null
          postal_code: string | null
          tax_exempt: boolean
          updated_at: string
          user_id: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          billing_address?: string | null
          city?: string | null
          client_type?: string
          company_id?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          payment_terms?: string | null
          phone?: string | null
          postal_code?: string | null
          tax_exempt?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          billing_address?: string | null
          city?: string | null
          client_type?: string
          company_id?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          payment_terms?: string | null
          phone?: string | null
          postal_code?: string | null
          tax_exempt?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jsc_clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_companies: {
        Row: {
          address: string | null
          archived_at: string | null
          archived_by: string | null
          availability: string
          code: string
          created_at: string
          currency: string
          custom_domain: string | null
          document_footer: string | null
          email: string | null
          email_from: string | null
          email_signature: string | null
          gst_number: string | null
          id: string
          invoice_terms: string | null
          is_active: boolean
          is_default: boolean
          legal_name: string | null
          logo_url: string | null
          name: string
          notify_email: boolean
          notify_sms: boolean
          phone: string | null
          primary_color: string
          priority: number
          qst_number: string | null
          quote_terms: string | null
          secondary_color: string
          sms_sender: string | null
          timezone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          availability?: string
          code: string
          created_at?: string
          currency?: string
          custom_domain?: string | null
          document_footer?: string | null
          email?: string | null
          email_from?: string | null
          email_signature?: string | null
          gst_number?: string | null
          id?: string
          invoice_terms?: string | null
          is_active?: boolean
          is_default?: boolean
          legal_name?: string | null
          logo_url?: string | null
          name: string
          notify_email?: boolean
          notify_sms?: boolean
          phone?: string | null
          primary_color?: string
          priority?: number
          qst_number?: string | null
          quote_terms?: string | null
          secondary_color?: string
          sms_sender?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          availability?: string
          code?: string
          created_at?: string
          currency?: string
          custom_domain?: string | null
          document_footer?: string | null
          email?: string | null
          email_from?: string | null
          email_signature?: string | null
          gst_number?: string | null
          id?: string
          invoice_terms?: string | null
          is_active?: boolean
          is_default?: boolean
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          notify_email?: boolean
          notify_sms?: boolean
          phone?: string | null
          primary_color?: string
          priority?: number
          qst_number?: string | null
          quote_terms?: string | null
          secondary_color?: string
          sms_sender?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      jsc_company_members: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          company_id: string
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          role: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          role?: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          role?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_contracts: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          client_id: string | null
          company_id: string | null
          contract_number: string | null
          contract_type: string
          created_at: string
          credit_limit: number | null
          delivery_conditions: string | null
          discount_percent: number | null
          ends_on: string | null
          id: string
          is_active: boolean
          minimum_volume: number | null
          name: string
          negotiated_prices: Json
          notes: string | null
          payment_terms_days: number | null
          starts_on: string | null
          status: string
          supplier_id: string | null
          transport_terms: Json
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          client_id?: string | null
          company_id?: string | null
          contract_number?: string | null
          contract_type?: string
          created_at?: string
          credit_limit?: number | null
          delivery_conditions?: string | null
          discount_percent?: number | null
          ends_on?: string | null
          id?: string
          is_active?: boolean
          minimum_volume?: number | null
          name: string
          negotiated_prices?: Json
          notes?: string | null
          payment_terms_days?: number | null
          starts_on?: string | null
          status?: string
          supplier_id?: string | null
          transport_terms?: Json
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          client_id?: string | null
          company_id?: string | null
          contract_number?: string | null
          contract_type?: string
          created_at?: string
          credit_limit?: number | null
          delivery_conditions?: string | null
          discount_percent?: number | null
          ends_on?: string | null
          id?: string
          is_active?: boolean
          minimum_volume?: number | null
          name?: string
          negotiated_prices?: Json
          notes?: string | null
          payment_terms_days?: number | null
          starts_on?: string | null
          status?: string
          supplier_id?: string | null
          transport_terms?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "jsc_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_contracts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "jsc_contracts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_decisions: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          auto_executable: boolean
          company_id: string | null
          confidence: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          domain: string
          entity_id: string | null
          entity_type: string | null
          evidence: Json
          executed_at: string | null
          execution_result: Json | null
          id: string
          impact_amount: number
          kind: string
          model: string | null
          proposed_action: Json
          rationale: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          auto_executable?: boolean
          company_id?: string | null
          confidence?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          domain?: string
          entity_id?: string | null
          entity_type?: string | null
          evidence?: Json
          executed_at?: string | null
          execution_result?: Json | null
          id?: string
          impact_amount?: number
          kind?: string
          model?: string | null
          proposed_action?: Json
          rationale?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          auto_executable?: boolean
          company_id?: string | null
          confidence?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          domain?: string
          entity_id?: string | null
          entity_type?: string | null
          evidence?: Json
          executed_at?: string | null
          execution_result?: Json | null
          id?: string
          impact_amount?: number
          kind?: string
          model?: string | null
          proposed_action?: Json
          rationale?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_decisions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_deliveries: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          cancelled_at: string | null
          carrier_id: string | null
          city: string | null
          client_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_address: string | null
          delivery_number: string | null
          distance_km: number | null
          driver_id: string | null
          driver_notes: string | null
          duration_minutes: number | null
          estimated_cost: number | null
          group_key: string | null
          id: string
          internal_notes: string | null
          latitude: number | null
          loaded_at: string | null
          longitude: number | null
          material_id: string | null
          notes: string | null
          order_id: string | null
          pickup_location_id: string | null
          postal_code: string | null
          priority: string
          project_id: string | null
          proof_photos: string[]
          quantity: number | null
          quantity_unit: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          signature_data: string | null
          signature_name: string | null
          started_at: string | null
          status: string
          supplier_id: string | null
          trip_index: number | null
          truck_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          cancelled_at?: string | null
          carrier_id?: string | null
          city?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_number?: string | null
          distance_km?: number | null
          driver_id?: string | null
          driver_notes?: string | null
          duration_minutes?: number | null
          estimated_cost?: number | null
          group_key?: string | null
          id?: string
          internal_notes?: string | null
          latitude?: number | null
          loaded_at?: string | null
          longitude?: number | null
          material_id?: string | null
          notes?: string | null
          order_id?: string | null
          pickup_location_id?: string | null
          postal_code?: string | null
          priority?: string
          project_id?: string | null
          proof_photos?: string[]
          quantity?: number | null
          quantity_unit?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          signature_data?: string | null
          signature_name?: string | null
          started_at?: string | null
          status?: string
          supplier_id?: string | null
          trip_index?: number | null
          truck_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          cancelled_at?: string | null
          carrier_id?: string | null
          city?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_number?: string | null
          distance_km?: number | null
          driver_id?: string | null
          driver_notes?: string | null
          duration_minutes?: number | null
          estimated_cost?: number | null
          group_key?: string | null
          id?: string
          internal_notes?: string | null
          latitude?: number | null
          loaded_at?: string | null
          longitude?: number | null
          material_id?: string | null
          notes?: string | null
          order_id?: string | null
          pickup_location_id?: string | null
          postal_code?: string | null
          priority?: string
          project_id?: string | null
          proof_photos?: string[]
          quantity?: number | null
          quantity_unit?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          signature_data?: string | null
          signature_name?: string | null
          started_at?: string | null
          status?: string
          supplier_id?: string | null
          trip_index?: number | null
          truck_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_deliveries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "jsc_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_deliveries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_deliveries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "jsc_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_deliveries_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "jsc_deliveries_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "jsc_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "jsc_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_deliveries_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["pickup_location_id"]
          },
          {
            foreignKeyName: "jsc_deliveries_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "jsc_pickup_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_deliveries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "jsc_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_deliveries_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "jsc_deliveries_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_deliveries_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "jsc_trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_documents: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          company_id: string | null
          created_at: string
          doc_type: string
          entity_id: string
          entity_type: string
          external_url: string | null
          id: string
          mime_type: string | null
          notes: string | null
          size_bytes: number | null
          storage_path: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          company_id?: string | null
          created_at?: string
          doc_type?: string
          entity_id: string
          entity_type: string
          external_url?: string | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          company_id?: string | null
          created_at?: string
          doc_type?: string
          entity_id?: string
          entity_type?: string
          external_url?: string | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jsc_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_drivers: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          company_id: string
          created_at: string
          default_truck_id: string | null
          email: string | null
          first_name: string
          hire_date: string | null
          hourly_cost: number | null
          id: string
          internal_notes: string | null
          is_active: boolean
          last_name: string | null
          license_class: string | null
          license_number: string | null
          phone: string | null
          schedule: string | null
          sort_order: number
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          company_id?: string
          created_at?: string
          default_truck_id?: string | null
          email?: string | null
          first_name: string
          hire_date?: string | null
          hourly_cost?: number | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          last_name?: string | null
          license_class?: string | null
          license_number?: string | null
          phone?: string | null
          schedule?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          company_id?: string
          created_at?: string
          default_truck_id?: string | null
          email?: string | null
          first_name?: string
          hire_date?: string | null
          hourly_cost?: number | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          last_name?: string | null
          license_class?: string | null
          license_number?: string | null
          phone?: string | null
          schedule?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jsc_drivers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_drivers_default_truck_id_fkey"
            columns: ["default_truck_id"]
            isOneToOne: false
            referencedRelation: "jsc_trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_estimates: {
        Row: {
          billed_hours: number | null
          calculation: Json | null
          carrier_id: string | null
          company_id: string
          computed_by: string | null
          created_at: string
          currency: string
          decision: Json | null
          distance_km: number | null
          engine_version: string | null
          estimate_number: string | null
          id: string
          is_selected: boolean
          margin: number | null
          material_cost: number | null
          material_id: string | null
          pickup_location_id: string | null
          request_id: string
          settings_snapshot: Json | null
          subtotal: number | null
          supplier_id: string | null
          surcharges: number | null
          tax_total: number | null
          total: number | null
          transport_cost: number | null
          transport_rate_id: string | null
          trips: number | null
          truck_id: string | null
          updated_at: string
        }
        Insert: {
          billed_hours?: number | null
          calculation?: Json | null
          carrier_id?: string | null
          company_id?: string
          computed_by?: string | null
          created_at?: string
          currency?: string
          decision?: Json | null
          distance_km?: number | null
          engine_version?: string | null
          estimate_number?: string | null
          id?: string
          is_selected?: boolean
          margin?: number | null
          material_cost?: number | null
          material_id?: string | null
          pickup_location_id?: string | null
          request_id: string
          settings_snapshot?: Json | null
          subtotal?: number | null
          supplier_id?: string | null
          surcharges?: number | null
          tax_total?: number | null
          total?: number | null
          transport_cost?: number | null
          transport_rate_id?: string | null
          trips?: number | null
          truck_id?: string | null
          updated_at?: string
        }
        Update: {
          billed_hours?: number | null
          calculation?: Json | null
          carrier_id?: string | null
          company_id?: string
          computed_by?: string | null
          created_at?: string
          currency?: string
          decision?: Json | null
          distance_km?: number | null
          engine_version?: string | null
          estimate_number?: string | null
          id?: string
          is_selected?: boolean
          margin?: number | null
          material_cost?: number | null
          material_id?: string | null
          pickup_location_id?: string | null
          request_id?: string
          settings_snapshot?: Json | null
          subtotal?: number | null
          supplier_id?: string | null
          surcharges?: number | null
          tax_total?: number | null
          total?: number | null
          transport_cost?: number | null
          transport_rate_id?: string | null
          trips?: number | null
          truck_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_estimates_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_estimates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_estimates_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "jsc_estimates_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "jsc_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_estimates_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["pickup_location_id"]
          },
          {
            foreignKeyName: "jsc_estimates_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "jsc_pickup_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_estimates_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "jsc_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_estimates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "jsc_estimates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_estimates_transport_rate_id_fkey"
            columns: ["transport_rate_id"]
            isOneToOne: false
            referencedRelation: "jsc_transport_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_estimates_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "jsc_trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_events: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          label: string | null
          payload: Json
          severity: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          label?: string | null
          payload?: Json
          severity?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          label?: string | null
          payload?: Json
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_forecasts: {
        Row: {
          company_id: string | null
          computed_at: string
          confidence: number | null
          created_at: string
          detail: Json
          high: number | null
          id: string
          low: number | null
          method: string
          metric: string
          period_month: string
          predicted: number
        }
        Insert: {
          company_id?: string | null
          computed_at?: string
          confidence?: number | null
          created_at?: string
          detail?: Json
          high?: number | null
          id?: string
          low?: number | null
          method?: string
          metric: string
          period_month: string
          predicted?: number
        }
        Update: {
          company_id?: string | null
          computed_at?: string
          confidence?: number | null
          created_at?: string
          detail?: Json
          high?: number | null
          id?: string
          low?: number | null
          method?: string
          metric?: string
          period_month?: string
          predicted?: number
        }
        Relationships: [
          {
            foreignKeyName: "jsc_forecasts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_incidents: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          company_id: string | null
          created_at: string
          delivery_id: string | null
          description: string
          id: string
          incident_type: string
          order_id: string | null
          project_id: string | null
          reported_by: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          company_id?: string | null
          created_at?: string
          delivery_id?: string | null
          description: string
          id?: string
          incident_type?: string
          order_id?: string | null
          project_id?: string | null
          reported_by?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          company_id?: string | null
          created_at?: string
          delivery_id?: string | null
          description?: string
          id?: string
          incident_type?: string
          order_id?: string | null
          project_id?: string | null
          reported_by?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_incidents_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "jsc_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_incidents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "jsc_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_incidents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "jsc_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_intel_anomalies: {
        Row: {
          code: string
          company_id: string | null
          created_at: string
          detail: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          impact_amount: number | null
          metrics: Json
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          company_id?: string | null
          created_at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          impact_amount?: number | null
          metrics?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string | null
          created_at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          impact_amount?: number | null
          metrics?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      jsc_intel_learning: {
        Row: {
          company_id: string | null
          computed_at: string
          confidence: number
          created_at: string
          id: string
          metrics: Json
          samples: number
          subject_id: string | null
          subject_label: string | null
          subject_type: string | null
          topic: string
        }
        Insert: {
          company_id?: string | null
          computed_at?: string
          confidence?: number
          created_at?: string
          id?: string
          metrics?: Json
          samples?: number
          subject_id?: string | null
          subject_label?: string | null
          subject_type?: string | null
          topic: string
        }
        Update: {
          company_id?: string | null
          computed_at?: string
          confidence?: number
          created_at?: string
          id?: string
          metrics?: Json
          samples?: number
          subject_id?: string | null
          subject_label?: string | null
          subject_type?: string | null
          topic?: string
        }
        Relationships: []
      }
      jsc_intel_memory: {
        Row: {
          company_id: string | null
          context: Json
          created_at: string
          id: string
          kind: string
          lesson: string | null
          outcome: string | null
          performance: number | null
          reference_id: string | null
          reference_type: string | null
          title: string
        }
        Insert: {
          company_id?: string | null
          context?: Json
          created_at?: string
          id?: string
          kind: string
          lesson?: string | null
          outcome?: string | null
          performance?: number | null
          reference_id?: string | null
          reference_type?: string | null
          title: string
        }
        Update: {
          company_id?: string | null
          context?: Json
          created_at?: string
          id?: string
          kind?: string
          lesson?: string | null
          outcome?: string | null
          performance?: number | null
          reference_id?: string | null
          reference_type?: string | null
          title?: string
        }
        Relationships: []
      }
      jsc_intel_optimizations: {
        Row: {
          applied_at: string | null
          company_id: string | null
          confidence: number
          created_at: string
          current_state: Json
          decided_at: string | null
          decided_by: string | null
          entity_id: string | null
          entity_type: string | null
          estimated_saving: number
          id: string
          kind: string
          proposed_state: Json
          rationale: string | null
          result: Json | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          company_id?: string | null
          confidence?: number
          created_at?: string
          current_state?: Json
          decided_at?: string | null
          decided_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          estimated_saving?: number
          id?: string
          kind: string
          proposed_state?: Json
          rationale?: string | null
          result?: Json | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          company_id?: string | null
          confidence?: number
          created_at?: string
          current_state?: Json
          decided_at?: string | null
          decided_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          estimated_saving?: number
          id?: string
          kind?: string
          proposed_state?: Json
          rationale?: string | null
          result?: Json | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      jsc_intel_predictions: {
        Row: {
          basis: Json
          company_id: string | null
          confidence: number
          created_at: string
          high: number | null
          id: string
          low: number | null
          method: string
          metric: string
          period_month: string
          predicted: number
        }
        Insert: {
          basis?: Json
          company_id?: string | null
          confidence?: number
          created_at?: string
          high?: number | null
          id?: string
          low?: number | null
          method?: string
          metric: string
          period_month: string
          predicted?: number
        }
        Update: {
          basis?: Json
          company_id?: string | null
          confidence?: number
          created_at?: string
          high?: number | null
          id?: string
          low?: number | null
          method?: string
          metric?: string
          period_month?: string
          predicted?: number
        }
        Relationships: []
      }
      jsc_intel_reports: {
        Row: {
          company_id: string | null
          created_at: string
          emailed_at: string | null
          id: string
          metrics: Json
          report_date: string
          scope: string
          summary: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          emailed_at?: string | null
          id?: string
          metrics?: Json
          report_date?: string
          scope?: string
          summary?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          emailed_at?: string | null
          id?: string
          metrics?: Json
          report_date?: string
          scope?: string
          summary?: string | null
        }
        Relationships: []
      }
      jsc_intel_scores: {
        Row: {
          company_id: string | null
          computed_at: string
          created_at: string
          entity_id: string
          entity_type: string
          factors: Json
          grade: string | null
          id: string
          label: string | null
          samples: number
          score: number
        }
        Insert: {
          company_id?: string | null
          computed_at?: string
          created_at?: string
          entity_id: string
          entity_type: string
          factors?: Json
          grade?: string | null
          id?: string
          label?: string | null
          samples?: number
          score?: number
        }
        Update: {
          company_id?: string | null
          computed_at?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          factors?: Json
          grade?: string | null
          id?: string
          label?: string | null
          samples?: number
          score?: number
        }
        Relationships: []
      }
      jsc_invoice_lines: {
        Row: {
          company_id: string
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_total: number
          line_type: string
          quantity: number
          sort_order: number
          tax_ids: string[]
          unit: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_total?: number
          line_type?: string
          quantity?: number
          sort_order?: number
          tax_ids?: string[]
          unit?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_total?: number
          line_type?: string
          quantity?: number
          sort_order?: number
          tax_ids?: string[]
          unit?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_invoice_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "jsc_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_invoices: {
        Row: {
          amount_paid: number
          archived_at: string | null
          archived_by: string | null
          balance: number | null
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          due_at: string | null
          id: string
          invoice_number: string | null
          issued_at: string | null
          notes: string | null
          order_id: string | null
          payment_terms: string | null
          status: string
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          archived_at?: string | null
          archived_by?: string | null
          balance?: number | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_at?: string | null
          id?: string
          invoice_number?: string | null
          issued_at?: string | null
          notes?: string | null
          order_id?: string | null
          payment_terms?: string | null
          status?: string
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          archived_at?: string | null
          archived_by?: string | null
          balance?: number | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_at?: string | null
          id?: string
          invoice_number?: string | null
          issued_at?: string | null
          notes?: string | null
          order_id?: string | null
          payment_terms?: string | null
          status?: string
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "jsc_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "jsc_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_lead_scores: {
        Row: {
          client_type: string | null
          company_id: string | null
          created_at: string
          id: string
          model: string | null
          potential_revenue: number | null
          priority: string
          project_type: string | null
          reasoning: string | null
          recommended_rep_name: string | null
          recommended_rep_user_id: string | null
          request_id: string
          score: number
          signals: Json
          stars: number
          updated_at: string
          win_probability: number | null
        }
        Insert: {
          client_type?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          model?: string | null
          potential_revenue?: number | null
          priority?: string
          project_type?: string | null
          reasoning?: string | null
          recommended_rep_name?: string | null
          recommended_rep_user_id?: string | null
          request_id: string
          score?: number
          signals?: Json
          stars?: number
          updated_at?: string
          win_probability?: number | null
        }
        Update: {
          client_type?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          model?: string | null
          potential_revenue?: number | null
          priority?: string
          project_type?: string | null
          reasoning?: string | null
          recommended_rep_name?: string | null
          recommended_rep_user_id?: string | null
          request_id?: string
          score?: number
          signals?: Json
          stars?: number
          updated_at?: string
          win_probability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "jsc_lead_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_lead_scores_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "jsc_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_learning_signals: {
        Row: {
          amount: number | null
          company_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          factors: Json
          id: string
          margin: number | null
          outcome: string
        }
        Insert: {
          amount?: number | null
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          factors?: Json
          id?: string
          margin?: number | null
          outcome: string
        }
        Update: {
          amount?: number | null
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          factors?: Json
          id?: string
          margin?: number | null
          outcome?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_learning_signals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_listings: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          available_from: string | null
          available_until: string | null
          city: string | null
          company_id: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          latitude: number | null
          listing_type: string
          longitude: number | null
          material_id: string | null
          material_label: string | null
          price: number | null
          price_unit: string | null
          profile_id: string | null
          quantity: number | null
          quantity_unit: string | null
          region: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          available_from?: string | null
          available_until?: string | null
          city?: string | null
          company_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          listing_type?: string
          longitude?: number | null
          material_id?: string | null
          material_label?: string | null
          price?: number | null
          price_unit?: string | null
          profile_id?: string | null
          quantity?: number | null
          quantity_unit?: string | null
          region?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          available_from?: string | null
          available_until?: string | null
          city?: string | null
          company_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          listing_type?: string
          longitude?: number | null
          material_id?: string | null
          material_label?: string | null
          price?: number | null
          price_unit?: string | null
          profile_id?: string | null
          quantity?: number | null
          quantity_unit?: string | null
          region?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_listings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_listings_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "jsc_listings_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "jsc_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_listings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "jsc_marketplace_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_listings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "jsc_marketplace_profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_login_history: {
        Row: {
          created_at: string
          email: string | null
          event: string
          id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          event?: string
          id?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          event?: string
          id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      jsc_marketplace_profiles: {
        Row: {
          address: string | null
          archived_at: string | null
          archived_by: string | null
          carrier_company_id: string | null
          certifications: Json
          city: string | null
          company_id: string | null
          created_at: string
          description: string | null
          email: string | null
          id: string
          is_active: boolean
          is_featured: boolean
          is_published: boolean
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          name: string
          opening_hours: Json
          partner_type: string
          phone: string | null
          photos: Json
          postal_code: string | null
          rating_average: number
          rating_count: number
          region: string | null
          service_radius_km: number | null
          services: Json
          slug: string | null
          supplier_id: string | null
          tagline: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          carrier_company_id?: string | null
          certifications?: Json
          city?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          is_published?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name: string
          opening_hours?: Json
          partner_type?: string
          phone?: string | null
          photos?: Json
          postal_code?: string | null
          rating_average?: number
          rating_count?: number
          region?: string | null
          service_radius_km?: number | null
          services?: Json
          slug?: string | null
          supplier_id?: string | null
          tagline?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          carrier_company_id?: string | null
          certifications?: Json
          city?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          is_published?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name?: string
          opening_hours?: Json
          partner_type?: string
          phone?: string | null
          photos?: Json
          postal_code?: string | null
          rating_average?: number
          rating_count?: number
          region?: string | null
          service_radius_km?: number | null
          services?: Json
          slug?: string | null
          supplier_id?: string | null
          tagline?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jsc_marketplace_profiles_carrier_company_id_fkey"
            columns: ["carrier_company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_marketplace_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_marketplace_profiles_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "jsc_marketplace_profiles_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_marketplace_reviews: {
        Row: {
          archived_at: string | null
          author_name: string | null
          author_user_id: string | null
          comment: string | null
          created_at: string
          id: string
          is_approved: boolean
          profile_id: string
          rating: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          author_name?: string | null
          author_user_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          profile_id: string
          rating: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          author_name?: string | null
          author_user_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          profile_id?: string
          rating?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_marketplace_reviews_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "jsc_marketplace_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_marketplace_reviews_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "jsc_marketplace_profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_material_categories: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          code: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          code?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          code?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_material_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_material_prices: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          is_preferred: boolean
          material_id: string
          minimum_quantity: number | null
          pickup_location_id: string | null
          purchase_price: number
          selling_price: number
          supplier_id: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_preferred?: boolean
          material_id: string
          minimum_quantity?: number | null
          pickup_location_id?: string | null
          purchase_price?: number
          selling_price?: number
          supplier_id?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_preferred?: boolean
          material_id?: string
          minimum_quantity?: number | null
          pickup_location_id?: string | null
          purchase_price?: number
          selling_price?: number
          supplier_id?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_material_prices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_material_prices_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "jsc_material_prices_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "jsc_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_material_prices_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["pickup_location_id"]
          },
          {
            foreignKeyName: "jsc_material_prices_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "jsc_pickup_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_material_prices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "jsc_material_prices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_material_recommendations: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          material_id: string
          note: string | null
          related_material_id: string
          relation_type: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          material_id: string
          note?: string | null
          related_material_id: string
          relation_type?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          material_id?: string
          note?: string | null
          related_material_id?: string
          relation_type?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_material_recommendations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_material_recommendations_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "jsc_material_recommendations_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "jsc_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_material_recommendations_related_material_id_fkey"
            columns: ["related_material_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "jsc_material_recommendations_related_material_id_fkey"
            columns: ["related_material_id"]
            isOneToOne: false
            referencedRelation: "jsc_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_materials: {
        Row: {
          allowed_units: string[]
          archived_at: string | null
          archived_by: string | null
          availability: string
          category: string | null
          category_id: string | null
          code: string | null
          company_id: string
          cover_image_url: string | null
          created_at: string
          density_kg_per_m3: number | null
          id: string
          images: string[]
          internal_notes: string | null
          is_active: boolean
          is_public: boolean
          is_taxable: boolean
          margin_percent: number | null
          name: string
          pickup_location_id: string | null
          promo_ends_on: string | null
          promo_price: number | null
          promo_starts_on: string | null
          public_description: string | null
          purchase_price: number
          selling_price: number
          seo_description: string | null
          seo_keywords: string[]
          seo_text: string | null
          seo_title: string | null
          slug: string | null
          sort_order: number
          subcategory: string | null
          unit: string
          updated_at: string
          uses: string[]
        }
        Insert: {
          allowed_units?: string[]
          archived_at?: string | null
          archived_by?: string | null
          availability?: string
          category?: string | null
          category_id?: string | null
          code?: string | null
          company_id?: string
          cover_image_url?: string | null
          created_at?: string
          density_kg_per_m3?: number | null
          id?: string
          images?: string[]
          internal_notes?: string | null
          is_active?: boolean
          is_public?: boolean
          is_taxable?: boolean
          margin_percent?: number | null
          name: string
          pickup_location_id?: string | null
          promo_ends_on?: string | null
          promo_price?: number | null
          promo_starts_on?: string | null
          public_description?: string | null
          purchase_price?: number
          selling_price?: number
          seo_description?: string | null
          seo_keywords?: string[]
          seo_text?: string | null
          seo_title?: string | null
          slug?: string | null
          sort_order?: number
          subcategory?: string | null
          unit?: string
          updated_at?: string
          uses?: string[]
        }
        Update: {
          allowed_units?: string[]
          archived_at?: string | null
          archived_by?: string | null
          availability?: string
          category?: string | null
          category_id?: string | null
          code?: string | null
          company_id?: string
          cover_image_url?: string | null
          created_at?: string
          density_kg_per_m3?: number | null
          id?: string
          images?: string[]
          internal_notes?: string | null
          is_active?: boolean
          is_public?: boolean
          is_taxable?: boolean
          margin_percent?: number | null
          name?: string
          pickup_location_id?: string | null
          promo_ends_on?: string | null
          promo_price?: number | null
          promo_starts_on?: string | null
          public_description?: string | null
          purchase_price?: number
          selling_price?: number
          seo_description?: string | null
          seo_keywords?: string[]
          seo_text?: string | null
          seo_title?: string | null
          slug?: string | null
          sort_order?: number
          subcategory?: string | null
          unit?: string
          updated_at?: string
          uses?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "jsc_materials_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_materials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_materials_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["pickup_location_id"]
          },
          {
            foreignKeyName: "jsc_materials_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "jsc_pickup_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_monitor_alerts: {
        Row: {
          acknowledged_by: string | null
          code: string
          company_id: string | null
          created_at: string
          detail: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          impact_amount: number
          metrics: Json
          resolved_at: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_by?: string | null
          code: string
          company_id?: string | null
          created_at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          impact_amount?: number
          metrics?: Json
          resolved_at?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_by?: string | null
          code?: string
          company_id?: string | null
          created_at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          impact_amount?: number
          metrics?: Json
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_monitor_alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_notification_templates: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          audience: string
          body: string
          channel: string
          company_id: string | null
          created_at: string
          event_code: string
          id: string
          is_active: boolean
          sort_order: number
          subject: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          audience?: string
          body: string
          channel?: string
          company_id?: string | null
          created_at?: string
          event_code: string
          id?: string
          is_active?: boolean
          sort_order?: number
          subject?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          audience?: string
          body?: string
          channel?: string
          company_id?: string | null
          created_at?: string
          event_code?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_notification_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_notifications: {
        Row: {
          audience: string
          body: string | null
          channel: string
          company_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          read_at: string | null
          sent_at: string | null
          status: string
          title: string
          user_id: string | null
        }
        Insert: {
          audience?: string
          body?: string | null
          channel?: string
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          title: string
          user_id?: string | null
        }
        Update: {
          audience?: string
          body?: string | null
          channel?: string
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      jsc_number_counters: {
        Row: {
          company_id: string
          created_at: string
          current_value: number
          id: string
          kind: string
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          current_value?: number
          id?: string
          kind: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          current_value?: number
          id?: string
          kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_number_counters_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_orch_rules: {
        Row: {
          action_config: Json
          action_type: string
          archived_at: string | null
          archived_by: string | null
          code: string
          company_id: string | null
          cooldown_minutes: number
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          label: string
          last_triggered_at: string | null
          last_value: number | null
          metric: string
          operator: string
          severity: string
          sort_order: number
          threshold: number
          trigger_count: number
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type?: string
          archived_at?: string | null
          archived_by?: string | null
          code: string
          company_id?: string | null
          cooldown_minutes?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
          last_triggered_at?: string | null
          last_value?: number | null
          metric: string
          operator?: string
          severity?: string
          sort_order?: number
          threshold?: number
          trigger_count?: number
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          archived_at?: string | null
          archived_by?: string | null
          code?: string
          company_id?: string | null
          cooldown_minutes?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
          last_triggered_at?: string | null
          last_value?: number | null
          metric?: string
          operator?: string
          severity?: string
          sort_order?: number
          threshold?: number
          trigger_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_orch_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_orders: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          cancelled_at: string | null
          carrier_id: string | null
          client_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          delivered_quantity: number | null
          delivered_unit: string | null
          driver_id: string | null
          id: string
          internal_notes: string | null
          material_id: string | null
          order_number: string | null
          pickup_location_id: string | null
          priority: string
          project_id: string | null
          quote_id: string | null
          request_id: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          status: string
          subtotal: number | null
          supplier_id: string | null
          tax_total: number | null
          total: number | null
          trips_completed: number
          trips_planned: number | null
          truck_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          cancelled_at?: string | null
          carrier_id?: string | null
          client_id?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          delivered_quantity?: number | null
          delivered_unit?: string | null
          driver_id?: string | null
          id?: string
          internal_notes?: string | null
          material_id?: string | null
          order_number?: string | null
          pickup_location_id?: string | null
          priority?: string
          project_id?: string | null
          quote_id?: string | null
          request_id?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          status?: string
          subtotal?: number | null
          supplier_id?: string | null
          tax_total?: number | null
          total?: number | null
          trips_completed?: number
          trips_planned?: number | null
          truck_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          cancelled_at?: string | null
          carrier_id?: string | null
          client_id?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          delivered_quantity?: number | null
          delivered_unit?: string | null
          driver_id?: string | null
          id?: string
          internal_notes?: string | null
          material_id?: string | null
          order_number?: string | null
          pickup_location_id?: string | null
          priority?: string
          project_id?: string | null
          quote_id?: string | null
          request_id?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          status?: string
          subtotal?: number | null
          supplier_id?: string | null
          tax_total?: number | null
          total?: number | null
          trips_completed?: number
          trips_planned?: number | null
          truck_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_orders_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "jsc_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "jsc_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_orders_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "jsc_orders_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "jsc_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_orders_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["pickup_location_id"]
          },
          {
            foreignKeyName: "jsc_orders_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "jsc_pickup_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "jsc_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "jsc_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_orders_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "jsc_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "jsc_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_orders_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "jsc_trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_pickup_locations: {
        Row: {
          access_notes: string | null
          address: string
          archived_at: string | null
          archived_by: string | null
          city: string | null
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          is_base: boolean
          latitude: number | null
          loading_time_minutes: number
          location_type: string
          longitude: number | null
          name: string
          opening_hours: string | null
          postal_code: string | null
          sort_order: number
          supplier_id: string | null
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          access_notes?: string | null
          address: string
          archived_at?: string | null
          archived_by?: string | null
          city?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_base?: boolean
          latitude?: number | null
          loading_time_minutes?: number
          location_type?: string
          longitude?: number | null
          name: string
          opening_hours?: string | null
          postal_code?: string | null
          sort_order?: number
          supplier_id?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          access_notes?: string | null
          address?: string
          archived_at?: string | null
          archived_by?: string | null
          city?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_base?: boolean
          latitude?: number | null
          loading_time_minutes?: number
          location_type?: string
          longitude?: number | null
          name?: string
          opening_hours?: string | null
          postal_code?: string | null
          sort_order?: number
          supplier_id?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jsc_pickup_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_pickup_locations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "jsc_pickup_locations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_pickup_locations_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "jsc_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_projects: {
        Row: {
          address: string | null
          archived_at: string | null
          archived_by: string | null
          city: string | null
          client_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          internal_notes: string | null
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          postal_code: string | null
          project_number: string | null
          sort_order: number | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          city?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          postal_code?: string | null
          project_number?: string | null
          sort_order?: number | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          city?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          postal_code?: string | null
          project_number?: string | null
          sort_order?: number | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "jsc_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_public_offers: {
        Row: {
          archived_at: string | null
          available_date: string | null
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          lead_time_days: number | null
          material_price: number | null
          message: string | null
          profile_id: string | null
          public_request_id: string
          responder_user_id: string | null
          status: string
          supplier_id: string | null
          total_price: number | null
          transport_price: number | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          available_date?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lead_time_days?: number | null
          material_price?: number | null
          message?: string | null
          profile_id?: string | null
          public_request_id: string
          responder_user_id?: string | null
          status?: string
          supplier_id?: string | null
          total_price?: number | null
          transport_price?: number | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          available_date?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lead_time_days?: number | null
          material_price?: number | null
          message?: string | null
          profile_id?: string | null
          public_request_id?: string
          responder_user_id?: string | null
          status?: string
          supplier_id?: string | null
          total_price?: number | null
          transport_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_public_offers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_public_offers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "jsc_marketplace_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_public_offers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "jsc_marketplace_profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_public_offers_public_request_id_fkey"
            columns: ["public_request_id"]
            isOneToOne: false
            referencedRelation: "jsc_public_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_public_offers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "jsc_public_offers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_public_requests: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          budget_max: number | null
          client_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          deadline_at: string | null
          delivery_address: string | null
          delivery_city: string | null
          desired_date: string | null
          details: string | null
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          material_id: string | null
          material_label: string | null
          quantity: number | null
          quantity_unit: string | null
          request_id: string | null
          status: string
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          budget_max?: number | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deadline_at?: string | null
          delivery_address?: string | null
          delivery_city?: string | null
          desired_date?: string | null
          details?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          material_id?: string | null
          material_label?: string | null
          quantity?: number | null
          quantity_unit?: string | null
          request_id?: string | null
          status?: string
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          budget_max?: number | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deadline_at?: string | null
          delivery_address?: string | null
          delivery_city?: string | null
          desired_date?: string | null
          details?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          material_id?: string | null
          material_label?: string | null
          quantity?: number | null
          quantity_unit?: string | null
          request_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_public_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "jsc_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_public_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_public_requests_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "jsc_public_requests_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "jsc_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_public_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "jsc_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_quotes: {
        Row: {
          accepted_at: string | null
          archived_at: string | null
          archived_by: string | null
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          estimate_id: string | null
          id: string
          internal_notes: string | null
          public_payload: Json | null
          quote_number: string | null
          refusal_reason: string | null
          refused_at: string | null
          request_id: string | null
          sent_at: string | null
          status: string
          subtotal: number | null
          tax_total: number | null
          total: number | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          accepted_at?: string | null
          archived_at?: string | null
          archived_by?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          estimate_id?: string | null
          id?: string
          internal_notes?: string | null
          public_payload?: Json | null
          quote_number?: string | null
          refusal_reason?: string | null
          refused_at?: string | null
          request_id?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number | null
          tax_total?: number | null
          total?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          accepted_at?: string | null
          archived_at?: string | null
          archived_by?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          estimate_id?: string | null
          id?: string
          internal_notes?: string | null
          public_payload?: Json | null
          quote_number?: string | null
          refusal_reason?: string | null
          refused_at?: string | null
          request_id?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number | null
          tax_total?: number | null
          total?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jsc_quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "jsc_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_quotes_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "jsc_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_quotes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "jsc_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_recommendations: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          model: string | null
          payload: Json
          request_id: string | null
          scope: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          model?: string | null
          payload?: Json
          request_id?: string | null
          scope?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          model?: string | null
          payload?: Json
          request_id?: string | null
          scope?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_recommendations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_recommendations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "jsc_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_requests: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          city: string | null
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          delivery_address: string | null
          desired_date: string | null
          id: string
          internal_notes: string | null
          latitude: number | null
          longitude: number | null
          material_id: string | null
          notes: string | null
          postal_code: string | null
          project_id: string | null
          quantity: number | null
          quantity_unit: string | null
          request_number: string | null
          source: string
          status: string
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          city?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          delivery_address?: string | null
          desired_date?: string | null
          id?: string
          internal_notes?: string | null
          latitude?: number | null
          longitude?: number | null
          material_id?: string | null
          notes?: string | null
          postal_code?: string | null
          project_id?: string | null
          quantity?: number | null
          quantity_unit?: string | null
          request_number?: string | null
          source?: string
          status?: string
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          city?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          delivery_address?: string | null
          desired_date?: string | null
          id?: string
          internal_notes?: string | null
          latitude?: number | null
          longitude?: number | null
          material_id?: string | null
          notes?: string | null
          postal_code?: string | null
          project_id?: string | null
          quantity?: number | null
          quantity_unit?: string | null
          request_number?: string | null
          source?: string
          status?: string
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jsc_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "jsc_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_requests_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "jsc_requests_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "jsc_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "jsc_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_requests_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "jsc_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_risks: {
        Row: {
          category: string
          code: string
          company_id: string | null
          created_at: string
          detail: string | null
          detected_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          level: string
          metrics: Json
          resolved_at: string | null
          score: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          code: string
          company_id?: string | null
          created_at?: string
          detail?: string | null
          detected_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          level?: string
          metrics?: Json
          resolved_at?: string | null
          score?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          company_id?: string | null
          created_at?: string
          detail?: string | null
          detected_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          level?: string
          metrics?: Json
          resolved_at?: string | null
          score?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_risks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_role_permissions: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          module: string
          role: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          module: string
          role: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          module?: string
          role?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_role_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          is_internal: boolean
          label: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          is_internal?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          is_internal?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      jsc_settings: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          category: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          key: string
          label: string
          sort_order: number
          unit: string | null
          updated_at: string
          value: string | null
          value_type: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          category?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key: string
          label: string
          sort_order?: number
          unit?: string | null
          updated_at?: string
          value?: string | null
          value_type?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          category?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          sort_order?: number
          unit?: string | null
          updated_at?: string
          value?: string | null
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_simulations: {
        Row: {
          baseline: Json
          company_id: string | null
          created_at: string
          created_by: string | null
          delta: Json
          id: string
          inputs: Json
          name: string
          notes: string | null
          projection: Json
          scenario_type: string
          updated_at: string
        }
        Insert: {
          baseline?: Json
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          delta?: Json
          id?: string
          inputs?: Json
          name: string
          notes?: string | null
          projection?: Json
          scenario_type: string
          updated_at?: string
        }
        Update: {
          baseline?: Json
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          delta?: Json
          id?: string
          inputs?: Json
          name?: string
          notes?: string | null
          projection?: Json
          scenario_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_simulations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_status_history: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          company_id: string | null
          created_at: string
          entity_id: string
          entity_label: string | null
          entity_type: string
          from_status: string | null
          id: string
          reason: string | null
          to_status: string
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          company_id?: string | null
          created_at?: string
          entity_id: string
          entity_label?: string | null
          entity_type: string
          from_status?: string | null
          id?: string
          reason?: string | null
          to_status: string
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          company_id?: string | null
          created_at?: string
          entity_id?: string
          entity_label?: string | null
          entity_type?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          to_status?: string
        }
        Relationships: []
      }
      jsc_strategies: {
        Row: {
          company_id: string | null
          confidence: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          evidence: Json
          horizon: string
          id: string
          impact_estimate: number
          kind: string
          rationale: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          confidence?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          evidence?: Json
          horizon?: string
          id?: string
          impact_estimate?: number
          kind: string
          rationale?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          confidence?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          evidence?: Json
          horizon?: string
          id?: string
          impact_estimate?: number
          kind?: string
          rationale?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_strategies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_suppliers: {
        Row: {
          address: string | null
          archived_at: string | null
          archived_by: string | null
          city: string | null
          company_id: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          internal_notes: string | null
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          opening_hours: string | null
          payment_terms: string | null
          phone: string | null
          postal_code: string | null
          sort_order: number
          supplier_type: string
          updated_at: string
          website: string | null
          zone_id: string | null
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          city?: string | null
          company_id?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          opening_hours?: string | null
          payment_terms?: string | null
          phone?: string | null
          postal_code?: string | null
          sort_order?: number
          supplier_type?: string
          updated_at?: string
          website?: string | null
          zone_id?: string | null
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          city?: string | null
          company_id?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          opening_hours?: string | null
          payment_terms?: string | null
          phone?: string | null
          postal_code?: string | null
          sort_order?: number
          supplier_type?: string
          updated_at?: string
          website?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jsc_suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_suppliers_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "jsc_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_taxes: {
        Row: {
          apply_order: number
          archived_at: string | null
          archived_by: string | null
          code: string | null
          company_id: string
          compound: boolean
          created_at: string
          id: string
          is_active: boolean
          name: string
          rate_percent: number
          registration_number: string | null
          updated_at: string
        }
        Insert: {
          apply_order?: number
          archived_at?: string | null
          archived_by?: string | null
          code?: string | null
          company_id?: string
          compound?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          rate_percent?: number
          registration_number?: string | null
          updated_at?: string
        }
        Update: {
          apply_order?: number
          archived_at?: string | null
          archived_by?: string | null
          code?: string | null
          company_id?: string
          compound?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          rate_percent?: number
          registration_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_taxes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_transport_rates: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          company_id: string
          created_at: string
          distance_from_km: number | null
          distance_to_km: number | null
          flat_rate: number
          hourly_rate: number
          id: string
          is_active: boolean
          minimum_charge: number
          minimum_hours: number
          name: string
          notes: string | null
          rate_mode: string
          rate_per_km: number
          rate_per_trip: number
          sort_order: number
          truck_id: string | null
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          company_id?: string
          created_at?: string
          distance_from_km?: number | null
          distance_to_km?: number | null
          flat_rate?: number
          hourly_rate?: number
          id?: string
          is_active?: boolean
          minimum_charge?: number
          minimum_hours?: number
          name: string
          notes?: string | null
          rate_mode?: string
          rate_per_km?: number
          rate_per_trip?: number
          sort_order?: number
          truck_id?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          company_id?: string
          created_at?: string
          distance_from_km?: number | null
          distance_to_km?: number | null
          flat_rate?: number
          hourly_rate?: number
          id?: string
          is_active?: boolean
          minimum_charge?: number
          minimum_hours?: number
          name?: string
          notes?: string | null
          rate_mode?: string
          rate_per_km?: number
          rate_per_trip?: number
          sort_order?: number
          truck_id?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jsc_transport_rates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_transport_rates_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "jsc_trucks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_transport_rates_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "jsc_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_trucks: {
        Row: {
          access_requirements: string[] | null
          archived_at: string | null
          archived_by: string | null
          availability: string
          axle_count: number | null
          capacity_m3: number | null
          capacity_tonnes: number
          company_id: string
          created_at: string
          current_driver_id: string | null
          fixed_time_minutes: number
          hourly_rate: number
          id: string
          internal_notes: string | null
          is_active: boolean
          is_public: boolean
          is_subcontracted: boolean
          limitations: string[] | null
          loading_time_minutes: number
          name: string
          operational_status: string
          per_km_rate: number | null
          per_trip_rate: number | null
          public_description: string | null
          public_image_url: string | null
          public_uses: string[] | null
          sort_order: number
          truck_type: string | null
          unloading_time_minutes: number
          updated_at: string
        }
        Insert: {
          access_requirements?: string[] | null
          archived_at?: string | null
          archived_by?: string | null
          availability?: string
          axle_count?: number | null
          capacity_m3?: number | null
          capacity_tonnes?: number
          company_id?: string
          created_at?: string
          current_driver_id?: string | null
          fixed_time_minutes?: number
          hourly_rate?: number
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          is_public?: boolean
          is_subcontracted?: boolean
          limitations?: string[] | null
          loading_time_minutes?: number
          name: string
          operational_status?: string
          per_km_rate?: number | null
          per_trip_rate?: number | null
          public_description?: string | null
          public_image_url?: string | null
          public_uses?: string[] | null
          sort_order?: number
          truck_type?: string | null
          unloading_time_minutes?: number
          updated_at?: string
        }
        Update: {
          access_requirements?: string[] | null
          archived_at?: string | null
          archived_by?: string | null
          availability?: string
          axle_count?: number | null
          capacity_m3?: number | null
          capacity_tonnes?: number
          company_id?: string
          created_at?: string
          current_driver_id?: string | null
          fixed_time_minutes?: number
          hourly_rate?: number
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          is_public?: boolean
          is_subcontracted?: boolean
          limitations?: string[] | null
          loading_time_minutes?: number
          name?: string
          operational_status?: string
          per_km_rate?: number | null
          per_trip_rate?: number | null
          public_description?: string | null
          public_image_url?: string | null
          public_uses?: string[] | null
          sort_order?: number
          truck_type?: string | null
          unloading_time_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_trucks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_zones: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          center_address: string | null
          center_lat: number | null
          center_lng: number | null
          code: string | null
          company_id: string
          created_at: string
          distance_surcharge: number
          id: string
          is_active: boolean
          name: string
          notes: string | null
          radius_km: number | null
          region: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          center_address?: string | null
          center_lat?: number | null
          center_lng?: number | null
          code?: string | null
          company_id?: string
          created_at?: string
          distance_surcharge?: number
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          radius_km?: number | null
          region?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          center_address?: string | null
          center_lat?: number | null
          center_lng?: number | null
          code?: string | null
          company_id?: string
          created_at?: string
          distance_surcharge?: number
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          radius_km?: number | null
          region?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jsc_zones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
          },
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
          tonnage: number | null
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
          tonnage?: number | null
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
          tonnage?: number | null
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
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
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
      matching_settings: {
        Row: {
          created_at: string
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      matching_simulation_log: {
        Row: {
          algorithm_version: string
          created_at: string
          criteria: Json
          id: string
          result_count: number | null
          results: Json
          run_by: string | null
          top_score: number | null
        }
        Insert: {
          algorithm_version?: string
          created_at?: string
          criteria?: Json
          id?: string
          result_count?: number | null
          results?: Json
          run_by?: string | null
          top_score?: number | null
        }
        Update: {
          algorithm_version?: string
          created_at?: string
          criteria?: Json
          id?: string
          result_count?: number | null
          results?: Json
          run_by?: string | null
          top_score?: number | null
        }
        Relationships: []
      }
      material_action_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: string
          submission_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          submission_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          submission_id?: string | null
        }
        Relationships: []
      }
      material_aliases: {
        Row: {
          alias_norm: string
          alias_raw: string
          auto_match_allowed: boolean
          confidence: string
          created_at: string
          granulometry_id: string | null
          human_validated: boolean
          id: string
          is_active: boolean
          match_type: string
          material_id: string
          source: string
          updated_at: string
        }
        Insert: {
          alias_norm: string
          alias_raw: string
          auto_match_allowed?: boolean
          confidence?: string
          created_at?: string
          granulometry_id?: string | null
          human_validated?: boolean
          id?: string
          is_active?: boolean
          match_type?: string
          material_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          alias_norm?: string
          alias_raw?: string
          auto_match_allowed?: boolean
          confidence?: string
          created_at?: string
          granulometry_id?: string | null
          human_validated?: boolean
          id?: string
          is_active?: boolean
          match_type?: string
          material_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_aliases_granulometry_id_fkey"
            columns: ["granulometry_id"]
            isOneToOne: false
            referencedRelation: "material_granulometries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_aliases_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "material_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      material_catalog: {
        Row: {
          created_at: string
          description: string | null
          destination_types: string[]
          display_order: number
          family: string
          family_id: string | null
          id: string
          is_active: boolean
          legacy_key: string | null
          name_fr: string
          regulatory_level: string
          requires_dimensions: boolean
          requires_granulometry: boolean
          requires_qualification: boolean
          search_terms: string[]
          short_name: string | null
          slug: string
          subfamily: string | null
          updated_at: string
          visible_detailed: boolean
          visible_simple: boolean
        }
        Insert: {
          created_at?: string
          description?: string | null
          destination_types?: string[]
          display_order?: number
          family: string
          family_id?: string | null
          id?: string
          is_active?: boolean
          legacy_key?: string | null
          name_fr: string
          regulatory_level?: string
          requires_dimensions?: boolean
          requires_granulometry?: boolean
          requires_qualification?: boolean
          search_terms?: string[]
          short_name?: string | null
          slug: string
          subfamily?: string | null
          updated_at?: string
          visible_detailed?: boolean
          visible_simple?: boolean
        }
        Update: {
          created_at?: string
          description?: string | null
          destination_types?: string[]
          display_order?: number
          family?: string
          family_id?: string | null
          id?: string
          is_active?: boolean
          legacy_key?: string | null
          name_fr?: string
          regulatory_level?: string
          requires_dimensions?: boolean
          requires_granulometry?: boolean
          requires_qualification?: boolean
          search_terms?: string[]
          short_name?: string | null
          slug?: string
          subfamily?: string | null
          updated_at?: string
          visible_detailed?: boolean
          visible_simple?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "material_catalog_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "material_families"
            referencedColumns: ["id"]
          },
        ]
      }
      material_families: {
        Row: {
          code: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          level: string
          name_fr: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          level?: string
          name_fr: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          level?: string
          name_fr?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_families_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "material_families"
            referencedColumns: ["id"]
          },
        ]
      }
      material_granulometries: {
        Row: {
          code: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          label_fr: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label_fr: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label_fr?: string
          updated_at?: string
        }
        Relationships: []
      }
      material_offers: {
        Row: {
          address: string | null
          availability_end: string | null
          availability_start: string | null
          city: string | null
          created_at: string
          declared_clean: boolean | null
          declared_contaminated: boolean | null
          environmental_status: string
          geocoding_source: string | null
          granulometry_approximate: boolean
          granulometry_max_inches: number | null
          granulometry_min_inches: number | null
          id: string
          latitude: number | null
          location_raw: string | null
          longitude: number | null
          max_radius_km: number | null
          notes: string | null
          owner_user_id: string | null
          parser_confidence: number | null
          parser_version: string | null
          principal_material: string | null
          qualification_status: string
          quantity_approximate: boolean
          quantity_unit: string | null
          quantity_value: number | null
          raw_description: string | null
          region: string | null
          secondary_materials: string[]
          sector: string | null
          source_id: string | null
          source_type: string
          status: string
          trace_materials: string[]
          trip_count: number | null
          updated_at: string
          vehicle_type: string | null
        }
        Insert: {
          address?: string | null
          availability_end?: string | null
          availability_start?: string | null
          city?: string | null
          created_at?: string
          declared_clean?: boolean | null
          declared_contaminated?: boolean | null
          environmental_status?: string
          geocoding_source?: string | null
          granulometry_approximate?: boolean
          granulometry_max_inches?: number | null
          granulometry_min_inches?: number | null
          id?: string
          latitude?: number | null
          location_raw?: string | null
          longitude?: number | null
          max_radius_km?: number | null
          notes?: string | null
          owner_user_id?: string | null
          parser_confidence?: number | null
          parser_version?: string | null
          principal_material?: string | null
          qualification_status?: string
          quantity_approximate?: boolean
          quantity_unit?: string | null
          quantity_value?: number | null
          raw_description?: string | null
          region?: string | null
          secondary_materials?: string[]
          sector?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          trace_materials?: string[]
          trip_count?: number | null
          updated_at?: string
          vehicle_type?: string | null
        }
        Update: {
          address?: string | null
          availability_end?: string | null
          availability_start?: string | null
          city?: string | null
          created_at?: string
          declared_clean?: boolean | null
          declared_contaminated?: boolean | null
          environmental_status?: string
          geocoding_source?: string | null
          granulometry_approximate?: boolean
          granulometry_max_inches?: number | null
          granulometry_min_inches?: number | null
          id?: string
          latitude?: number | null
          location_raw?: string | null
          longitude?: number | null
          max_radius_km?: number | null
          notes?: string | null
          owner_user_id?: string | null
          parser_confidence?: number | null
          parser_version?: string | null
          principal_material?: string | null
          qualification_status?: string
          quantity_approximate?: boolean
          quantity_unit?: string | null
          quantity_value?: number | null
          raw_description?: string | null
          region?: string | null
          secondary_materials?: string[]
          sector?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          trace_materials?: string[]
          trip_count?: number | null
          updated_at?: string
          vehicle_type?: string | null
        }
        Relationships: []
      }
      material_review_queue: {
        Row: {
          confidence: string
          context: Json
          created_at: string
          id: string
          original_text: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_field: string
          status: string
          submission_id: string
          suggestions: Json
          updated_at: string
        }
        Insert: {
          confidence?: string
          context?: Json
          created_at?: string
          id?: string
          original_text: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_field: string
          status?: string
          submission_id: string
          suggestions?: Json
          updated_at?: string
        }
        Update: {
          confidence?: string
          context?: Json
          created_at?: string
          id?: string
          original_text?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_field?: string
          status?: string
          submission_id?: string
          suggestions?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_review_queue_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "material_review_queue_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      material_review_terms: {
        Row: {
          created_at: string
          id: string
          reason: string
          term_norm: string
          term_raw: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          term_norm: string
          term_raw: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          term_norm?: string
          term_raw?: string
        }
        Relationships: []
      }
      material_synonyms: {
        Row: {
          confidence: string
          created_at: string
          expression: string
          expression_norm: string
          id: string
          is_active: boolean
          language: string
          material_keys: string[]
          normalized_family_id: string | null
          normalized_material_id: string | null
          notes: string | null
          region: string
          updated_at: string
          validated_by_admin: boolean
        }
        Insert: {
          confidence?: string
          created_at?: string
          expression: string
          expression_norm: string
          id?: string
          is_active?: boolean
          language?: string
          material_keys?: string[]
          normalized_family_id?: string | null
          normalized_material_id?: string | null
          notes?: string | null
          region?: string
          updated_at?: string
          validated_by_admin?: boolean
        }
        Update: {
          confidence?: string
          created_at?: string
          expression?: string
          expression_norm?: string
          id?: string
          is_active?: boolean
          language?: string
          material_keys?: string[]
          normalized_family_id?: string | null
          normalized_material_id?: string | null
          notes?: string | null
          region?: string
          updated_at?: string
          validated_by_admin?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "material_synonyms_normalized_family_id_fkey"
            columns: ["normalized_family_id"]
            isOneToOne: false
            referencedRelation: "material_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_synonyms_normalized_material_id_fkey"
            columns: ["normalized_material_id"]
            isOneToOne: false
            referencedRelation: "material_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_activity_log: {
        Row: {
          action: string
          actor_id: string | null
          company_id: string | null
          created_at: string
          detail: Json
          entity: string
          entity_id: string | null
          id: string
          request_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          company_id?: string | null
          created_at?: string
          detail?: Json
          entity: string
          entity_id?: string | null
          id?: string
          request_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          company_id?: string | null
          created_at?: string
          detail?: Json
          entity?: string
          entity_id?: string | null
          id?: string
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_activity_log_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_activity_log_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_requests_for_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_admin_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          pinned: boolean
          request_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          pinned?: boolean
          request_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          pinned?: boolean
          request_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_admin_notes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_admin_notes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_requests_for_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_automation_rules: {
        Row: {
          created_at: string
          delay_hours: number
          description: string | null
          id: string
          is_active: boolean
          key: string
          label: string
          last_run_at: string | null
          max_runs: number
          params: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          delay_hours?: number
          description?: string | null
          id?: string
          is_active?: boolean
          key: string
          label: string
          last_run_at?: string | null
          max_runs?: number
          params?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          delay_hours?: number
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          last_run_at?: string | null
          max_runs?: number
          params?: Json
          updated_at?: string
        }
        Relationships: []
      }
      mkt_automation_runs: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          detail: Json
          id: string
          request_id: string | null
          rule_key: string
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          request_id?: string | null
          rule_key: string
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          request_id?: string | null
          rule_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_automation_runs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_automation_runs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_requests_for_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_awards: {
        Row: {
          amount: number | null
          awarded_at: string
          bid_id: string | null
          client_confirmed_at: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          final_amount: number | null
          id: string
          lot_id: string | null
          notes: string | null
          partner_confirmed_at: string | null
          request_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          awarded_at?: string
          bid_id?: string | null
          client_confirmed_at?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          final_amount?: number | null
          id?: string
          lot_id?: string | null
          notes?: string | null
          partner_confirmed_at?: string | null
          request_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          awarded_at?: string
          bid_id?: string | null
          client_confirmed_at?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          final_amount?: number | null
          id?: string
          lot_id?: string | null
          notes?: string | null
          partner_confirmed_at?: string | null
          request_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_awards_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "mkt_bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_awards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_awards_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "mkt_request_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_awards_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_awards_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_requests_for_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_bids: {
        Row: {
          amount: number | null
          available_from: string | null
          company_id: string
          conditions: string | null
          created_at: string
          id: string
          invitation_id: string | null
          lead_time: string | null
          lines: Json
          lot_id: string | null
          price_type: string
          request_id: string
          scope: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          taxes_included: boolean
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          amount?: number | null
          available_from?: string | null
          company_id: string
          conditions?: string | null
          created_at?: string
          id?: string
          invitation_id?: string | null
          lead_time?: string | null
          lines?: Json
          lot_id?: string | null
          price_type?: string
          request_id: string
          scope?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          taxes_included?: boolean
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          amount?: number | null
          available_from?: string | null
          company_id?: string
          conditions?: string | null
          created_at?: string
          id?: string
          invitation_id?: string | null
          lead_time?: string | null
          lines?: Json
          lot_id?: string | null
          price_type?: string
          request_id?: string
          scope?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          taxes_included?: boolean
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_bids_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_bids_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "mkt_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_bids_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "mkt_request_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_bids_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_bids_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_requests_for_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_commissions: {
        Row: {
          amount: number | null
          award_id: string | null
          base_amount: number | null
          company_id: string | null
          contested_at: string | null
          created_at: string
          id: string
          invoice_note: string | null
          invoiced_at: string | null
          label: string | null
          model: string | null
          notes: string | null
          paid_at: string | null
          request_id: string | null
          rule_id: string | null
          rule_snapshot: Json
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          award_id?: string | null
          base_amount?: number | null
          company_id?: string | null
          contested_at?: string | null
          created_at?: string
          id?: string
          invoice_note?: string | null
          invoiced_at?: string | null
          label?: string | null
          model?: string | null
          notes?: string | null
          paid_at?: string | null
          request_id?: string | null
          rule_id?: string | null
          rule_snapshot?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          award_id?: string | null
          base_amount?: number | null
          company_id?: string | null
          contested_at?: string | null
          created_at?: string
          id?: string
          invoice_note?: string | null
          invoiced_at?: string | null
          label?: string | null
          model?: string | null
          notes?: string | null
          paid_at?: string | null
          request_id?: string | null
          rule_id?: string | null
          rule_snapshot?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_commissions_award_id_fkey"
            columns: ["award_id"]
            isOneToOne: false
            referencedRelation: "mkt_awards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_commissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_commissions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_commissions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_requests_for_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_commissions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "mkt_pricing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_deals: {
        Row: {
          breakdown: Json
          carrier_company_id: string | null
          created_at: string
          created_by: string | null
          distance_km: number | null
          gst: number
          id: string
          margin_amount: number
          margin_percent: number
          material_cost: number
          material_label: string | null
          mode: string
          notes: string | null
          qst: number
          quantity: number | null
          request_id: string | null
          status: string
          subtotal: number
          supplier_company_id: string | null
          supply_price_id: string | null
          total: number
          transport_cost: number
          transport_rate_id: string | null
          trips: number | null
          truck_type: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          breakdown?: Json
          carrier_company_id?: string | null
          created_at?: string
          created_by?: string | null
          distance_km?: number | null
          gst?: number
          id?: string
          margin_amount?: number
          margin_percent?: number
          material_cost?: number
          material_label?: string | null
          mode?: string
          notes?: string | null
          qst?: number
          quantity?: number | null
          request_id?: string | null
          status?: string
          subtotal?: number
          supplier_company_id?: string | null
          supply_price_id?: string | null
          total?: number
          transport_cost?: number
          transport_rate_id?: string | null
          trips?: number | null
          truck_type?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          breakdown?: Json
          carrier_company_id?: string | null
          created_at?: string
          created_by?: string | null
          distance_km?: number | null
          gst?: number
          id?: string
          margin_amount?: number
          margin_percent?: number
          material_cost?: number
          material_label?: string | null
          mode?: string
          notes?: string | null
          qst?: number
          quantity?: number | null
          request_id?: string | null
          status?: string
          subtotal?: number
          supplier_company_id?: string | null
          supply_price_id?: string | null
          total?: number
          transport_cost?: number
          transport_rate_id?: string | null
          trips?: number | null
          truck_type?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_deals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_deals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_requests_for_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_deals_supply_price_id_fkey"
            columns: ["supply_price_id"]
            isOneToOne: false
            referencedRelation: "mkt_supply_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_deals_transport_rate_id_fkey"
            columns: ["transport_rate_id"]
            isOneToOne: false
            referencedRelation: "mkt_transport_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_documents: {
        Row: {
          bid_id: string | null
          company_id: string | null
          created_at: string
          doc_type: string
          file_path: string
          id: string
          lot_id: string | null
          mime_type: string | null
          name: string
          request_id: string | null
          size_bytes: number | null
          updated_at: string
          uploaded_by: string | null
          visibility: string
        }
        Insert: {
          bid_id?: string | null
          company_id?: string | null
          created_at?: string
          doc_type?: string
          file_path: string
          id?: string
          lot_id?: string | null
          mime_type?: string | null
          name: string
          request_id?: string | null
          size_bytes?: number | null
          updated_at?: string
          uploaded_by?: string | null
          visibility?: string
        }
        Update: {
          bid_id?: string | null
          company_id?: string | null
          created_at?: string
          doc_type?: string
          file_path?: string
          id?: string
          lot_id?: string | null
          mime_type?: string | null
          name?: string
          request_id?: string | null
          size_bytes?: number | null
          updated_at?: string
          uploaded_by?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_documents_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "mkt_bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_documents_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "mkt_request_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_documents_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_documents_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_requests_for_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_invitations: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          decline_reason: string | null
          distance_km: number | null
          id: string
          lot_id: string | null
          match_reasons: Json
          match_score: number | null
          mode: string
          request_id: string
          responded_at: string | null
          sent_at: string | null
          status: string
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          decline_reason?: string | null
          distance_km?: number | null
          id?: string
          lot_id?: string | null
          match_reasons?: Json
          match_score?: number | null
          mode?: string
          request_id: string
          responded_at?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          decline_reason?: string | null
          distance_km?: number | null
          id?: string
          lot_id?: string | null
          match_reasons?: Json
          match_score?: number | null
          mode?: string
          request_id?: string
          responded_at?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_invitations_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "mkt_request_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_invitations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_invitations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_requests_for_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_messages: {
        Row: {
          attachments: Json
          author_company_id: string | null
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          is_internal: boolean
          party: string
          thread_id: string
          updated_at: string
        }
        Insert: {
          attachments?: Json
          author_company_id?: string | null
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          party?: string
          thread_id: string
          updated_at?: string
        }
        Update: {
          attachments?: Json
          author_company_id?: string | null
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          party?: string
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_messages_author_company_id_fkey"
            columns: ["author_company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "mkt_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_notification_prefs: {
        Row: {
          app_enabled: boolean
          company_id: string | null
          created_at: string
          email_enabled: boolean
          id: string
          muted_events: string[]
          sms_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          app_enabled?: boolean
          company_id?: string | null
          created_at?: string
          email_enabled?: boolean
          id?: string
          muted_events?: string[]
          sms_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          app_enabled?: boolean
          company_id?: string | null
          created_at?: string
          email_enabled?: boolean
          id?: string
          muted_events?: string[]
          sms_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mkt_notifications: {
        Row: {
          audience: string
          body: string | null
          channels: string[]
          company_id: string | null
          created_at: string
          data: Json
          dedupe_key: string | null
          event: string
          id: string
          level: string
          link: string | null
          read_at: string | null
          request_id: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          audience?: string
          body?: string | null
          channels?: string[]
          company_id?: string | null
          created_at?: string
          data?: Json
          dedupe_key?: string | null
          event: string
          id?: string
          level?: string
          link?: string | null
          read_at?: string | null
          request_id?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          audience?: string
          body?: string | null
          channels?: string[]
          company_id?: string | null
          created_at?: string
          data?: Json
          dedupe_key?: string | null
          event?: string
          id?: string
          level?: string
          link?: string | null
          read_at?: string | null
          request_id?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_notifications_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_notifications_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_requests_for_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_number_counters: {
        Row: {
          seq: number
          updated_at: string
          year: number
        }
        Insert: {
          seq?: number
          updated_at?: string
          year: number
        }
        Update: {
          seq?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      mkt_partner_availability: {
        Row: {
          company_id: string
          created_at: string
          ends_on: string | null
          id: string
          is_active: boolean
          note: string | null
          quantity: number | null
          resource_label: string | null
          starts_on: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          ends_on?: string | null
          id?: string
          is_active?: boolean
          note?: string | null
          quantity?: number | null
          resource_label?: string | null
          starts_on?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          ends_on?: string | null
          id?: string
          is_active?: boolean
          note?: string | null
          quantity?: number | null
          resource_label?: string | null
          starts_on?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_partner_availability_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_partner_business_roles: {
        Row: {
          business_role: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          business_role: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          business_role?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_partner_business_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_partner_client_types: {
        Row: {
          client_type: string
          company_id: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          client_type: string
          company_id: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          client_type?: string
          company_id?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_partner_client_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_partner_credits: {
        Row: {
          balance: number
          company_id: string
          created_at: string
          last_topup_at: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          balance?: number
          company_id: string
          created_at?: string
          last_topup_at?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          balance?: number
          company_id?: string
          created_at?: string
          last_topup_at?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_partner_credits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_partner_documents: {
        Row: {
          admin_note: string | null
          company_id: string
          created_at: string
          doc_type: string
          expires_on: string | null
          file_path: string | null
          id: string
          issued_on: string | null
          issuer: string | null
          name: string
          reference: string | null
          status: string
          updated_at: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          admin_note?: string | null
          company_id: string
          created_at?: string
          doc_type: string
          expires_on?: string | null
          file_path?: string | null
          id?: string
          issued_on?: string | null
          issuer?: string | null
          name: string
          reference?: string | null
          status?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          admin_note?: string | null
          company_id?: string
          created_at?: string
          doc_type?: string
          expires_on?: string | null
          file_path?: string | null
          id?: string
          issued_on?: string | null
          issuer?: string | null
          name?: string
          reference?: string | null
          status?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_partner_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_partner_equipment: {
        Row: {
          capacity: string | null
          company_id: string
          created_at: string
          description: string | null
          equipment_type: string
          id: string
          is_active: boolean
          quantity: number
          updated_at: string
          with_operator: boolean | null
        }
        Insert: {
          capacity?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          equipment_type: string
          id?: string
          is_active?: boolean
          quantity?: number
          updated_at?: string
          with_operator?: boolean | null
        }
        Update: {
          capacity?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          equipment_type?: string
          id?: string
          is_active?: boolean
          quantity?: number
          updated_at?: string
          with_operator?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_partner_equipment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_partner_photos: {
        Row: {
          caption: string | null
          company_id: string
          created_at: string
          id: string
          is_public: boolean
          sort_order: number
          storage_path: string
          uploaded_by: string | null
          url: string
        }
        Insert: {
          caption?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_public?: boolean
          sort_order?: number
          storage_path: string
          uploaded_by?: string | null
          url: string
        }
        Update: {
          caption?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_public?: boolean
          sort_order?: number
          storage_path?: string
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_partner_photos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_partner_preferences: {
        Row: {
          category_ids: string[]
          cities: string[]
          client_types: string[]
          company_id: string
          created_at: string
          id: string
          max_project_amount: number | null
          min_project_amount: number | null
          notify_email: boolean
          notify_in_app: boolean
          notify_sms: boolean
          paused_until: string | null
          radius_km: number | null
          regions: string[]
          updated_at: string
        }
        Insert: {
          category_ids?: string[]
          cities?: string[]
          client_types?: string[]
          company_id: string
          created_at?: string
          id?: string
          max_project_amount?: number | null
          min_project_amount?: number | null
          notify_email?: boolean
          notify_in_app?: boolean
          notify_sms?: boolean
          paused_until?: string | null
          radius_km?: number | null
          regions?: string[]
          updated_at?: string
        }
        Update: {
          category_ids?: string[]
          cities?: string[]
          client_types?: string[]
          company_id?: string
          created_at?: string
          id?: string
          max_project_amount?: number | null
          min_project_amount?: number | null
          notify_email?: boolean
          notify_in_app?: boolean
          notify_sms?: boolean
          paused_until?: string | null
          radius_km?: number | null
          regions?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_partner_preferences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_partner_scores: {
        Row: {
          avg_response_hours: number | null
          awards_count: number
          bids_count: number
          cancelled_count: number
          company_id: string
          completed_count: number
          computed_at: string | null
          created_at: string
          disputes_count: number
          id: string
          internal_score: number
          invitations_count: number
          last_activity_at: string | null
          metrics: Json
          profile_completion: number
          public_score: number | null
          response_rate: number | null
          satisfaction: number | null
          show_public_score: boolean
          updated_at: string
        }
        Insert: {
          avg_response_hours?: number | null
          awards_count?: number
          bids_count?: number
          cancelled_count?: number
          company_id: string
          completed_count?: number
          computed_at?: string | null
          created_at?: string
          disputes_count?: number
          id?: string
          internal_score?: number
          invitations_count?: number
          last_activity_at?: string | null
          metrics?: Json
          profile_completion?: number
          public_score?: number | null
          response_rate?: number | null
          satisfaction?: number | null
          show_public_score?: boolean
          updated_at?: string
        }
        Update: {
          avg_response_hours?: number | null
          awards_count?: number
          bids_count?: number
          cancelled_count?: number
          company_id?: string
          completed_count?: number
          computed_at?: string | null
          created_at?: string
          disputes_count?: number
          id?: string
          internal_score?: number
          invitations_count?: number
          last_activity_at?: string | null
          metrics?: Json
          profile_completion?: number
          public_score?: number | null
          response_rate?: number | null
          satisfaction?: number | null
          show_public_score?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_partner_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_partner_services: {
        Row: {
          category_id: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          is_primary: boolean
          note: string | null
          updated_at: string
        }
        Insert: {
          category_id: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          note?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_partner_services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "mkt_service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_partner_services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_partner_territories: {
        Row: {
          center_address: string | null
          city: string | null
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          radius_km: number | null
          region: string | null
          scope: string
          updated_at: string
        }
        Insert: {
          center_address?: string | null
          city?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          radius_km?: number | null
          region?: string | null
          scope?: string
          updated_at?: string
        }
        Update: {
          center_address?: string | null
          city?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          radius_km?: number | null
          region?: string | null
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_partner_territories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_partners: {
        Row: {
          accepts_subcontracting: boolean
          accepts_tenders: boolean
          address: string | null
          archived_at: string | null
          archived_by: string | null
          availability_note: string | null
          availability_status: string
          city: string | null
          company_id: string
          contact_name: string | null
          created_at: string
          description: string | null
          email: string | null
          founded_year: number | null
          id: string
          is_active: boolean
          is_public: boolean
          is_verified: boolean
          latitude: number | null
          legal_name: string | null
          logo_url: string | null
          longitude: number | null
          max_distance_km: number | null
          max_project_amount: number | null
          min_project_amount: number | null
          neq: string | null
          onboarding_status: string
          phone: string | null
          postal_code: string | null
          profile_id: string | null
          project_sizes: string[]
          region: string | null
          trade_name: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          accepts_subcontracting?: boolean
          accepts_tenders?: boolean
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          availability_note?: string | null
          availability_status?: string
          city?: string | null
          company_id: string
          contact_name?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          founded_year?: number | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          is_verified?: boolean
          latitude?: number | null
          legal_name?: string | null
          logo_url?: string | null
          longitude?: number | null
          max_distance_km?: number | null
          max_project_amount?: number | null
          min_project_amount?: number | null
          neq?: string | null
          onboarding_status?: string
          phone?: string | null
          postal_code?: string | null
          profile_id?: string | null
          project_sizes?: string[]
          region?: string | null
          trade_name?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          accepts_subcontracting?: boolean
          accepts_tenders?: boolean
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          availability_note?: string | null
          availability_status?: string
          city?: string | null
          company_id?: string
          contact_name?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          founded_year?: number | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          is_verified?: boolean
          latitude?: number | null
          legal_name?: string | null
          logo_url?: string | null
          longitude?: number | null
          max_distance_km?: number | null
          max_project_amount?: number | null
          min_project_amount?: number | null
          neq?: string | null
          onboarding_status?: string
          phone?: string | null
          postal_code?: string | null
          profile_id?: string | null
          project_sizes?: string[]
          region?: string | null
          trade_name?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_partners_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_partners_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "jsc_marketplace_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_partners_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "jsc_marketplace_profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_pricing_rules: {
        Row: {
          category_id: string | null
          company_id: string | null
          created_at: string
          credits: number | null
          fixed_amount: number | null
          id: string
          is_default: boolean
          label: string
          max_amount: number | null
          min_amount: number | null
          model: string
          notes: string | null
          priority: number
          rate_percent: number | null
          scope: string
          status: string
          subscription_amount: number | null
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          category_id?: string | null
          company_id?: string | null
          created_at?: string
          credits?: number | null
          fixed_amount?: number | null
          id?: string
          is_default?: boolean
          label: string
          max_amount?: number | null
          min_amount?: number | null
          model: string
          notes?: string | null
          priority?: number
          rate_percent?: number | null
          scope?: string
          status?: string
          subscription_amount?: number | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          category_id?: string | null
          company_id?: string | null
          created_at?: string
          credits?: number | null
          fixed_amount?: number | null
          id?: string
          is_default?: boolean
          label?: string
          max_amount?: number | null
          min_amount?: number | null
          model?: string
          notes?: string | null
          priority?: number
          rate_percent?: number | null
          scope?: string
          status?: string
          subscription_amount?: number | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_pricing_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "mkt_service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_pricing_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_quote_requests: {
        Row: {
          address: string | null
          answers: Json
          archived_at: string | null
          archived_by: string | null
          assigned_to: string | null
          budget_max: number | null
          budget_min: number | null
          category_id: string | null
          city: string | null
          client_id: string | null
          client_type: string
          client_user_id: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_revealed_at: string | null
          contact_revealed_by: string | null
          contact_visibility: string
          created_at: string
          created_by: string | null
          deadline_at: string | null
          description: string | null
          desired_date: string | null
          distribution_mode: string
          estimated_value: number | null
          id: string
          internal_notes: string | null
          is_active: boolean
          is_multi_lot: boolean
          latitude: number | null
          longitude: number | null
          organization_name: string | null
          postal_code: string | null
          region: string | null
          request_number: string | null
          schedule_note: string | null
          source: string
          status: string
          subcategory_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          answers?: Json
          archived_at?: string | null
          archived_by?: string | null
          assigned_to?: string | null
          budget_max?: number | null
          budget_min?: number | null
          category_id?: string | null
          city?: string | null
          client_id?: string | null
          client_type?: string
          client_user_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_revealed_at?: string | null
          contact_revealed_by?: string | null
          contact_visibility?: string
          created_at?: string
          created_by?: string | null
          deadline_at?: string | null
          description?: string | null
          desired_date?: string | null
          distribution_mode?: string
          estimated_value?: number | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          is_multi_lot?: boolean
          latitude?: number | null
          longitude?: number | null
          organization_name?: string | null
          postal_code?: string | null
          region?: string | null
          request_number?: string | null
          schedule_note?: string | null
          source?: string
          status?: string
          subcategory_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          answers?: Json
          archived_at?: string | null
          archived_by?: string | null
          assigned_to?: string | null
          budget_max?: number | null
          budget_min?: number | null
          category_id?: string | null
          city?: string | null
          client_id?: string | null
          client_type?: string
          client_user_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_revealed_at?: string | null
          contact_revealed_by?: string | null
          contact_visibility?: string
          created_at?: string
          created_by?: string | null
          deadline_at?: string | null
          description?: string | null
          desired_date?: string | null
          distribution_mode?: string
          estimated_value?: number | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          is_multi_lot?: boolean
          latitude?: number | null
          longitude?: number | null
          organization_name?: string | null
          postal_code?: string | null
          region?: string | null
          request_number?: string | null
          schedule_note?: string | null
          source?: string
          status?: string
          subcategory_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_quote_requests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "mkt_service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_quote_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "jsc_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_quote_requests_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "mkt_service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_request_lots: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          ends_on: string | null
          estimated_amount: number | null
          id: string
          lot_number: string
          quantity: number | null
          quantity_unit: string | null
          request_id: string
          schedule_note: string | null
          sort_order: number
          starts_on: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          ends_on?: string | null
          estimated_amount?: number | null
          id?: string
          lot_number: string
          quantity?: number | null
          quantity_unit?: string | null
          request_id: string
          schedule_note?: string | null
          sort_order?: number
          starts_on?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          ends_on?: string | null
          estimated_amount?: number | null
          id?: string
          lot_number?: string
          quantity?: number | null
          quantity_unit?: string | null
          request_id?: string
          schedule_note?: string | null
          sort_order?: number
          starts_on?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_request_lots_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "mkt_service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_request_lots_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_request_lots_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_requests_for_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_reviews: {
        Row: {
          author_name: string | null
          author_user_id: string
          comment: string | null
          company_id: string
          created_at: string
          id: string
          rating: number
          request_id: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          author_name?: string | null
          author_user_id?: string
          comment?: string | null
          company_id: string
          created_at?: string
          id?: string
          rating: number
          request_id?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          author_name?: string | null
          author_user_id?: string
          comment?: string | null
          company_id?: string
          created_at?: string
          id?: string
          rating?: number
          request_id?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_service_categories: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          code: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          keywords: string[]
          level: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          tags: string[]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          level?: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          tags?: string[]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          level?: string
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_service_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "mkt_service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_settings: {
        Row: {
          auto_min_score: number
          auto_top_n: number
          contact_reveal_default: string
          distribution_mode: string
          id: string
          invite_expiry_hours: number
          require_compliance: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_min_score?: number
          auto_top_n?: number
          contact_reveal_default?: string
          distribution_mode?: string
          id?: string
          invite_expiry_hours?: number
          require_compliance?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_min_score?: number
          auto_top_n?: number
          contact_reveal_default?: string
          distribution_mode?: string
          id?: string
          invite_expiry_hours?: number
          require_compliance?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      mkt_supply_prices: {
        Row: {
          category_id: string | null
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          is_taxable: boolean
          latitude: number | null
          longitude: number | null
          material_label: string
          min_fee: number
          notes: string | null
          pickup_address: string | null
          pickup_city: string | null
          price: number
          surcharge_percent: number
          unit: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          category_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_taxable?: boolean
          latitude?: number | null
          longitude?: number | null
          material_label: string
          min_fee?: number
          notes?: string | null
          pickup_address?: string | null
          pickup_city?: string | null
          price?: number
          surcharge_percent?: number
          unit?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          category_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_taxable?: boolean
          latitude?: number | null
          longitude?: number | null
          material_label?: string
          min_fee?: number
          notes?: string | null
          pickup_address?: string | null
          pickup_city?: string | null
          price?: number
          surcharge_percent?: number
          unit?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_supply_prices_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "mkt_service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_thread_participants: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          last_read_at: string | null
          party: string
          thread_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          last_read_at?: string | null
          party?: string
          thread_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          last_read_at?: string | null
          party?: string
          thread_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_thread_participants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_thread_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "mkt_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_threads: {
        Row: {
          bid_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          last_message_at: string | null
          lot_id: string | null
          request_id: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          bid_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          last_message_at?: string | null
          lot_id?: string | null
          request_id?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          bid_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          last_message_at?: string | null
          lot_id?: string | null
          request_id?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_threads_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "mkt_bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_threads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_threads_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "mkt_request_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_threads_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_threads_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mkt_requests_for_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_transport_rates: {
        Row: {
          base_city: string | null
          capacity_tonnes: number | null
          capacity_verges: number | null
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          max_distance_km: number | null
          min_fee: number
          notes: string | null
          price: number
          price_model: string
          price_per_km: number
          surcharge_percent: number
          truck_type: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          base_city?: string | null
          capacity_tonnes?: number | null
          capacity_verges?: number | null
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          max_distance_km?: number | null
          min_fee?: number
          notes?: string | null
          price?: number
          price_model?: string
          price_per_km?: number
          surcharge_percent?: number
          truck_type?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          base_city?: string | null
          capacity_tonnes?: number | null
          capacity_verges?: number | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          max_distance_km?: number | null
          min_fee?: number
          notes?: string | null
          price?: number
          price_model?: string
          price_per_km?: number
          surcharge_percent?: number
          truck_type?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      parcours_preview_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          payload: Json
          session_key: string
          step: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          payload?: Json
          session_key: string
          step?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          payload?: Json
          session_key?: string
          step?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          charged_to_entrepreneur: number | null
          client_address: string | null
          client_confirmation: string | null
          client_email: string | null
          client_id: string | null
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
          client_id?: string | null
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
          client_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients_v"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          details: Json
          id: string
          last_seen_at: string
          occurrences: number
          severity: string
          source: string
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          details?: Json
          id?: string
          last_seen_at?: string
          occurrences?: number
          severity?: string
          source: string
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          details?: Json
          id?: string
          last_seen_at?: string
          occurrences?: number
          severity?: string
          source?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_billing_events: {
        Row: {
          company_id: string | null
          environment: string
          error: string | null
          event_created_at: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          provider_event_id: string
          provider_subscription_id: string | null
          received_at: string
          status: string
        }
        Insert: {
          company_id?: string | null
          environment: string
          error?: string | null
          event_created_at?: string | null
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          provider_event_id: string
          provider_subscription_id?: string | null
          received_at?: string
          status?: string
        }
        Update: {
          company_id?: string | null
          environment?: string
          error?: string | null
          event_created_at?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          provider_subscription_id?: string | null
          received_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_billing_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_change_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          changes: Json
          company_id: string | null
          created_at: string
          entity_id: string | null
          entity_table: string
          id: string
          scope: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          changes?: Json
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table: string
          id?: string
          scope: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          changes?: Json
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string
          id?: string
          scope?: string
        }
        Relationships: []
      }
      platform_checkout_locks: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          environment: string
          expires_at: string
          id: string
          provider_session_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          environment: string
          expires_at?: string
          id?: string
          provider_session_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          environment?: string
          expires_at?: string
          id?: string
          provider_session_id?: string | null
        }
        Relationships: []
      }
      platform_company_sectors: {
        Row: {
          company_id: string
          created_at: string
          id: string
          sector_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          sector_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          sector_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_company_sectors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_company_sectors_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "platform_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_logs: {
        Row: {
          context: Json
          created_at: string
          duration_ms: number | null
          event: string
          id: number
          level: string
          message: string | null
          ref_id: string | null
          source: string
          status_code: number | null
          user_id: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          duration_ms?: number | null
          event: string
          id?: number
          level?: string
          message?: string | null
          ref_id?: string | null
          source: string
          status_code?: number | null
          user_id?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          duration_ms?: number | null
          event?: string
          id?: number
          level?: string
          message?: string | null
          ref_id?: string | null
          source?: string
          status_code?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      platform_plans: {
        Row: {
          audience: string
          billing_interval: string
          created_at: string
          currency: string
          description: string | null
          features: Json
          id: string
          is_test: boolean
          name: string
          notes: string | null
          price_cents: number | null
          provider_price_id: string | null
          slug: string
          status: string
          tax_note: string | null
          updated_at: string
          version: number
        }
        Insert: {
          audience?: string
          billing_interval?: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          is_test?: boolean
          name: string
          notes?: string | null
          price_cents?: number | null
          provider_price_id?: string | null
          slug: string
          status?: string
          tax_note?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          audience?: string
          billing_interval?: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          is_test?: boolean
          name?: string
          notes?: string | null
          price_cents?: number | null
          provider_price_id?: string | null
          slug?: string
          status?: string
          tax_note?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      platform_sectors: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_subscriptions: {
        Row: {
          amount_cents: number | null
          billing_email: string | null
          billing_status: string | null
          cancel_at: string | null
          cancel_at_period_end: boolean
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          current_period_end: string | null
          current_period_start: string | null
          ended_at: string | null
          environment: string
          id: string
          is_test: boolean
          last_error: string | null
          last_event_at: string | null
          last_payment_failed_at: string | null
          last_synced_at: string | null
          plan_id: string
          plan_version: number | null
          price_ref: string | null
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          billing_email?: string | null
          billing_status?: string | null
          cancel_at?: string | null
          cancel_at_period_end?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          ended_at?: string | null
          environment?: string
          id?: string
          is_test?: boolean
          last_error?: string | null
          last_event_at?: string | null
          last_payment_failed_at?: string | null
          last_synced_at?: string | null
          plan_id: string
          plan_version?: number | null
          price_ref?: string | null
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          billing_email?: string | null
          billing_status?: string | null
          cancel_at?: string | null
          cancel_at_period_end?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          ended_at?: string | null
          environment?: string
          id?: string
          is_test?: boolean
          last_error?: string | null
          last_event_at?: string | null
          last_payment_failed_at?: string | null
          last_synced_at?: string | null
          plan_id?: string
          plan_version?: number | null
          price_ref?: string | null
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "platform_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      public_request_guard: {
        Row: {
          created_at: string
          fingerprint: string | null
          id: string
          identity: string
          payload: Json
          scope: string
        }
        Insert: {
          created_at?: string
          fingerprint?: string | null
          id?: string
          identity: string
          payload?: Json
          scope: string
        }
        Update: {
          created_at?: string
          fingerprint?: string | null
          id?: string
          identity?: string
          payload?: Json
          scope?: string
        }
        Relationships: []
      }
      qualification_confirmations: {
        Row: {
          category: string
          confidence_before_confirmation: string | null
          confirmed_at: string
          confirmed_by: string
          confirmed_value: Json | null
          created_at: string
          decision: string
          id: string
          note: string | null
          original_text: string | null
          previous_value: Json | null
          proposed_value: Json | null
          source: string
          subject: string
          submission_id: string
          supersedes_id: string | null
        }
        Insert: {
          category: string
          confidence_before_confirmation?: string | null
          confirmed_at?: string
          confirmed_by: string
          confirmed_value?: Json | null
          created_at?: string
          decision: string
          id?: string
          note?: string | null
          original_text?: string | null
          previous_value?: Json | null
          proposed_value?: Json | null
          source?: string
          subject: string
          submission_id: string
          supersedes_id?: string | null
        }
        Update: {
          category?: string
          confidence_before_confirmation?: string | null
          confirmed_at?: string
          confirmed_by?: string
          confirmed_value?: Json | null
          created_at?: string
          decision?: string
          id?: string
          note?: string | null
          original_text?: string | null
          previous_value?: Json | null
          proposed_value?: Json | null
          source?: string
          subject?: string
          submission_id?: string
          supersedes_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qualification_confirmations_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "qualification_confirmations"
            referencedColumns: ["id"]
          },
        ]
      }
      qualification_term_proposals: {
        Row: {
          context: string | null
          created_at: string
          decision: string | null
          id: string
          occurrences: number
          proposed_material_key: string | null
          resolved_at: string | null
          resolved_by: string | null
          term: string
          term_norm: string
          updated_at: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          decision?: string | null
          id?: string
          occurrences?: number
          proposed_material_key?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          term: string
          term_norm: string
          updated_at?: string
        }
        Update: {
          context?: string | null
          created_at?: string
          decision?: string | null
          id?: string
          occurrences?: number
          proposed_material_key?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          term?: string
          term_norm?: string
          updated_at?: string
        }
        Relationships: []
      }
      route_cache: {
        Row: {
          cache_key: string
          created_at: string
          distance_km: number | null
          duration_minutes: number | null
          hits: number
          last_used_at: string
          route_exists: boolean
        }
        Insert: {
          cache_key: string
          created_at?: string
          distance_km?: number | null
          duration_minutes?: number | null
          hits?: number
          last_used_at?: string
          route_exists?: boolean
        }
        Update: {
          cache_key?: string
          created_at?: string
          distance_km?: number | null
          duration_minutes?: number | null
          hits?: number
          last_used_at?: string
          route_exists?: boolean
        }
        Relationships: []
      }
      seo_advisor_reports: {
        Row: {
          created_at: string
          estimated_gain: Json
          generated_at: string
          id: string
          issues: Json
          opportunities: Json
          period_label: string
          report_md: string
          summary: string
        }
        Insert: {
          created_at?: string
          estimated_gain?: Json
          generated_at?: string
          id?: string
          issues?: Json
          opportunities?: Json
          period_label: string
          report_md?: string
          summary?: string
        }
        Update: {
          created_at?: string
          estimated_gain?: Json
          generated_at?: string
          id?: string
          issues?: Json
          opportunities?: Json
          period_label?: string
          report_md?: string
          summary?: string
        }
        Relationships: []
      }
      seo_broken_links: {
        Row: {
          checked_at: string
          error_message: string | null
          http_status: number | null
          id: string
          resolved: boolean
          source_page: string | null
          url: string
        }
        Insert: {
          checked_at?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          resolved?: boolean
          source_page?: string | null
          url: string
        }
        Update: {
          checked_at?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          resolved?: boolean
          source_page?: string | null
          url?: string
        }
        Relationships: []
      }
      seo_business_metrics: {
        Row: {
          ads_equivalent_value: number
          attributed_revenue: number
          cost_per_submission: number
          created_at: string
          estimated_revenue: number
          extras: Json
          id: string
          organic_visitors: number
          period_month: string
          roi: number
          seo_conversion_rate: number
          seo_submissions: number
          updated_at: string
        }
        Insert: {
          ads_equivalent_value?: number
          attributed_revenue?: number
          cost_per_submission?: number
          created_at?: string
          estimated_revenue?: number
          extras?: Json
          id?: string
          organic_visitors?: number
          period_month: string
          roi?: number
          seo_conversion_rate?: number
          seo_submissions?: number
          updated_at?: string
        }
        Update: {
          ads_equivalent_value?: number
          attributed_revenue?: number
          cost_per_submission?: number
          created_at?: string
          estimated_revenue?: number
          extras?: Json
          id?: string
          organic_visitors?: number
          period_month?: string
          roi?: number
          seo_conversion_rate?: number
          seo_submissions?: number
          updated_at?: string
        }
        Relationships: []
      }
      seo_cities: {
        Row: {
          active: boolean
          arrondissement: string | null
          created_at: string
          id: string
          intro: string | null
          last_generated_at: string | null
          latitude: number | null
          longitude: number | null
          mrc: string | null
          name: string
          neighbors: string[]
          parent_slug: string | null
          population: number | null
          province: string
          region: string
          region_admin: string | null
          seo_priority: number
          served: boolean
          slug: string
          sort_order: number
          territory_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          arrondissement?: string | null
          created_at?: string
          id?: string
          intro?: string | null
          last_generated_at?: string | null
          latitude?: number | null
          longitude?: number | null
          mrc?: string | null
          name: string
          neighbors?: string[]
          parent_slug?: string | null
          population?: number | null
          province?: string
          region?: string
          region_admin?: string | null
          seo_priority?: number
          served?: boolean
          slug: string
          sort_order?: number
          territory_type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          arrondissement?: string | null
          created_at?: string
          id?: string
          intro?: string | null
          last_generated_at?: string | null
          latitude?: number | null
          longitude?: number | null
          mrc?: string | null
          name?: string
          neighbors?: string[]
          parent_slug?: string | null
          population?: number | null
          province?: string
          region?: string
          region_admin?: string | null
          seo_priority?: number
          served?: boolean
          slug?: string
          sort_order?: number
          territory_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      seo_city_batches: {
        Row: {
          city_slug: string
          created_at: string
          current_step: string | null
          done_tasks: number
          failed_tasks: number
          finished_at: string | null
          id: string
          last_error: string | null
          last_progress_at: string | null
          qa_avg: number | null
          retries_count: number
          run_id: string
          sitemap_updated_at: string | null
          sort_order: number
          started_at: string | null
          status: string
          succeeded_tasks: number
          total_tasks: number
          updated_at: string
        }
        Insert: {
          city_slug: string
          created_at?: string
          current_step?: string | null
          done_tasks?: number
          failed_tasks?: number
          finished_at?: string | null
          id?: string
          last_error?: string | null
          last_progress_at?: string | null
          qa_avg?: number | null
          retries_count?: number
          run_id: string
          sitemap_updated_at?: string | null
          sort_order?: number
          started_at?: string | null
          status?: string
          succeeded_tasks?: number
          total_tasks?: number
          updated_at?: string
        }
        Update: {
          city_slug?: string
          created_at?: string
          current_step?: string | null
          done_tasks?: number
          failed_tasks?: number
          finished_at?: string | null
          id?: string
          last_error?: string | null
          last_progress_at?: string | null
          qa_avg?: number | null
          retries_count?: number
          run_id?: string
          sitemap_updated_at?: string | null
          sort_order?: number
          started_at?: string | null
          status?: string
          succeeded_tasks?: number
          total_tasks?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_city_batches_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "seo_pipeline_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_competitor_pages: {
        Row: {
          city_slug: string | null
          competitor_id: string
          h1: string | null
          id: string
          keywords: string[]
          last_crawled_at: string
          material_slug: string | null
          meta_description: string | null
          service_slug: string | null
          title: string | null
          url: string
          word_count: number | null
        }
        Insert: {
          city_slug?: string | null
          competitor_id: string
          h1?: string | null
          id?: string
          keywords?: string[]
          last_crawled_at?: string
          material_slug?: string | null
          meta_description?: string | null
          service_slug?: string | null
          title?: string | null
          url: string
          word_count?: number | null
        }
        Update: {
          city_slug?: string | null
          competitor_id?: string
          h1?: string | null
          id?: string
          keywords?: string[]
          last_crawled_at?: string
          material_slug?: string | null
          meta_description?: string | null
          service_slug?: string | null
          title?: string | null
          url?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_competitor_pages_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "seo_competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_competitors: {
        Row: {
          active: boolean
          created_at: string
          domain: string
          id: string
          label: string | null
          last_crawled_at: string | null
          notes: string | null
          pages_count: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          domain: string
          id?: string
          label?: string | null
          last_crawled_at?: string | null
          notes?: string | null
          pages_count?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          domain?: string
          id?: string
          label?: string | null
          last_crawled_at?: string | null
          notes?: string | null
          pages_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      seo_generation_jobs: {
        Row: {
          blocked_items: Json
          combinations: Json
          created_at: string
          created_by: string | null
          current_attempt: number
          current_started_at: string | null
          current_step: string | null
          current_target: Json | null
          done: number
          errors: Json
          eta_seconds: number | null
          failed: number
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          last_progress_at: string | null
          mode: string
          pages_per_minute: number | null
          progress_samples: Json
          report: Json
          retry_queue: Json
          started_at: string | null
          status: string
          succeeded: number
          total: number
          updated_at: string
          watchdog_events: Json
          wave: string | null
        }
        Insert: {
          blocked_items?: Json
          combinations?: Json
          created_at?: string
          created_by?: string | null
          current_attempt?: number
          current_started_at?: string | null
          current_step?: string | null
          current_target?: Json | null
          done?: number
          errors?: Json
          eta_seconds?: number | null
          failed?: number
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          last_progress_at?: string | null
          mode?: string
          pages_per_minute?: number | null
          progress_samples?: Json
          report?: Json
          retry_queue?: Json
          started_at?: string | null
          status?: string
          succeeded?: number
          total?: number
          updated_at?: string
          watchdog_events?: Json
          wave?: string | null
        }
        Update: {
          blocked_items?: Json
          combinations?: Json
          created_at?: string
          created_by?: string | null
          current_attempt?: number
          current_started_at?: string | null
          current_step?: string | null
          current_target?: Json | null
          done?: number
          errors?: Json
          eta_seconds?: number | null
          failed?: number
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          last_progress_at?: string | null
          mode?: string
          pages_per_minute?: number | null
          progress_samples?: Json
          report?: Json
          retry_queue?: Json
          started_at?: string | null
          status?: string
          succeeded?: number
          total?: number
          updated_at?: string
          watchdog_events?: Json
          wave?: string | null
        }
        Relationships: []
      }
      seo_goals: {
        Row: {
          active: boolean
          created_at: string
          current_value: number
          deadline: string | null
          id: string
          keyword: string | null
          label: string
          last_refreshed_at: string | null
          metric_type: string
          target_value: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          current_value?: number
          deadline?: string | null
          id?: string
          keyword?: string | null
          label: string
          last_refreshed_at?: string | null
          metric_type: string
          target_value: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          current_value?: number
          deadline?: string | null
          id?: string
          keyword?: string | null
          label?: string
          last_refreshed_at?: string | null
          metric_type?: string
          target_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      seo_gsc_metrics: {
        Row: {
          clicks: number
          ctr: number
          fetched_at: string
          id: string
          impressions: number
          index_status: string | null
          page_id: string
          period: string
          position: number
          top_queries: Json
        }
        Insert: {
          clicks?: number
          ctr?: number
          fetched_at?: string
          id?: string
          impressions?: number
          index_status?: string | null
          page_id: string
          period: string
          position?: number
          top_queries?: Json
        }
        Update: {
          clicks?: number
          ctr?: number
          fetched_at?: string
          id?: string
          impressions?: number
          index_status?: string | null
          page_id?: string
          period?: string
          position?: number
          top_queries?: Json
        }
        Relationships: [
          {
            foreignKeyName: "seo_gsc_metrics_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_bulk_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_gsc_metrics_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_gsc_ga4_merged_v"
            referencedColumns: ["page_id"]
          },
          {
            foreignKeyName: "seo_gsc_metrics_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_page_triage_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_gsc_metrics_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_material_uses: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          material_slug: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          material_slug: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          material_slug?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      seo_materials: {
        Row: {
          active: boolean
          created_at: string
          delivery_unit: string
          description: string
          id: string
          keywords: string[]
          name: string
          related_materials: string[]
          short_name: string
          slug: string
          sort_order: number
          updated_at: string
          use_cases: string[]
        }
        Insert: {
          active?: boolean
          created_at?: string
          delivery_unit?: string
          description?: string
          id?: string
          keywords?: string[]
          name: string
          related_materials?: string[]
          short_name?: string
          slug: string
          sort_order?: number
          updated_at?: string
          use_cases?: string[]
        }
        Update: {
          active?: boolean
          created_at?: string
          delivery_unit?: string
          description?: string
          id?: string
          keywords?: string[]
          name?: string
          related_materials?: string[]
          short_name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
          use_cases?: string[]
        }
        Relationships: []
      }
      seo_opportunities: {
        Row: {
          applied_at: string | null
          category: string | null
          created_at: string
          data: Json
          data_quality: string | null
          detected_at: string
          dismiss_reason: string | null
          dismissed_at: string | null
          effort_score: number
          entity_slug: string | null
          entity_type: string | null
          evidence: Json
          expected_impact: string | null
          id: string
          impact_score: number
          last_error: string | null
          last_seen_at: string
          page_id: string | null
          potential_clicks: number | null
          potential_leads: number | null
          potential_searches: number | null
          priority: string
          rationale: string
          reason: string | null
          recommended_action: string | null
          resolved_at: string | null
          run_id: string | null
          score: number
          score_factors: Json
          signal_key: string | null
          source: string | null
          stale_at: string | null
          status: string
          suggested_action: string
          target_city_slug: string | null
          target_material_slug: string | null
          target_service_slug: string | null
          tenant_id: string | null
          title: string
          type: string
          updated_at: string
          url: string | null
          work_started_at: string | null
        }
        Insert: {
          applied_at?: string | null
          category?: string | null
          created_at?: string
          data?: Json
          data_quality?: string | null
          detected_at?: string
          dismiss_reason?: string | null
          dismissed_at?: string | null
          effort_score?: number
          entity_slug?: string | null
          entity_type?: string | null
          evidence?: Json
          expected_impact?: string | null
          id?: string
          impact_score?: number
          last_error?: string | null
          last_seen_at?: string
          page_id?: string | null
          potential_clicks?: number | null
          potential_leads?: number | null
          potential_searches?: number | null
          priority?: string
          rationale: string
          reason?: string | null
          recommended_action?: string | null
          resolved_at?: string | null
          run_id?: string | null
          score?: number
          score_factors?: Json
          signal_key?: string | null
          source?: string | null
          stale_at?: string | null
          status?: string
          suggested_action: string
          target_city_slug?: string | null
          target_material_slug?: string | null
          target_service_slug?: string | null
          tenant_id?: string | null
          title: string
          type: string
          updated_at?: string
          url?: string | null
          work_started_at?: string | null
        }
        Update: {
          applied_at?: string | null
          category?: string | null
          created_at?: string
          data?: Json
          data_quality?: string | null
          detected_at?: string
          dismiss_reason?: string | null
          dismissed_at?: string | null
          effort_score?: number
          entity_slug?: string | null
          entity_type?: string | null
          evidence?: Json
          expected_impact?: string | null
          id?: string
          impact_score?: number
          last_error?: string | null
          last_seen_at?: string
          page_id?: string | null
          potential_clicks?: number | null
          potential_leads?: number | null
          potential_searches?: number | null
          priority?: string
          rationale?: string
          reason?: string | null
          recommended_action?: string | null
          resolved_at?: string | null
          run_id?: string | null
          score?: number
          score_factors?: Json
          signal_key?: string | null
          source?: string | null
          stale_at?: string | null
          status?: string
          suggested_action?: string
          target_city_slug?: string | null
          target_material_slug?: string | null
          target_service_slug?: string | null
          tenant_id?: string | null
          title?: string
          type?: string
          updated_at?: string
          url?: string | null
          work_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_opportunities_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_bulk_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_opportunities_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_gsc_ga4_merged_v"
            referencedColumns: ["page_id"]
          },
          {
            foreignKeyName: "seo_opportunities_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_page_triage_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_opportunities_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_opportunity_actions: {
        Row: {
          action_key: string | null
          action_kind: string | null
          action_type: string
          after_data: Json
          before_data: Json
          capability: string | null
          created_at: string
          error: string | null
          id: string
          note: string | null
          opportunity_id: string | null
          page_id: string | null
          page_slug: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          action_key?: string | null
          action_kind?: string | null
          action_type: string
          after_data?: Json
          before_data?: Json
          capability?: string | null
          created_at?: string
          error?: string | null
          id?: string
          note?: string | null
          opportunity_id?: string | null
          page_id?: string | null
          page_slug?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          action_key?: string | null
          action_kind?: string | null
          action_type?: string
          after_data?: Json
          before_data?: Json
          capability?: string | null
          created_at?: string
          error?: string | null
          id?: string
          note?: string | null
          opportunity_id?: string | null
          page_id?: string | null
          page_slug?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_opportunity_actions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "seo_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_opportunity_runs: {
        Row: {
          cities_analyzed: number
          comparison: Json | null
          conversions_analyzed: number
          created_at: string
          critical_count: number
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          group_insights: Json
          gsc_rows_analyzed: number
          high_count: number
          id: string
          impressions_analyzed: number
          indexed_analyzed: number
          low_count: number
          medium_count: number
          new_count: number
          opportunities_detected: number
          pages_analyzed: number
          period: string
          published_analyzed: number
          resolved_count: number
          rules: Json
          services_analyzed: number
          signals_detected: number
          signals_rejected: number
          stale_count: number
          started_at: string
          status: string
          top_opportunities: Json
          updated_count: number
        }
        Insert: {
          cities_analyzed?: number
          comparison?: Json | null
          conversions_analyzed?: number
          created_at?: string
          critical_count?: number
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          group_insights?: Json
          gsc_rows_analyzed?: number
          high_count?: number
          id?: string
          impressions_analyzed?: number
          indexed_analyzed?: number
          low_count?: number
          medium_count?: number
          new_count?: number
          opportunities_detected?: number
          pages_analyzed?: number
          period?: string
          published_analyzed?: number
          resolved_count?: number
          rules?: Json
          services_analyzed?: number
          signals_detected?: number
          signals_rejected?: number
          stale_count?: number
          started_at?: string
          status?: string
          top_opportunities?: Json
          updated_count?: number
        }
        Update: {
          cities_analyzed?: number
          comparison?: Json | null
          conversions_analyzed?: number
          created_at?: string
          critical_count?: number
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          group_insights?: Json
          gsc_rows_analyzed?: number
          high_count?: number
          id?: string
          impressions_analyzed?: number
          indexed_analyzed?: number
          low_count?: number
          medium_count?: number
          new_count?: number
          opportunities_detected?: number
          pages_analyzed?: number
          period?: string
          published_analyzed?: number
          resolved_count?: number
          rules?: Json
          services_analyzed?: number
          signals_detected?: number
          signals_rejected?: number
          stale_count?: number
          started_at?: string
          status?: string
          top_opportunities?: Json
          updated_count?: number
        }
        Relationships: []
      }
      seo_optimization_reports: {
        Row: {
          ai_calls: number
          avg_qa_after: number | null
          avg_qa_before: number | null
          avg_qa_delta: number | null
          cost_estimate: number
          duration_seconds: number
          errors_fixed: number
          final_status: string
          generated_at: string
          id: string
          pages_failed: number
          pages_optimized: number
          pages_skipped: number
          run_id: string
          top_fixes: Json
        }
        Insert: {
          ai_calls?: number
          avg_qa_after?: number | null
          avg_qa_before?: number | null
          avg_qa_delta?: number | null
          cost_estimate?: number
          duration_seconds?: number
          errors_fixed?: number
          final_status: string
          generated_at?: string
          id?: string
          pages_failed?: number
          pages_optimized?: number
          pages_skipped?: number
          run_id: string
          top_fixes?: Json
        }
        Update: {
          ai_calls?: number
          avg_qa_after?: number | null
          avg_qa_before?: number | null
          avg_qa_delta?: number | null
          cost_estimate?: number
          duration_seconds?: number
          errors_fixed?: number
          final_status?: string
          generated_at?: string
          id?: string
          pages_failed?: number
          pages_optimized?: number
          pages_skipped?: number
          run_id?: string
          top_fixes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "seo_optimization_reports_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "seo_optimization_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_optimization_runs: {
        Row: {
          actions: string[]
          ai_calls: number
          auto_adjusted_concurrency: boolean
          concurrency: number
          cost_estimate: number
          created_at: string
          created_by: string | null
          done: number
          failed: number
          filter: Json
          finished_at: string | null
          force_all: boolean
          id: string
          last_progress_at: string
          qa_after_avg: number | null
          qa_before_avg: number | null
          qa_skip_above: number
          qa_threshold: number
          rate_limit_hits: number
          report_id: string | null
          retried: number
          skipped: number
          started_at: string | null
          status: string
          succeeded: number
          total: number
          updated_at: string
        }
        Insert: {
          actions?: string[]
          ai_calls?: number
          auto_adjusted_concurrency?: boolean
          concurrency?: number
          cost_estimate?: number
          created_at?: string
          created_by?: string | null
          done?: number
          failed?: number
          filter?: Json
          finished_at?: string | null
          force_all?: boolean
          id?: string
          last_progress_at?: string
          qa_after_avg?: number | null
          qa_before_avg?: number | null
          qa_skip_above?: number
          qa_threshold?: number
          rate_limit_hits?: number
          report_id?: string | null
          retried?: number
          skipped?: number
          started_at?: string | null
          status?: string
          succeeded?: number
          total?: number
          updated_at?: string
        }
        Update: {
          actions?: string[]
          ai_calls?: number
          auto_adjusted_concurrency?: boolean
          concurrency?: number
          cost_estimate?: number
          created_at?: string
          created_by?: string | null
          done?: number
          failed?: number
          filter?: Json
          finished_at?: string | null
          force_all?: boolean
          id?: string
          last_progress_at?: string
          qa_after_avg?: number | null
          qa_before_avg?: number | null
          qa_skip_above?: number
          qa_threshold?: number
          rate_limit_hits?: number
          report_id?: string | null
          retried?: number
          skipped?: number
          started_at?: string | null
          status?: string
          succeeded?: number
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      seo_optimization_tasks: {
        Row: {
          ai_calls: number
          attempts: number
          cost_estimate: number
          created_at: string
          duration_ms: number | null
          error: string | null
          error_context: Json
          error_function: string | null
          error_http_status: number | null
          error_source: string | null
          error_stack: string | null
          finished_at: string | null
          fixed_actions: string[]
          id: string
          last_error_at: string | null
          max_attempts: number
          next_attempt_at: string | null
          page_id: string
          priority: number
          qa_after: number | null
          qa_before: number | null
          run_id: string
          skip_reason: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ai_calls?: number
          attempts?: number
          cost_estimate?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          error_context?: Json
          error_function?: string | null
          error_http_status?: number | null
          error_source?: string | null
          error_stack?: string | null
          finished_at?: string | null
          fixed_actions?: string[]
          id?: string
          last_error_at?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          page_id: string
          priority?: number
          qa_after?: number | null
          qa_before?: number | null
          run_id: string
          skip_reason?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ai_calls?: number
          attempts?: number
          cost_estimate?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          error_context?: Json
          error_function?: string | null
          error_http_status?: number | null
          error_source?: string | null
          error_stack?: string | null
          finished_at?: string | null
          fixed_actions?: string[]
          id?: string
          last_error_at?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          page_id?: string
          priority?: number
          qa_after?: number | null
          qa_before?: number | null
          run_id?: string
          skip_reason?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_optimization_tasks_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_bulk_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_optimization_tasks_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_gsc_ga4_merged_v"
            referencedColumns: ["page_id"]
          },
          {
            foreignKeyName: "seo_optimization_tasks_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_page_triage_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_optimization_tasks_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_optimization_tasks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "seo_optimization_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_orchestrator_lease: {
        Row: {
          acquired_at: string | null
          expires_at: string | null
          holder_id: string | null
          lock_name: string
          updated_at: string
        }
        Insert: {
          acquired_at?: string | null
          expires_at?: string | null
          holder_id?: string | null
          lock_name: string
          updated_at?: string
        }
        Update: {
          acquired_at?: string | null
          expires_at?: string | null
          holder_id?: string | null
          lock_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      seo_page_analytics: {
        Row: {
          analyzed_at: string
          core_web_vitals_score: number | null
          created_at: string
          errors: Json
          external_links: number
          h1_count: number
          h2_count: number
          h3_count: number
          id: string
          internal_links: number
          keyword_density: number
          meta_description_length: number
          meta_title_length: number
          page_id: string
          score: number
          suggestions: Json
          word_count: number
        }
        Insert: {
          analyzed_at?: string
          core_web_vitals_score?: number | null
          created_at?: string
          errors?: Json
          external_links?: number
          h1_count?: number
          h2_count?: number
          h3_count?: number
          id?: string
          internal_links?: number
          keyword_density?: number
          meta_description_length?: number
          meta_title_length?: number
          page_id: string
          score?: number
          suggestions?: Json
          word_count?: number
        }
        Update: {
          analyzed_at?: string
          core_web_vitals_score?: number | null
          created_at?: string
          errors?: Json
          external_links?: number
          h1_count?: number
          h2_count?: number
          h3_count?: number
          id?: string
          internal_links?: number
          keyword_density?: number
          meta_description_length?: number
          meta_title_length?: number
          page_id?: string
          score?: number
          suggestions?: Json
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "seo_page_analytics_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_bulk_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_page_analytics_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_gsc_ga4_merged_v"
            referencedColumns: ["page_id"]
          },
          {
            foreignKeyName: "seo_page_analytics_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_page_triage_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_page_analytics_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_page_events: {
        Row: {
          event_type: string
          id: string
          occurred_at: string
          page_slug: string
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          event_type: string
          id?: string
          occurred_at?: string
          page_slug: string
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          event_type?: string
          id?: string
          occurred_at?: string
          page_slug?: string
          session_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      seo_page_improvements: {
        Row: {
          after_snapshot: Json
          applied: boolean
          applied_at: string | null
          before_snapshot: Json
          created_at: string
          created_by: string | null
          id: string
          model: string | null
          notes: string | null
          page_id: string
        }
        Insert: {
          after_snapshot: Json
          applied?: boolean
          applied_at?: string | null
          before_snapshot: Json
          created_at?: string
          created_by?: string | null
          id?: string
          model?: string | null
          notes?: string | null
          page_id: string
        }
        Update: {
          after_snapshot?: Json
          applied?: boolean
          applied_at?: string | null
          before_snapshot?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          model?: string | null
          notes?: string | null
          page_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_page_improvements_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_bulk_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_page_improvements_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_gsc_ga4_merged_v"
            referencedColumns: ["page_id"]
          },
          {
            foreignKeyName: "seo_page_improvements_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_page_triage_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_page_improvements_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_page_scores: {
        Row: {
          business_score: number
          competition_score: number
          computed_at: string
          conversion_score: number
          details: Json
          opportunity_score: number
          page_id: string
          qa_score: number
          seo_score: number
          traffic_score: number
        }
        Insert: {
          business_score?: number
          competition_score?: number
          computed_at?: string
          conversion_score?: number
          details?: Json
          opportunity_score?: number
          page_id: string
          qa_score?: number
          seo_score?: number
          traffic_score?: number
        }
        Update: {
          business_score?: number
          competition_score?: number
          computed_at?: string
          conversion_score?: number
          details?: Json
          opportunity_score?: number
          page_id?: string
          qa_score?: number
          seo_score?: number
          traffic_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "seo_page_scores_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: true
            referencedRelation: "seo_bulk_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_page_scores_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: true
            referencedRelation: "seo_gsc_ga4_merged_v"
            referencedColumns: ["page_id"]
          },
          {
            foreignKeyName: "seo_page_scores_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: true
            referencedRelation: "seo_page_triage_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_page_scores_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: true
            referencedRelation: "seo_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_page_tasks: {
        Row: {
          attempts: number
          batch_id: string | null
          city_slug: string
          created_at: string
          duration_ms: number | null
          finished_at: string | null
          id: string
          kind: string
          last_error: string | null
          material_slug: string | null
          max_attempts: number
          next_attempt_at: string | null
          page_id: string | null
          page_slug: string | null
          qa_score: number | null
          run_id: string | null
          service_slug: string | null
          started_at: string | null
          status: string
          step: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          batch_id?: string | null
          city_slug: string
          created_at?: string
          duration_ms?: number | null
          finished_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          material_slug?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          page_id?: string | null
          page_slug?: string | null
          qa_score?: number | null
          run_id?: string | null
          service_slug?: string | null
          started_at?: string | null
          status?: string
          step?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          batch_id?: string | null
          city_slug?: string
          created_at?: string
          duration_ms?: number | null
          finished_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          material_slug?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          page_id?: string | null
          page_slug?: string | null
          qa_score?: number | null
          run_id?: string | null
          service_slug?: string | null
          started_at?: string | null
          status?: string
          step?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_page_tasks_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "seo_city_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_page_tasks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "seo_pipeline_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_pages: {
        Row: {
          ai_model: string | null
          backlinks_count: number
          city_slug: string
          content_html: string
          cover_image_alt: string | null
          cover_image_prompt: string | null
          cover_image_url: string | null
          created_at: string
          diagnostic_report: Json
          discovered_at: string | null
          external_link_count: number
          faq: Json
          google_index_status: string | null
          google_last_checked_at: string | null
          h1: string | null
          h2_count: number
          h3_count: number
          id: string
          indexed_at: string | null
          intelligence_flags: string[]
          intelligence_last_checked_at: string | null
          internal_link_count: number
          internal_links: Json
          intro: string | null
          keywords: string[]
          last_analyzed_at: string | null
          last_generated_at: string | null
          material_slug: string | null
          mesh_content_hash: string | null
          meta_description: string | null
          meta_title: string | null
          needs_refresh: boolean
          noindex: boolean
          og_description: string | null
          og_title: string | null
          priority: number
          priority_locked: boolean
          proc_error: string | null
          proc_finished_at: string | null
          proc_kind: string | null
          proc_result: Json | null
          proc_started_at: string | null
          proc_status: string
          published_at: string | null
          qa_blockers: string[]
          qa_breakdown: Json
          qa_last_checked_at: string | null
          qa_last_score: number | null
          refresh_reason: string | null
          seo_score: number | null
          service_slug: string | null
          slug: string
          status: string
          title: string
          updated_at: string
          view_count: number
          wave: string | null
          word_count: number
        }
        Insert: {
          ai_model?: string | null
          backlinks_count?: number
          city_slug: string
          content_html?: string
          cover_image_alt?: string | null
          cover_image_prompt?: string | null
          cover_image_url?: string | null
          created_at?: string
          diagnostic_report?: Json
          discovered_at?: string | null
          external_link_count?: number
          faq?: Json
          google_index_status?: string | null
          google_last_checked_at?: string | null
          h1?: string | null
          h2_count?: number
          h3_count?: number
          id?: string
          indexed_at?: string | null
          intelligence_flags?: string[]
          intelligence_last_checked_at?: string | null
          internal_link_count?: number
          internal_links?: Json
          intro?: string | null
          keywords?: string[]
          last_analyzed_at?: string | null
          last_generated_at?: string | null
          material_slug?: string | null
          mesh_content_hash?: string | null
          meta_description?: string | null
          meta_title?: string | null
          needs_refresh?: boolean
          noindex?: boolean
          og_description?: string | null
          og_title?: string | null
          priority?: number
          priority_locked?: boolean
          proc_error?: string | null
          proc_finished_at?: string | null
          proc_kind?: string | null
          proc_result?: Json | null
          proc_started_at?: string | null
          proc_status?: string
          published_at?: string | null
          qa_blockers?: string[]
          qa_breakdown?: Json
          qa_last_checked_at?: string | null
          qa_last_score?: number | null
          refresh_reason?: string | null
          seo_score?: number | null
          service_slug?: string | null
          slug: string
          status?: string
          title?: string
          updated_at?: string
          view_count?: number
          wave?: string | null
          word_count?: number
        }
        Update: {
          ai_model?: string | null
          backlinks_count?: number
          city_slug?: string
          content_html?: string
          cover_image_alt?: string | null
          cover_image_prompt?: string | null
          cover_image_url?: string | null
          created_at?: string
          diagnostic_report?: Json
          discovered_at?: string | null
          external_link_count?: number
          faq?: Json
          google_index_status?: string | null
          google_last_checked_at?: string | null
          h1?: string | null
          h2_count?: number
          h3_count?: number
          id?: string
          indexed_at?: string | null
          intelligence_flags?: string[]
          intelligence_last_checked_at?: string | null
          internal_link_count?: number
          internal_links?: Json
          intro?: string | null
          keywords?: string[]
          last_analyzed_at?: string | null
          last_generated_at?: string | null
          material_slug?: string | null
          mesh_content_hash?: string | null
          meta_description?: string | null
          meta_title?: string | null
          needs_refresh?: boolean
          noindex?: boolean
          og_description?: string | null
          og_title?: string | null
          priority?: number
          priority_locked?: boolean
          proc_error?: string | null
          proc_finished_at?: string | null
          proc_kind?: string | null
          proc_result?: Json | null
          proc_started_at?: string | null
          proc_status?: string
          published_at?: string | null
          qa_blockers?: string[]
          qa_breakdown?: Json
          qa_last_checked_at?: string | null
          qa_last_score?: number | null
          refresh_reason?: string | null
          seo_score?: number | null
          service_slug?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
          view_count?: number
          wave?: string | null
          word_count?: number
        }
        Relationships: []
      }
      seo_pages_links_backup_20260814: {
        Row: {
          content_html: string | null
          id: string | null
          internal_links: Json | null
          slug: string | null
        }
        Insert: {
          content_html?: string | null
          id?: string | null
          internal_links?: Json | null
          slug?: string | null
        }
        Update: {
          content_html?: string | null
          id?: string | null
          internal_links?: Json | null
          slug?: string | null
        }
        Relationships: []
      }
      seo_pages_meta_backup_20260814: {
        Row: {
          backed_up_at: string | null
          id: string | null
          meta_description: string | null
          meta_title: string | null
          slug: string | null
        }
        Insert: {
          backed_up_at?: string | null
          id?: string | null
          meta_description?: string | null
          meta_title?: string | null
          slug?: string | null
        }
        Update: {
          backed_up_at?: string | null
          id?: string | null
          meta_description?: string | null
          meta_title?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      seo_pagespeed_snapshots: {
        Row: {
          cls: number | null
          fcp_ms: number | null
          fetched_at: string
          id: string
          inp_ms: number | null
          lcp_ms: number | null
          page_id: string | null
          performance_score: number | null
          strategy: string
          ttfb_ms: number | null
          url: string
        }
        Insert: {
          cls?: number | null
          fcp_ms?: number | null
          fetched_at?: string
          id?: string
          inp_ms?: number | null
          lcp_ms?: number | null
          page_id?: string | null
          performance_score?: number | null
          strategy?: string
          ttfb_ms?: number | null
          url: string
        }
        Update: {
          cls?: number | null
          fcp_ms?: number | null
          fetched_at?: string
          id?: string
          inp_ms?: number | null
          lcp_ms?: number | null
          page_id?: string | null
          performance_score?: number | null
          strategy?: string
          ttfb_ms?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_pagespeed_snapshots_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_bulk_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_pagespeed_snapshots_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_gsc_ga4_merged_v"
            referencedColumns: ["page_id"]
          },
          {
            foreignKeyName: "seo_pagespeed_snapshots_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_page_triage_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_pagespeed_snapshots_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_pipeline_runs: {
        Row: {
          city_slugs: string[]
          created_at: string
          created_by: string | null
          current_city_slug: string | null
          done_pages: number
          eta_seconds: number | null
          failed_pages: number
          finished_at: string | null
          force_regenerate: boolean
          id: string
          last_progress_at: string | null
          max_retries: number
          mode: string
          page_timeout_ms: number
          pages_per_minute: number | null
          qa_avg: number | null
          qa_threshold: number
          retries_count: number
          started_at: string | null
          status: string
          succeeded_pages: number
          total_pages: number
          updated_at: string
        }
        Insert: {
          city_slugs?: string[]
          created_at?: string
          created_by?: string | null
          current_city_slug?: string | null
          done_pages?: number
          eta_seconds?: number | null
          failed_pages?: number
          finished_at?: string | null
          force_regenerate?: boolean
          id?: string
          last_progress_at?: string | null
          max_retries?: number
          mode?: string
          page_timeout_ms?: number
          pages_per_minute?: number | null
          qa_avg?: number | null
          qa_threshold?: number
          retries_count?: number
          started_at?: string | null
          status?: string
          succeeded_pages?: number
          total_pages?: number
          updated_at?: string
        }
        Update: {
          city_slugs?: string[]
          created_at?: string
          created_by?: string | null
          current_city_slug?: string | null
          done_pages?: number
          eta_seconds?: number | null
          failed_pages?: number
          finished_at?: string | null
          force_regenerate?: boolean
          id?: string
          last_progress_at?: string | null
          max_retries?: number
          mode?: string
          page_timeout_ms?: number
          pages_per_minute?: number | null
          qa_avg?: number | null
          qa_threshold?: number
          retries_count?: number
          started_at?: string | null
          status?: string
          succeeded_pages?: number
          total_pages?: number
          updated_at?: string
        }
        Relationships: []
      }
      seo_publish_log: {
        Row: {
          batch_index: number | null
          city_slug: string | null
          created_at: string
          error_message: string | null
          id: string
          outcome: string
          page_id: string
          run_id: string | null
          slug: string
          status_after: string | null
          status_before: string | null
          success: boolean
          topic: string | null
        }
        Insert: {
          batch_index?: number | null
          city_slug?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          outcome?: string
          page_id: string
          run_id?: string | null
          slug: string
          status_after?: string | null
          status_before?: string | null
          success?: boolean
          topic?: string | null
        }
        Update: {
          batch_index?: number | null
          city_slug?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          outcome?: string
          page_id?: string
          run_id?: string | null
          slug?: string
          status_after?: string | null
          status_before?: string | null
          success?: boolean
          topic?: string | null
        }
        Relationships: []
      }
      seo_qa_reports: {
        Row: {
          auto_published: boolean
          blockers: string[]
          checked_at: string
          checks: Json
          id: string
          page_id: string
          score: number
          warnings: string[]
        }
        Insert: {
          auto_published?: boolean
          blockers?: string[]
          checked_at?: string
          checks?: Json
          id?: string
          page_id: string
          score?: number
          warnings?: string[]
        }
        Update: {
          auto_published?: boolean
          blockers?: string[]
          checked_at?: string
          checks?: Json
          id?: string
          page_id?: string
          score?: number
          warnings?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "seo_qa_reports_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_bulk_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_qa_reports_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_gsc_ga4_merged_v"
            referencedColumns: ["page_id"]
          },
          {
            foreignKeyName: "seo_qa_reports_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_page_triage_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_qa_reports_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_recommendations: {
        Row: {
          action_type: string
          applied_at: string | null
          blog_post_id: string | null
          created_at: string
          effort_estimate: number
          entity_id: string | null
          entity_slug: string | null
          entity_type: string
          id: string
          impact_estimate: number
          is_daily_priority: boolean
          page_id: string | null
          payload: Json
          priority: number
          rationale: string | null
          reco_type: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          action_type: string
          applied_at?: string | null
          blog_post_id?: string | null
          created_at?: string
          effort_estimate?: number
          entity_id?: string | null
          entity_slug?: string | null
          entity_type: string
          id?: string
          impact_estimate?: number
          is_daily_priority?: boolean
          page_id?: string | null
          payload?: Json
          priority?: number
          rationale?: string | null
          reco_type: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          applied_at?: string | null
          blog_post_id?: string | null
          created_at?: string
          effort_estimate?: number
          entity_id?: string | null
          entity_slug?: string | null
          entity_type?: string
          id?: string
          impact_estimate?: number
          is_daily_priority?: boolean
          page_id?: string | null
          payload?: Json
          priority?: number
          rationale?: string | null
          reco_type?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_recommendations_blog_post_id_fkey"
            columns: ["blog_post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_recommendations_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_bulk_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_recommendations_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_gsc_ga4_merged_v"
            referencedColumns: ["page_id"]
          },
          {
            foreignKeyName: "seo_recommendations_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_page_triage_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_recommendations_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_services: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          keywords: string[] | null
          name: string
          short_name: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          keywords?: string[] | null
          name: string
          short_name?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          keywords?: string[] | null
          name?: string
          short_name?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      seo_test_before_20260908: {
        Row: {
          captured_at: string | null
          content_html: string | null
          faq: Json | null
          h1: string | null
          id: string | null
          internal_links: Json | null
          keywords: string[] | null
          meta_description: string | null
          meta_title: string | null
          qa_last_score: number | null
          slug: string | null
          word_count: number | null
        }
        Insert: {
          captured_at?: string | null
          content_html?: string | null
          faq?: Json | null
          h1?: string | null
          id?: string | null
          internal_links?: Json | null
          keywords?: string[] | null
          meta_description?: string | null
          meta_title?: string | null
          qa_last_score?: number | null
          slug?: string | null
          word_count?: number | null
        }
        Update: {
          captured_at?: string | null
          content_html?: string | null
          faq?: Json | null
          h1?: string | null
          id?: string | null
          internal_links?: Json | null
          keywords?: string[] | null
          meta_description?: string | null
          meta_title?: string | null
          qa_last_score?: number | null
          slug?: string | null
          word_count?: number | null
        }
        Relationships: []
      }
      seo_wave1_before_20260909: {
        Row: {
          captured_at: string | null
          content_html: string | null
          faq: Json | null
          gsc_clicks: number | null
          gsc_impressions: number | null
          h1: string | null
          id: string | null
          internal_link_count: number | null
          internal_links: Json | null
          intro: string | null
          keywords: string[] | null
          meta_description: string | null
          meta_title: string | null
          needs_refresh: boolean | null
          seo_score: number | null
          slug: string | null
          status: string | null
          title: string | null
          triage: string | null
          triage_priority: number | null
          updated_at: string | null
          weak_links: boolean | null
          word_count: number | null
        }
        Insert: {
          captured_at?: string | null
          content_html?: string | null
          faq?: Json | null
          gsc_clicks?: number | null
          gsc_impressions?: number | null
          h1?: string | null
          id?: string | null
          internal_link_count?: number | null
          internal_links?: Json | null
          intro?: string | null
          keywords?: string[] | null
          meta_description?: string | null
          meta_title?: string | null
          needs_refresh?: boolean | null
          seo_score?: number | null
          slug?: string | null
          status?: string | null
          title?: string | null
          triage?: string | null
          triage_priority?: number | null
          updated_at?: string | null
          weak_links?: boolean | null
          word_count?: number | null
        }
        Update: {
          captured_at?: string | null
          content_html?: string | null
          faq?: Json | null
          gsc_clicks?: number | null
          gsc_impressions?: number | null
          h1?: string | null
          id?: string | null
          internal_link_count?: number | null
          internal_links?: Json | null
          intro?: string | null
          keywords?: string[] | null
          meta_description?: string | null
          meta_title?: string | null
          needs_refresh?: boolean | null
          seo_score?: number | null
          slug?: string | null
          status?: string | null
          title?: string | null
          triage?: string | null
          triage_priority?: number | null
          updated_at?: string | null
          weak_links?: boolean | null
          word_count?: number | null
        }
        Relationships: []
      }
      seo_wave2_before_20260909: {
        Row: {
          captured_at: string | null
          content_html: string | null
          faq: Json | null
          h1: string | null
          id: string | null
          internal_links: Json | null
          intro: string | null
          keywords: string[] | null
          meta_description: string | null
          meta_title: string | null
          seo_score: number | null
          slug: string | null
          status: string | null
          title: string | null
          updated_at: string | null
          word_count: number | null
        }
        Insert: {
          captured_at?: string | null
          content_html?: string | null
          faq?: Json | null
          h1?: string | null
          id?: string | null
          internal_links?: Json | null
          intro?: string | null
          keywords?: string[] | null
          meta_description?: string | null
          meta_title?: string | null
          seo_score?: number | null
          slug?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          word_count?: number | null
        }
        Update: {
          captured_at?: string | null
          content_html?: string | null
          faq?: Json | null
          h1?: string | null
          id?: string | null
          internal_links?: Json | null
          intro?: string | null
          keywords?: string[] | null
          meta_description?: string | null
          meta_title?: string | null
          seo_score?: number | null
          slug?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          word_count?: number | null
        }
        Relationships: []
      }
      seo_waves: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          priority: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          priority?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          priority?: number
          updated_at?: string
        }
        Relationships: []
      }
      strategic_reports: {
        Row: {
          created_at: string
          created_by: string | null
          generated_at: string
          id: string
          payload: Json
          summary: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          generated_at?: string
          id?: string
          payload?: Json
          summary?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          generated_at?: string
          id?: string
          payload?: Json
          summary?: string | null
        }
        Relationships: []
      }
      submission_accepted_materials: {
        Row: {
          composition_role: string | null
          confidence: string
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          granulometry_id: string | null
          id: string
          material_id: string
          original_value: string | null
          percentage: number | null
          resolution_method: string | null
          rule_applied: string | null
          size_max_mm: number | null
          size_min_mm: number | null
          source: string
          source_field: string | null
          stance: string
          submission_id: string
          updated_at: string
        }
        Insert: {
          composition_role?: string | null
          confidence?: string
          confirmation_status: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          granulometry_id?: string | null
          id?: string
          material_id: string
          original_value?: string | null
          percentage?: number | null
          resolution_method?: string | null
          rule_applied?: string | null
          size_max_mm?: number | null
          size_min_mm?: number | null
          source: string
          source_field?: string | null
          stance?: string
          submission_id: string
          updated_at?: string
        }
        Update: {
          composition_role?: string | null
          confidence?: string
          confirmation_status?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          granulometry_id?: string | null
          id?: string
          material_id?: string
          original_value?: string | null
          percentage?: number | null
          resolution_method?: string | null
          rule_applied?: string | null
          size_max_mm?: number | null
          size_min_mm?: number | null
          source?: string
          source_field?: string | null
          stance?: string
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_accepted_materials_granulometry_id_fkey"
            columns: ["granulometry_id"]
            isOneToOne: false
            referencedRelation: "material_granulometries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_accepted_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "material_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_accepted_materials_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "submission_accepted_materials_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_access_constraints: {
        Row: {
          accepts_10_roues: boolean | null
          accepts_12_roues: boolean | null
          accepts_6_roues: boolean | null
          accepts_semi_trailer: boolean | null
          access_width_m: number | null
          backing_required: boolean | null
          bridge_or_culvert: boolean | null
          clear_height_m: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          data_source: Database["public"]["Enums"]["transport_dimension_source"]
          driver_access_notes: string | null
          gate: boolean | null
          gate_width_m: number | null
          id: string
          maneuvering_space_m2: number | null
          max_practical_length_m: number | null
          narrow_entrance: boolean | null
          overhead_obstacles: boolean | null
          slope_percent: number | null
          submission_id: string
          surface_type: string | null
          turnaround_space: boolean | null
          turning_radius_m: number | null
          updated_at: string
          weight_restriction_kg: number | null
        }
        Insert: {
          accepts_10_roues?: boolean | null
          accepts_12_roues?: boolean | null
          accepts_6_roues?: boolean | null
          accepts_semi_trailer?: boolean | null
          access_width_m?: number | null
          backing_required?: boolean | null
          bridge_or_culvert?: boolean | null
          clear_height_m?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          data_source?: Database["public"]["Enums"]["transport_dimension_source"]
          driver_access_notes?: string | null
          gate?: boolean | null
          gate_width_m?: number | null
          id?: string
          maneuvering_space_m2?: number | null
          max_practical_length_m?: number | null
          narrow_entrance?: boolean | null
          overhead_obstacles?: boolean | null
          slope_percent?: number | null
          submission_id: string
          surface_type?: string | null
          turnaround_space?: boolean | null
          turning_radius_m?: number | null
          updated_at?: string
          weight_restriction_kg?: number | null
        }
        Update: {
          accepts_10_roues?: boolean | null
          accepts_12_roues?: boolean | null
          accepts_6_roues?: boolean | null
          accepts_semi_trailer?: boolean | null
          access_width_m?: number | null
          backing_required?: boolean | null
          bridge_or_culvert?: boolean | null
          clear_height_m?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          data_source?: Database["public"]["Enums"]["transport_dimension_source"]
          driver_access_notes?: string | null
          gate?: boolean | null
          gate_width_m?: number | null
          id?: string
          maneuvering_space_m2?: number | null
          max_practical_length_m?: number | null
          narrow_entrance?: boolean | null
          overhead_obstacles?: boolean | null
          slope_percent?: number | null
          submission_id?: string
          surface_type?: string | null
          turnaround_space?: boolean | null
          turning_radius_m?: number | null
          updated_at?: string
          weight_restriction_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "submission_access_constraints_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "submission_access_constraints_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "submission_audit_log_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_availability_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          id: string
          new_confirmed_at: string | null
          new_status: string | null
          note: string | null
          old_confirmed_at: string | null
          old_status: string | null
          reason: string | null
          source: string | null
          submission_id: string
        }
        Insert: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          new_confirmed_at?: string | null
          new_status?: string | null
          note?: string | null
          old_confirmed_at?: string | null
          old_status?: string | null
          reason?: string | null
          source?: string | null
          submission_id: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          new_confirmed_at?: string | null
          new_status?: string | null
          note?: string | null
          old_confirmed_at?: string | null
          old_status?: string | null
          reason?: string | null
          source?: string | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_availability_log_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "submission_availability_log_submission_id_fkey"
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
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
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
      submission_environmental_info: {
        Row: {
          characterization_available: string
          contamination_known: string
          created_at: string
          documents: Json
          environmental_status: string
          id: string
          notes: string | null
          provenance: string | null
          restrictions: string | null
          soil_quality: string | null
          submission_id: string
          updated_at: string
        }
        Insert: {
          characterization_available?: string
          contamination_known?: string
          created_at?: string
          documents?: Json
          environmental_status?: string
          id?: string
          notes?: string | null
          provenance?: string | null
          restrictions?: string | null
          soil_quality?: string | null
          submission_id: string
          updated_at?: string
        }
        Update: {
          characterization_available?: string
          contamination_known?: string
          created_at?: string
          documents?: Json
          environmental_status?: string
          id?: string
          notes?: string | null
          provenance?: string | null
          restrictions?: string | null
          soil_quality?: string | null
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_environmental_info_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "submission_environmental_info_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_fill_profile: {
        Row: {
          acceptance_scope: string
          accepted_truck_codes: string[] | null
          access_notes: string | null
          capacity_kind: string
          capacity_unit: string | null
          capacity_value: number | null
          confidence: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          environment_status: string
          heavy_truck_access: string | null
          id: string
          original_text: string | null
          source: string
          submission_id: string
          updated_at: string
        }
        Insert: {
          acceptance_scope?: string
          accepted_truck_codes?: string[] | null
          access_notes?: string | null
          capacity_kind?: string
          capacity_unit?: string | null
          capacity_value?: number | null
          confidence?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          environment_status?: string
          heavy_truck_access?: string | null
          id?: string
          original_text?: string | null
          source?: string
          submission_id: string
          updated_at?: string
        }
        Update: {
          acceptance_scope?: string
          accepted_truck_codes?: string[] | null
          access_notes?: string | null
          capacity_kind?: string
          capacity_unit?: string | null
          capacity_value?: number | null
          confidence?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          environment_status?: string
          heavy_truck_access?: string | null
          id?: string
          original_text?: string | null
          source?: string
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_fill_profile_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "submission_fill_profile_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_material_conditions: {
        Row: {
          condition_key: string
          confidence: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          detail: string | null
          id: string
          original_text: string | null
          regulatory_level: string
          source: string
          stance: string
          submission_id: string
          updated_at: string
        }
        Insert: {
          condition_key: string
          confidence?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          original_text?: string | null
          regulatory_level?: string
          source?: string
          stance?: string
          submission_id: string
          updated_at?: string
        }
        Update: {
          condition_key?: string
          confidence?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          original_text?: string | null
          regulatory_level?: string
          source?: string
          stance?: string
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_material_conditions_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "submission_material_conditions_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_site_decisions: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          site_id: string
          site_label: string | null
          source: string
          status: string
          submission_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          site_id: string
          site_label?: string | null
          source?: string
          status?: string
          submission_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          site_id?: string
          site_label?: string | null
          source?: string
          status?: string
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_site_decisions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "submission_site_decisions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_site_decisions_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "submission_site_decisions_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          access_criteria: string[] | null
          access_details: Json | null
          access_heavy_truck: string | null
          accessibility: string[] | null
          address: string
          assigned_entrepreneur: string | null
          availability_confirmed_by: string | null
          availability_note: string | null
          availability_reason: string | null
          availability_source: string | null
          availability_status: string
          availability_updated_at: string | null
          budget_max: string | null
          budget_unit: string | null
          callara_call_id: string | null
          city: string | null
          client_id: string | null
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
          landing_referrer: string | null
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
          next_follow_up_at: string | null
          opening_hours: string | null
          other_material: string | null
          parcours_direction: string | null
          phone: string | null
          photos: string[] | null
          photos_meta: Json | null
          place_id: string | null
          postal_code: string | null
          postal_latitude: number | null
          postal_latitude_old: number | null
          postal_longitude: number | null
          postal_longitude_old: number | null
          priority: string
          property_type: string
          province: string | null
          public_latitude: number | null
          public_longitude: number | null
          public_point_updated_at: string | null
          quantity: string
          quantity_unit: string | null
          quantity_value: number | null
          quote_distance_km: number | null
          quote_duration_minutes: number | null
          quote_id: string | null
          quote_material: string | null
          quote_number: string | null
          quote_quantity: number | null
          quote_tonnage: number | null
          quote_total: number | null
          quote_trips: number | null
          quote_truck: string | null
          quote_unit: string | null
          remaining_capacity: string | null
          request_type: string
          revalidation_days_override: number | null
          revalidation_requested_at: string | null
          selected_site_address: string | null
          selected_site_id: string | null
          selected_site_label: string | null
          selected_site_latitude: number | null
          selected_site_longitude: number | null
          selection_updated_at: string | null
          service_type: string | null
          sheet_backup_at: string | null
          show_on_admin_map: boolean
          site_validated_at: string | null
          site_validated_by: string | null
          status: string
          submission_number: number
          territory_confidence: string | null
          territory_id: string | null
          territory_reason: string | null
          territory_sector: string | null
          territory_source: string | null
          territory_status: string | null
          tonnage: string
          truck_type_key: string | null
          truck_types_allowed: string[] | null
          updated_at: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visible_to_entrepreneur: boolean
          width_ft: string | null
        }
        Insert: {
          access_criteria?: string[] | null
          access_details?: Json | null
          access_heavy_truck?: string | null
          accessibility?: string[] | null
          address: string
          assigned_entrepreneur?: string | null
          availability_confirmed_by?: string | null
          availability_note?: string | null
          availability_reason?: string | null
          availability_source?: string | null
          availability_status?: string
          availability_updated_at?: string | null
          budget_max?: string | null
          budget_unit?: string | null
          callara_call_id?: string | null
          city?: string | null
          client_id?: string | null
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
          landing_referrer?: string | null
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
          next_follow_up_at?: string | null
          opening_hours?: string | null
          other_material?: string | null
          parcours_direction?: string | null
          phone?: string | null
          photos?: string[] | null
          photos_meta?: Json | null
          place_id?: string | null
          postal_code?: string | null
          postal_latitude?: number | null
          postal_latitude_old?: number | null
          postal_longitude?: number | null
          postal_longitude_old?: number | null
          priority?: string
          property_type: string
          province?: string | null
          public_latitude?: number | null
          public_longitude?: number | null
          public_point_updated_at?: string | null
          quantity: string
          quantity_unit?: string | null
          quantity_value?: number | null
          quote_distance_km?: number | null
          quote_duration_minutes?: number | null
          quote_id?: string | null
          quote_material?: string | null
          quote_number?: string | null
          quote_quantity?: number | null
          quote_tonnage?: number | null
          quote_total?: number | null
          quote_trips?: number | null
          quote_truck?: string | null
          quote_unit?: string | null
          remaining_capacity?: string | null
          request_type?: string
          revalidation_days_override?: number | null
          revalidation_requested_at?: string | null
          selected_site_address?: string | null
          selected_site_id?: string | null
          selected_site_label?: string | null
          selected_site_latitude?: number | null
          selected_site_longitude?: number | null
          selection_updated_at?: string | null
          service_type?: string | null
          sheet_backup_at?: string | null
          show_on_admin_map?: boolean
          site_validated_at?: string | null
          site_validated_by?: string | null
          status?: string
          submission_number?: number
          territory_confidence?: string | null
          territory_id?: string | null
          territory_reason?: string | null
          territory_sector?: string | null
          territory_source?: string | null
          territory_status?: string | null
          tonnage: string
          truck_type_key?: string | null
          truck_types_allowed?: string[] | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visible_to_entrepreneur?: boolean
          width_ft?: string | null
        }
        Update: {
          access_criteria?: string[] | null
          access_details?: Json | null
          access_heavy_truck?: string | null
          accessibility?: string[] | null
          address?: string
          assigned_entrepreneur?: string | null
          availability_confirmed_by?: string | null
          availability_note?: string | null
          availability_reason?: string | null
          availability_source?: string | null
          availability_status?: string
          availability_updated_at?: string | null
          budget_max?: string | null
          budget_unit?: string | null
          callara_call_id?: string | null
          city?: string | null
          client_id?: string | null
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
          landing_referrer?: string | null
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
          next_follow_up_at?: string | null
          opening_hours?: string | null
          other_material?: string | null
          parcours_direction?: string | null
          phone?: string | null
          photos?: string[] | null
          photos_meta?: Json | null
          place_id?: string | null
          postal_code?: string | null
          postal_latitude?: number | null
          postal_latitude_old?: number | null
          postal_longitude?: number | null
          postal_longitude_old?: number | null
          priority?: string
          property_type?: string
          province?: string | null
          public_latitude?: number | null
          public_longitude?: number | null
          public_point_updated_at?: string | null
          quantity?: string
          quantity_unit?: string | null
          quantity_value?: number | null
          quote_distance_km?: number | null
          quote_duration_minutes?: number | null
          quote_id?: string | null
          quote_material?: string | null
          quote_number?: string | null
          quote_quantity?: number | null
          quote_tonnage?: number | null
          quote_total?: number | null
          quote_trips?: number | null
          quote_truck?: string | null
          quote_unit?: string | null
          remaining_capacity?: string | null
          request_type?: string
          revalidation_days_override?: number | null
          revalidation_requested_at?: string | null
          selected_site_address?: string | null
          selected_site_id?: string | null
          selected_site_label?: string | null
          selected_site_latitude?: number | null
          selected_site_longitude?: number | null
          selection_updated_at?: string | null
          service_type?: string | null
          sheet_backup_at?: string | null
          show_on_admin_map?: boolean
          site_validated_at?: string | null
          site_validated_by?: string | null
          status?: string
          submission_number?: number
          territory_confidence?: string | null
          territory_id?: string | null
          territory_reason?: string | null
          territory_sector?: string | null
          territory_source?: string | null
          territory_status?: string | null
          tonnage?: string
          truck_type_key?: string | null
          truck_types_allowed?: string[] | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visible_to_entrepreneur?: boolean
          width_ft?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_selected_site_id_fkey"
            columns: ["selected_site_id"]
            isOneToOne: false
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "submissions_selected_site_id_fkey"
            columns: ["selected_site_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "geo_territories"
            referencedColumns: ["id"]
          },
        ]
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
      transport_dimension_rules: {
        Row: {
          applies_to: string
          conditions: Json
          config_id: string | null
          created_at: string
          effective_from: string | null
          effective_to: string | null
          id: string
          label: string
          last_verified_at: string | null
          max_combination_length_m: number | null
          max_height_m: number | null
          max_regulatory_width_m: number | null
          max_trailer_length_m: number | null
          max_vehicle_length_m: number | null
          mirrors_excluded: boolean
          notes: string | null
          regulatory_article: string | null
          regulatory_source: string | null
          rule_code: string
          updated_at: string
          validation_status: string
          version: number
        }
        Insert: {
          applies_to: string
          conditions?: Json
          config_id?: string | null
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          label: string
          last_verified_at?: string | null
          max_combination_length_m?: number | null
          max_height_m?: number | null
          max_regulatory_width_m?: number | null
          max_trailer_length_m?: number | null
          max_vehicle_length_m?: number | null
          mirrors_excluded?: boolean
          notes?: string | null
          regulatory_article?: string | null
          regulatory_source?: string | null
          rule_code: string
          updated_at?: string
          validation_status?: string
          version?: number
        }
        Update: {
          applies_to?: string
          conditions?: Json
          config_id?: string | null
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          label?: string
          last_verified_at?: string | null
          max_combination_length_m?: number | null
          max_height_m?: number | null
          max_regulatory_width_m?: number | null
          max_trailer_length_m?: number | null
          max_vehicle_length_m?: number | null
          mirrors_excluded?: boolean
          notes?: string | null
          regulatory_article?: string | null
          regulatory_source?: string | null
          rule_code?: string
          updated_at?: string
          validation_status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "transport_dimension_rules_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "transport_vehicle_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_dimension_typicals: {
        Row: {
          config_id: string
          created_at: string
          data_source: Database["public"]["Enums"]["transport_dimension_source"]
          dimension_key: string
          id: string
          max_m: number | null
          min_m: number | null
          notes: string | null
          typical_m: number | null
          updated_at: string
        }
        Insert: {
          config_id: string
          created_at?: string
          data_source?: Database["public"]["Enums"]["transport_dimension_source"]
          dimension_key: string
          id?: string
          max_m?: number | null
          min_m?: number | null
          notes?: string | null
          typical_m?: number | null
          updated_at?: string
        }
        Update: {
          config_id?: string
          created_at?: string
          data_source?: Database["public"]["Enums"]["transport_dimension_source"]
          dimension_key?: string
          id?: string
          max_m?: number | null
          min_m?: number | null
          notes?: string | null
          typical_m?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_dimension_typicals_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "transport_vehicle_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_material_densities: {
        Row: {
          created_at: string
          data_source: string | null
          density_avg_kg_m3: number | null
          density_max_kg_m3: number | null
          density_min_kg_m3: number | null
          id: string
          is_active: boolean
          is_estimate: boolean
          material_catalog_id: string | null
          material_slug: string | null
          moisture_note: string | null
          notes: string | null
          updated_at: string
          validated_at: string | null
        }
        Insert: {
          created_at?: string
          data_source?: string | null
          density_avg_kg_m3?: number | null
          density_max_kg_m3?: number | null
          density_min_kg_m3?: number | null
          id?: string
          is_active?: boolean
          is_estimate?: boolean
          material_catalog_id?: string | null
          material_slug?: string | null
          moisture_note?: string | null
          notes?: string | null
          updated_at?: string
          validated_at?: string | null
        }
        Update: {
          created_at?: string
          data_source?: string | null
          density_avg_kg_m3?: number | null
          density_max_kg_m3?: number | null
          density_min_kg_m3?: number | null
          id?: string
          is_active?: boolean
          is_estimate?: boolean
          material_catalog_id?: string | null
          material_slug?: string | null
          moisture_note?: string | null
          notes?: string | null
          updated_at?: string
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_material_densities_material_catalog_id_fkey"
            columns: ["material_catalog_id"]
            isOneToOne: false
            referencedRelation: "material_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_request_errors: {
        Row: {
          attempt: number
          created_at: string
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          id: string
          idempotency_key: string | null
          ip: string | null
          payload: Json | null
          request_id: string | null
          stage: string
          user_agent: string | null
        }
        Insert: {
          attempt?: number
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          ip?: string | null
          payload?: Json | null
          request_id?: string | null
          stage: string
          user_agent?: string | null
        }
        Update: {
          attempt?: number
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          ip?: string | null
          payload?: Json | null
          request_id?: string | null
          stage?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_request_errors_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "transport_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_request_history: {
        Row: {
          created_at: string
          field_key: string
          id: string
          new_value: Json | null
          old_value: Json | null
          request_id: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          field_key: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          request_id: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          field_key?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          request_id?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_request_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "transport_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_requests: {
        Row: {
          alternative_dumps: Json | null
          assigned_dispatcher: string | null
          client_company: string | null
          client_email: string | null
          client_id: string | null
          client_name: string
          client_notes: string | null
          client_phone: string
          created_at: string
          desired_date: string | null
          desired_time: string | null
          distance_km: number | null
          driver_id: string | null
          dump_name: string | null
          dump_submission_id: string | null
          estimated_trips: number | null
          id: string
          idempotency_key: string | null
          internal_notes: string | null
          jsc_request_id: string | null
          material_other: string | null
          material_type: string
          origin_stage: string
          origin_submission_id: string | null
          owner_contacted: boolean
          owner_contacted_at: string | null
          quantity: number | null
          quantity_unit: string | null
          request_number: string | null
          site_address: string
          site_city: string | null
          site_latitude: number | null
          site_longitude: number | null
          source: string
          status: Database["public"]["Enums"]["transport_request_status"]
          transport_subtotal: number | null
          transport_total: number | null
          transport_tps_amount: number | null
          transport_tps_rate: number | null
          transport_tvq_amount: number | null
          transport_tvq_rate: number | null
          travel_time_minutes: number | null
          truck_id: string | null
          truck_rate_code: string | null
          truck_rate_label: string | null
          truck_rate_per_trip: number | null
          truck_type: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          alternative_dumps?: Json | null
          assigned_dispatcher?: string | null
          client_company?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name: string
          client_notes?: string | null
          client_phone: string
          created_at?: string
          desired_date?: string | null
          desired_time?: string | null
          distance_km?: number | null
          driver_id?: string | null
          dump_name?: string | null
          dump_submission_id?: string | null
          estimated_trips?: number | null
          id?: string
          idempotency_key?: string | null
          internal_notes?: string | null
          jsc_request_id?: string | null
          material_other?: string | null
          material_type: string
          origin_stage?: string
          origin_submission_id?: string | null
          owner_contacted?: boolean
          owner_contacted_at?: string | null
          quantity?: number | null
          quantity_unit?: string | null
          request_number?: string | null
          site_address: string
          site_city?: string | null
          site_latitude?: number | null
          site_longitude?: number | null
          source?: string
          status?: Database["public"]["Enums"]["transport_request_status"]
          transport_subtotal?: number | null
          transport_total?: number | null
          transport_tps_amount?: number | null
          transport_tps_rate?: number | null
          transport_tvq_amount?: number | null
          transport_tvq_rate?: number | null
          travel_time_minutes?: number | null
          truck_id?: string | null
          truck_rate_code?: string | null
          truck_rate_label?: string | null
          truck_rate_per_trip?: number | null
          truck_type?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          alternative_dumps?: Json | null
          assigned_dispatcher?: string | null
          client_company?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name?: string
          client_notes?: string | null
          client_phone?: string
          created_at?: string
          desired_date?: string | null
          desired_time?: string | null
          distance_km?: number | null
          driver_id?: string | null
          dump_name?: string | null
          dump_submission_id?: string | null
          estimated_trips?: number | null
          id?: string
          idempotency_key?: string | null
          internal_notes?: string | null
          jsc_request_id?: string | null
          material_other?: string | null
          material_type?: string
          origin_stage?: string
          origin_submission_id?: string | null
          owner_contacted?: boolean
          owner_contacted_at?: string | null
          quantity?: number | null
          quantity_unit?: string | null
          request_number?: string | null
          site_address?: string
          site_city?: string | null
          site_latitude?: number | null
          site_longitude?: number | null
          source?: string
          status?: Database["public"]["Enums"]["transport_request_status"]
          transport_subtotal?: number | null
          transport_total?: number | null
          transport_tps_amount?: number | null
          transport_tps_rate?: number | null
          transport_tvq_amount?: number | null
          transport_tvq_rate?: number | null
          travel_time_minutes?: number | null
          truck_id?: string | null
          truck_rate_code?: string | null
          truck_rate_label?: string | null
          truck_rate_per_trip?: number | null
          truck_type?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_dump_submission_id_fkey"
            columns: ["dump_submission_id"]
            isOneToOne: false
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "transport_requests_dump_submission_id_fkey"
            columns: ["dump_submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_jsc_request_id_fkey"
            columns: ["jsc_request_id"]
            isOneToOne: false
            referencedRelation: "jsc_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_origin_submission_id_fkey"
            columns: ["origin_submission_id"]
            isOneToOne: false
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "transport_requests_origin_submission_id_fkey"
            columns: ["origin_submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_safety_margins: {
        Row: {
          config_id: string | null
          created_at: string
          height_margin_m: number | null
          id: string
          is_active: boolean
          is_regulatory: boolean
          length_margin_m: number | null
          notes: string | null
          scope: string
          updated_at: string
          width_margin_m: number | null
        }
        Insert: {
          config_id?: string | null
          created_at?: string
          height_margin_m?: number | null
          id?: string
          is_active?: boolean
          is_regulatory?: boolean
          length_margin_m?: number | null
          notes?: string | null
          scope?: string
          updated_at?: string
          width_margin_m?: number | null
        }
        Update: {
          config_id?: string | null
          created_at?: string
          height_margin_m?: number | null
          id?: string
          is_active?: boolean
          is_regulatory?: boolean
          length_margin_m?: number | null
          notes?: string | null
          scope?: string
          updated_at?: string
          width_margin_m?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_safety_margins_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "transport_vehicle_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_tax_rates: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          rate: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          rate: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          rate?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      transport_truck_rates: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          price_per_trip: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          price_per_trip: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          price_per_trip?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      transport_vehicle_capacities: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          axle_configuration: string | null
          axle_count: number | null
          carrier_id: string | null
          combo_tare_kg: number | null
          company_id: string | null
          config_id: string
          created_at: string
          data_source: string | null
          gross_admissible_kg: number | null
          id: string
          is_active: boolean
          label: string | null
          notes: string | null
          operational_capacity_kg: number | null
          payload_kg: number | null
          tractor_tare_kg: number | null
          trailer_tare_kg: number | null
          truck_id: string | null
          updated_at: string
          validated_at: string | null
          volume_capacity: number | null
          volume_unit: string | null
          weight_rule_id: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          axle_configuration?: string | null
          axle_count?: number | null
          carrier_id?: string | null
          combo_tare_kg?: number | null
          company_id?: string | null
          config_id: string
          created_at?: string
          data_source?: string | null
          gross_admissible_kg?: number | null
          id?: string
          is_active?: boolean
          label?: string | null
          notes?: string | null
          operational_capacity_kg?: number | null
          payload_kg?: number | null
          tractor_tare_kg?: number | null
          trailer_tare_kg?: number | null
          truck_id?: string | null
          updated_at?: string
          validated_at?: string | null
          volume_capacity?: number | null
          volume_unit?: string | null
          weight_rule_id?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          axle_configuration?: string | null
          axle_count?: number | null
          carrier_id?: string | null
          combo_tare_kg?: number | null
          company_id?: string | null
          config_id?: string
          created_at?: string
          data_source?: string | null
          gross_admissible_kg?: number | null
          id?: string
          is_active?: boolean
          label?: string | null
          notes?: string | null
          operational_capacity_kg?: number | null
          payload_kg?: number | null
          tractor_tare_kg?: number | null
          trailer_tare_kg?: number | null
          truck_id?: string | null
          updated_at?: string
          validated_at?: string | null
          volume_capacity?: number | null
          volume_unit?: string | null
          weight_rule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_vehicle_capacities_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "transport_vehicle_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_vehicle_capacities_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "jsc_trucks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_vehicle_capacities_weight_rule_id_fkey"
            columns: ["weight_rule_id"]
            isOneToOne: false
            referencedRelation: "transport_weight_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_vehicle_configs: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          axle_configuration: string | null
          axle_count: number | null
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          label: string
          sort_order: number
          trailer_axle_count: number | null
          truck_type: string | null
          updated_at: string
          vehicle_class: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          axle_configuration?: string | null
          axle_count?: number | null
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          trailer_axle_count?: number | null
          truck_type?: string | null
          updated_at?: string
          vehicle_class: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          axle_configuration?: string | null
          axle_count?: number | null
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          trailer_axle_count?: number | null
          truck_type?: string | null
          updated_at?: string
          vehicle_class?: string
        }
        Relationships: []
      }
      transport_vehicle_dimensions: {
        Row: {
          body_width_m: number | null
          capacity_id: string | null
          combo_max_height_m: number | null
          combo_max_width_m: number | null
          combo_measured_length_m: number | null
          combo_turning_radius_m: number | null
          config_id: string | null
          created_at: string
          data_source: Database["public"]["Enums"]["transport_dimension_source"]
          front_overhang_m: number | null
          ground_clearance_m: number | null
          id: string
          is_active: boolean
          kingpin_setback_m: number | null
          label: string | null
          measured_unit: string
          mirror_left_offset_m: number | null
          mirror_right_offset_m: number | null
          mirror_to_mirror_width_m: number | null
          notes: string | null
          overall_height_m: number | null
          overall_length_m: number | null
          rear_overhang_m: number | null
          tractor_body_width_m: number | null
          tractor_height_m: number | null
          tractor_length_m: number | null
          tractor_mirror_to_mirror_width_m: number | null
          tractor_wheelbase_m: number | null
          trailer_axle_count: number | null
          trailer_body_width_m: number | null
          trailer_height_m: number | null
          trailer_length_m: number | null
          trailer_overhang_m: number | null
          trailer_wheelbase_m: number | null
          turning_diameter_m: number | null
          turning_radius_m: number | null
          updated_at: string
          validated_at: string | null
          wheelbase_m: number | null
        }
        Insert: {
          body_width_m?: number | null
          capacity_id?: string | null
          combo_max_height_m?: number | null
          combo_max_width_m?: number | null
          combo_measured_length_m?: number | null
          combo_turning_radius_m?: number | null
          config_id?: string | null
          created_at?: string
          data_source?: Database["public"]["Enums"]["transport_dimension_source"]
          front_overhang_m?: number | null
          ground_clearance_m?: number | null
          id?: string
          is_active?: boolean
          kingpin_setback_m?: number | null
          label?: string | null
          measured_unit?: string
          mirror_left_offset_m?: number | null
          mirror_right_offset_m?: number | null
          mirror_to_mirror_width_m?: number | null
          notes?: string | null
          overall_height_m?: number | null
          overall_length_m?: number | null
          rear_overhang_m?: number | null
          tractor_body_width_m?: number | null
          tractor_height_m?: number | null
          tractor_length_m?: number | null
          tractor_mirror_to_mirror_width_m?: number | null
          tractor_wheelbase_m?: number | null
          trailer_axle_count?: number | null
          trailer_body_width_m?: number | null
          trailer_height_m?: number | null
          trailer_length_m?: number | null
          trailer_overhang_m?: number | null
          trailer_wheelbase_m?: number | null
          turning_diameter_m?: number | null
          turning_radius_m?: number | null
          updated_at?: string
          validated_at?: string | null
          wheelbase_m?: number | null
        }
        Update: {
          body_width_m?: number | null
          capacity_id?: string | null
          combo_max_height_m?: number | null
          combo_max_width_m?: number | null
          combo_measured_length_m?: number | null
          combo_turning_radius_m?: number | null
          config_id?: string | null
          created_at?: string
          data_source?: Database["public"]["Enums"]["transport_dimension_source"]
          front_overhang_m?: number | null
          ground_clearance_m?: number | null
          id?: string
          is_active?: boolean
          kingpin_setback_m?: number | null
          label?: string | null
          measured_unit?: string
          mirror_left_offset_m?: number | null
          mirror_right_offset_m?: number | null
          mirror_to_mirror_width_m?: number | null
          notes?: string | null
          overall_height_m?: number | null
          overall_length_m?: number | null
          rear_overhang_m?: number | null
          tractor_body_width_m?: number | null
          tractor_height_m?: number | null
          tractor_length_m?: number | null
          tractor_mirror_to_mirror_width_m?: number | null
          tractor_wheelbase_m?: number | null
          trailer_axle_count?: number | null
          trailer_body_width_m?: number | null
          trailer_height_m?: number | null
          trailer_length_m?: number | null
          trailer_overhang_m?: number | null
          trailer_wheelbase_m?: number | null
          turning_diameter_m?: number | null
          turning_radius_m?: number | null
          updated_at?: string
          validated_at?: string | null
          wheelbase_m?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_vehicle_dimensions_capacity_id_fkey"
            columns: ["capacity_id"]
            isOneToOne: false
            referencedRelation: "transport_vehicle_capacities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_vehicle_dimensions_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "transport_vehicle_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_weight_rules: {
        Row: {
          axle_group: string | null
          axle_spacing_m: number | null
          config_id: string | null
          created_at: string
          effective_from: string | null
          effective_to: string | null
          id: string
          jurisdiction: string
          last_verified_at: string | null
          max_group_mass_kg: number | null
          max_total_mass_kg: number | null
          notes: string | null
          regulatory_source: string | null
          restrictions: string | null
          season: string
          special_permit_notes: string | null
          updated_at: string
          validation_status: string
          version: number
        }
        Insert: {
          axle_group?: string | null
          axle_spacing_m?: number | null
          config_id?: string | null
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          jurisdiction?: string
          last_verified_at?: string | null
          max_group_mass_kg?: number | null
          max_total_mass_kg?: number | null
          notes?: string | null
          regulatory_source?: string | null
          restrictions?: string | null
          season?: string
          special_permit_notes?: string | null
          updated_at?: string
          validation_status?: string
          version?: number
        }
        Update: {
          axle_group?: string | null
          axle_spacing_m?: number | null
          config_id?: string | null
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          jurisdiction?: string
          last_verified_at?: string | null
          max_group_mass_kg?: number | null
          max_total_mass_kg?: number | null
          notes?: string | null
          regulatory_source?: string | null
          restrictions?: string | null
          season?: string
          special_permit_notes?: string | null
          updated_at?: string
          validation_status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "transport_weight_rules_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "transport_vehicle_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: Database["public"]["Enums"]["trip_status"] | null
          id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["trip_status"]
          trip_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["trip_status"] | null
          id?: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["trip_status"]
          trip_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["trip_status"] | null
          id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["trip_status"]
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_status_history_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          assigned_by: string | null
          assignment_mode: string
          calendar_event_id: string | null
          carrier_id: string | null
          client_id: string | null
          completed_at: string | null
          cost: number | null
          created_at: string
          delivered_at: string | null
          delivery_address: string | null
          delivery_lat: number | null
          delivery_lng: number | null
          distance_km: number | null
          documents: Json
          driver_id: string | null
          dump_id: string | null
          entrepreneur_id: string | null
          id: string
          loaded_at: string | null
          margin: number | null
          material: string | null
          notes: string | null
          photos: Json
          pickup_address: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          quarry_address: string | null
          revenue: number | null
          scheduled_at: string | null
          signature_url: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["trip_status"]
          submission_id: string | null
          transport_request_id: string | null
          trip_number: string | null
          truck_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          assignment_mode?: string
          calendar_event_id?: string | null
          carrier_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          distance_km?: number | null
          documents?: Json
          driver_id?: string | null
          dump_id?: string | null
          entrepreneur_id?: string | null
          id?: string
          loaded_at?: string | null
          margin?: number | null
          material?: string | null
          notes?: string | null
          photos?: Json
          pickup_address?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          quarry_address?: string | null
          revenue?: number | null
          scheduled_at?: string | null
          signature_url?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          submission_id?: string | null
          transport_request_id?: string | null
          trip_number?: string | null
          truck_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          assignment_mode?: string
          calendar_event_id?: string | null
          carrier_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          distance_km?: number | null
          documents?: Json
          driver_id?: string | null
          dump_id?: string | null
          entrepreneur_id?: string | null
          id?: string
          loaded_at?: string | null
          margin?: number | null
          material?: string | null
          notes?: string | null
          photos?: Json
          pickup_address?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          quarry_address?: string | null
          revenue?: number | null
          scheduled_at?: string | null
          signature_url?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          submission_id?: string | null
          transport_request_id?: string | null
          trip_number?: string | null
          truck_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "crm_carriers_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_dump_id_fkey"
            columns: ["dump_id"]
            isOneToOne: false
            referencedRelation: "crm_dumps_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_dump_id_fkey"
            columns: ["dump_id"]
            isOneToOne: false
            referencedRelation: "dumps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "trips_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_transport_request_id_fkey"
            columns: ["transport_request_id"]
            isOneToOne: false
            referencedRelation: "transport_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      trucks: {
        Row: {
          acquisition_notes: string | null
          active: boolean
          admin_status: string
          archived_at: string | null
          axle_make: string | null
          axle_model: string | null
          axle_ratio: string | null
          axle_serial: string | null
          axles: number | null
          body_length: string | null
          body_type: string | null
          capacity: string | null
          carrier_id: string | null
          category: string
          color: string | null
          company_id: string | null
          components: Json
          configuration: string | null
          created_at: string
          current_value: number | null
          engine_hours: number | null
          engine_make: string | null
          engine_model: string | null
          engine_power: string | null
          engine_serial: string | null
          has_pto: boolean | null
          hydraulics: string | null
          id: string
          in_service_since: string | null
          last_reading_at: string | null
          make: string | null
          model: string | null
          name: string
          notes: string | null
          odometer_km: number | null
          ops_status: string
          plate: string | null
          province: string | null
          purchase_date: string | null
          purchase_hours: number | null
          purchase_odometer_km: number | null
          purchase_price: number | null
          service_status: string
          transmission: string | null
          transmission_make: string | null
          transmission_model: string | null
          transmission_serial: string | null
          type: Database["public"]["Enums"]["truck_type"]
          unit_number: string | null
          updated_at: string
          vendor: string | null
          vin: string | null
          warranty: string | null
          year: number | null
        }
        Insert: {
          acquisition_notes?: string | null
          active?: boolean
          admin_status?: string
          archived_at?: string | null
          axle_make?: string | null
          axle_model?: string | null
          axle_ratio?: string | null
          axle_serial?: string | null
          axles?: number | null
          body_length?: string | null
          body_type?: string | null
          capacity?: string | null
          carrier_id?: string | null
          category?: string
          color?: string | null
          company_id?: string | null
          components?: Json
          configuration?: string | null
          created_at?: string
          current_value?: number | null
          engine_hours?: number | null
          engine_make?: string | null
          engine_model?: string | null
          engine_power?: string | null
          engine_serial?: string | null
          has_pto?: boolean | null
          hydraulics?: string | null
          id?: string
          in_service_since?: string | null
          last_reading_at?: string | null
          make?: string | null
          model?: string | null
          name: string
          notes?: string | null
          odometer_km?: number | null
          ops_status?: string
          plate?: string | null
          province?: string | null
          purchase_date?: string | null
          purchase_hours?: number | null
          purchase_odometer_km?: number | null
          purchase_price?: number | null
          service_status?: string
          transmission?: string | null
          transmission_make?: string | null
          transmission_model?: string | null
          transmission_serial?: string | null
          type?: Database["public"]["Enums"]["truck_type"]
          unit_number?: string | null
          updated_at?: string
          vendor?: string | null
          vin?: string | null
          warranty?: string | null
          year?: number | null
        }
        Update: {
          acquisition_notes?: string | null
          active?: boolean
          admin_status?: string
          archived_at?: string | null
          axle_make?: string | null
          axle_model?: string | null
          axle_ratio?: string | null
          axle_serial?: string | null
          axles?: number | null
          body_length?: string | null
          body_type?: string | null
          capacity?: string | null
          carrier_id?: string | null
          category?: string
          color?: string | null
          company_id?: string | null
          components?: Json
          configuration?: string | null
          created_at?: string
          current_value?: number | null
          engine_hours?: number | null
          engine_make?: string | null
          engine_model?: string | null
          engine_power?: string | null
          engine_serial?: string | null
          has_pto?: boolean | null
          hydraulics?: string | null
          id?: string
          in_service_since?: string | null
          last_reading_at?: string | null
          make?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          odometer_km?: number | null
          ops_status?: string
          plate?: string | null
          province?: string | null
          purchase_date?: string | null
          purchase_hours?: number | null
          purchase_odometer_km?: number | null
          purchase_price?: number | null
          service_status?: string
          transmission?: string | null
          transmission_make?: string | null
          transmission_model?: string | null
          transmission_serial?: string | null
          type?: Database["public"]["Enums"]["truck_type"]
          unit_number?: string | null
          updated_at?: string
          vendor?: string | null
          vin?: string | null
          warranty?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trucks_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trucks_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "crm_carriers_v"
            referencedColumns: ["id"]
          },
        ]
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
      crm_carriers_v: {
        Row: {
          address: string | null
          base_rate_per_hour: number | null
          base_rate_per_km: number | null
          city: string | null
          contact_name: string | null
          created_at: string | null
          created_by: string | null
          drivers_count: number | null
          email: string | null
          id: string | null
          insurance_expires_at: string | null
          insurance_policy: string | null
          is_active: boolean | null
          name: string | null
          notes: string | null
          permit_expires_at: string | null
          permit_number: string | null
          phone: string | null
          postal_code: string | null
          rating: number | null
          service_zones: string[] | null
          truck_types: string[] | null
          trucks_count: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          base_rate_per_hour?: number | null
          base_rate_per_km?: number | null
          city?: string | null
          contact_name?: string | null
          created_at?: string | null
          created_by?: string | null
          drivers_count?: never
          email?: string | null
          id?: string | null
          insurance_expires_at?: string | null
          insurance_policy?: string | null
          is_active?: boolean | null
          name?: string | null
          notes?: string | null
          permit_expires_at?: string | null
          permit_number?: string | null
          phone?: string | null
          postal_code?: string | null
          rating?: number | null
          service_zones?: string[] | null
          truck_types?: string[] | null
          trucks_count?: never
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          base_rate_per_hour?: number | null
          base_rate_per_km?: number | null
          city?: string | null
          contact_name?: string | null
          created_at?: string | null
          created_by?: string | null
          drivers_count?: never
          email?: string | null
          id?: string | null
          insurance_expires_at?: string | null
          insurance_policy?: string | null
          is_active?: boolean | null
          name?: string | null
          notes?: string | null
          permit_expires_at?: string | null
          permit_number?: string | null
          phone?: string | null
          postal_code?: string | null
          rating?: number | null
          service_zones?: string[] | null
          truck_types?: string[] | null
          trucks_count?: never
          updated_at?: string | null
        }
        Relationships: []
      }
      crm_clients_v: {
        Row: {
          address: string | null
          city: string | null
          company: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string | null
          is_active: boolean | null
          latitude: number | null
          longitude: number | null
          name: string | null
          notes: string | null
          phone: string | null
          postal_code: string | null
          revenue_total: number | null
          source: string | null
          submissions_count: number | null
          tags: string[] | null
          transport_requests_count: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          revenue_total?: never
          source?: string | null
          submissions_count?: never
          tags?: string[] | null
          transport_requests_count?: never
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          revenue_total?: never
          source?: string | null
          submissions_count?: never
          tags?: string[] | null
          transport_requests_count?: never
          updated_at?: string | null
        }
        Relationships: []
      }
      crm_deals_v: {
        Row: {
          city: string | null
          client_id: string | null
          created_at: string | null
          id: string | null
          latitude: number | null
          longitude: number | null
          materials: string[] | null
          postal_code: string | null
          source: string | null
          status: string | null
          tonnage: string | null
          user_id: string | null
        }
        Relationships: []
      }
      crm_dumps_v: {
        Row: {
          accessibility: string[] | null
          address: string | null
          availability_status: string | null
          capacity_remaining_m3: number | null
          capacity_total_m3: number | null
          city: string | null
          created_at: string | null
          equipment: string[] | null
          id: string | null
          is_active: boolean | null
          latitude: number | null
          longitude: number | null
          materials_accepted: string[] | null
          name: string | null
          notes: string | null
          opening_hours: string | null
          owner_entrepreneur_id: string | null
          owner_name: string | null
          photos: string[] | null
          postal_code: string | null
          price_per_material: Json | null
          rating: number | null
          submission_id: string | null
          truck_types_allowed: string[] | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dumps_owner_entrepreneur_id_fkey"
            columns: ["owner_entrepreneur_id"]
            isOneToOne: false
            referencedRelation: "entrepreneurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dumps_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "material_matching_candidates"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "dumps_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_listings_public: {
        Row: {
          available_from: string | null
          city: string | null
          created_at: string | null
          description: string | null
          id: string | null
          listing_type: string | null
          material_label: string | null
          price: number | null
          price_unit: string | null
          quantity: number | null
          quantity_unit: string | null
          region: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          available_from?: string | null
          city?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          listing_type?: string | null
          material_label?: string | null
          price?: number | null
          price_unit?: string | null
          quantity?: number | null
          quantity_unit?: string | null
          region?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          available_from?: string | null
          city?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          listing_type?: string | null
          material_label?: string | null
          price?: number | null
          price_unit?: string | null
          quantity?: number | null
          quantity_unit?: string | null
          region?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      jsc_marketplace_profiles_public: {
        Row: {
          carrier_company_id: string | null
          certifications: Json | null
          city: string | null
          company_id: string | null
          created_at: string | null
          description: string | null
          id: string | null
          is_active: boolean | null
          is_featured: boolean | null
          is_published: boolean | null
          logo_url: string | null
          name: string | null
          opening_hours: Json | null
          partner_type: string | null
          photos: Json | null
          rating_average: number | null
          rating_count: number | null
          region: string | null
          service_radius_km: number | null
          services: Json | null
          slug: string | null
          supplier_id: string | null
          tagline: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          carrier_company_id?: string | null
          certifications?: Json | null
          city?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          is_published?: boolean | null
          logo_url?: string | null
          name?: string | null
          opening_hours?: Json | null
          partner_type?: string | null
          photos?: Json | null
          rating_average?: number | null
          rating_count?: number | null
          region?: string | null
          service_radius_km?: number | null
          services?: Json | null
          slug?: string | null
          supplier_id?: string | null
          tagline?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          carrier_company_id?: string | null
          certifications?: Json | null
          city?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          is_published?: boolean | null
          logo_url?: string | null
          name?: string | null
          opening_hours?: Json | null
          partner_type?: string | null
          photos?: Json | null
          rating_average?: number | null
          rating_count?: number | null
          region?: string | null
          service_radius_km?: number | null
          services?: Json | null
          slug?: string | null
          supplier_id?: string | null
          tagline?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jsc_marketplace_profiles_carrier_company_id_fkey"
            columns: ["carrier_company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_marketplace_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jsc_marketplace_profiles_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_material_supply_v"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "jsc_marketplace_profiles_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "jsc_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      jsc_material_supply_v: {
        Row: {
          company_id: string | null
          cost_per_tonne: number | null
          density_kg_per_m3: number | null
          is_ready: boolean | null
          is_taxable: boolean | null
          material_archived_at: string | null
          material_id: string | null
          material_is_active: boolean | null
          material_name: string | null
          material_slug: string | null
          material_unit: string | null
          pickup_address: string | null
          pickup_city: string | null
          pickup_is_active: boolean | null
          pickup_latitude: number | null
          pickup_loading_time_minutes: number | null
          pickup_location_id: string | null
          pickup_longitude: number | null
          pickup_name: string | null
          pickup_postal_code: string | null
          pickup_type: string | null
          price_per_tonne: number | null
          supplier_id: string | null
          supplier_name: string | null
          supplier_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jsc_materials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      material_matching_candidates: {
        Row: {
          accepted_families: string[] | null
          accepted_material_ids: string[] | null
          availability_status: string | null
          availability_updated_at: string | null
          city: string | null
          crm_status: string | null
          is_usable: boolean | null
          latitude: number | null
          longitude: number | null
          submission_id: string | null
        }
        Relationships: []
      }
      mkt_partners_public: {
        Row: {
          accepts_subcontracting: boolean | null
          accepts_tenders: boolean | null
          availability_status: string | null
          city: string | null
          company_id: string | null
          description: string | null
          is_public: boolean | null
          is_verified: boolean | null
          latitude: number | null
          legal_name: string | null
          logo_url: string | null
          longitude: number | null
          project_sizes: string[] | null
          region: string | null
          trade_name: string | null
          website: string | null
        }
        Insert: {
          accepts_subcontracting?: boolean | null
          accepts_tenders?: boolean | null
          availability_status?: string | null
          city?: string | null
          company_id?: string | null
          description?: string | null
          is_public?: boolean | null
          is_verified?: boolean | null
          latitude?: number | null
          legal_name?: string | null
          logo_url?: string | null
          longitude?: number | null
          project_sizes?: string[] | null
          region?: string | null
          trade_name?: string | null
          website?: string | null
        }
        Update: {
          accepts_subcontracting?: boolean | null
          accepts_tenders?: boolean | null
          availability_status?: string | null
          city?: string | null
          company_id?: string | null
          description?: string | null
          is_public?: boolean | null
          is_verified?: boolean | null
          latitude?: number | null
          legal_name?: string | null
          logo_url?: string | null
          longitude?: number | null
          project_sizes?: string[] | null
          region?: string | null
          trade_name?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_partners_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_requests_for_partners: {
        Row: {
          address: string | null
          answers: Json | null
          budget_max: number | null
          budget_min: number | null
          category_id: string | null
          city: string | null
          client_type: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_revealed_at: string | null
          contact_visibility: string | null
          contact_visible: boolean | null
          created_at: string | null
          deadline_at: string | null
          description: string | null
          desired_date: string | null
          estimated_value: number | null
          id: string | null
          is_active: boolean | null
          is_multi_lot: boolean | null
          latitude: number | null
          longitude: number | null
          organization_name: string | null
          postal_code: string | null
          region: string | null
          request_number: string | null
          schedule_note: string | null
          source: string | null
          status: string | null
          subcategory_id: string | null
          title: string | null
          updated_at: string | null
          viewer_company_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_invitations_company_id_fkey"
            columns: ["viewer_company_id"]
            isOneToOne: false
            referencedRelation: "jsc_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_quote_requests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "mkt_service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_quote_requests_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "mkt_service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_bulk_candidates: {
        Row: {
          city_slug: string | null
          id: string | null
          internal_link_count: number | null
          is_error: boolean | null
          is_excellent: boolean | null
          is_to_improve: boolean | null
          is_to_refresh: boolean | null
          last_analyzed_at: string | null
          material_slug: string | null
          needs_refresh: boolean | null
          proc_status: string | null
          score: number | null
          slug: string | null
          title: string | null
          word_count: number | null
        }
        Insert: {
          city_slug?: string | null
          id?: string | null
          internal_link_count?: number | null
          is_error?: never
          is_excellent?: never
          is_to_improve?: never
          is_to_refresh?: never
          last_analyzed_at?: string | null
          material_slug?: string | null
          needs_refresh?: boolean | null
          proc_status?: string | null
          score?: never
          slug?: string | null
          title?: string | null
          word_count?: number | null
        }
        Update: {
          city_slug?: string | null
          id?: string | null
          internal_link_count?: number | null
          is_error?: never
          is_excellent?: never
          is_to_improve?: never
          is_to_refresh?: never
          last_analyzed_at?: string | null
          material_slug?: string | null
          needs_refresh?: boolean | null
          proc_status?: string | null
          score?: never
          slug?: string | null
          title?: string | null
          word_count?: number | null
        }
        Relationships: []
      }
      seo_gsc_deltas_28d: {
        Row: {
          clicks: number | null
          clicks_delta: number | null
          ctr: number | null
          impressions: number | null
          impressions_delta: number | null
          page_id: string | null
          position: number | null
          position_gain: number | null
          prev_clicks: number | null
          prev_impressions: number | null
          prev_position: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_gsc_metrics_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_bulk_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_gsc_metrics_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_gsc_ga4_merged_v"
            referencedColumns: ["page_id"]
          },
          {
            foreignKeyName: "seo_gsc_metrics_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_page_triage_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_gsc_metrics_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "seo_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_gsc_ga4_merged_v: {
        Row: {
          ga_avg_engagement_time_sec: number | null
          ga_conversions: number | null
          ga_engagement_rate: number | null
          ga_new_users: number | null
          ga_page_views: number | null
          ga_sessions: number | null
          ga_users: number | null
          gsc_clicks: number | null
          gsc_ctr: number | null
          gsc_impressions: number | null
          gsc_position: number | null
          page_id: string | null
          slug: string | null
          status: string | null
          title: string | null
        }
        Relationships: []
      }
      seo_page_conversions_30d: {
        Row: {
          conversion_rate_pct: number | null
          conversions: number | null
          cta_clicks: number | null
          email_clicks: number | null
          page_slug: string | null
          phone_clicks: number | null
          submissions: number | null
          views: number | null
          whatsapp_clicks: number | null
        }
        Relationships: []
      }
      seo_page_triage_v: {
        Row: {
          city_slug: string | null
          dup_meta: boolean | null
          dup_title: boolean | null
          google_index_status: string | null
          gsc_clicks: number | null
          gsc_impressions: number | null
          gsc_position: number | null
          has_gsc_data: boolean | null
          id: string | null
          material_slug: string | null
          needs_refresh: boolean | null
          score: number | null
          slug: string | null
          status: string | null
          thin_content: boolean | null
          title: string | null
          triage: string | null
          triage_priority: number | null
          weak_faq: boolean | null
          weak_h1: boolean | null
          weak_headings: boolean | null
          weak_links: boolean | null
          weak_meta: boolean | null
          weak_title: boolean | null
          word_count: number | null
        }
        Relationships: []
      }
      seo_recent_jobs_v: {
        Row: {
          blocked_items: Json | null
          created_at: string | null
          current_attempt: number | null
          current_started_at: string | null
          current_step: string | null
          current_target: Json | null
          done: number | null
          errors: Json | null
          eta_seconds: number | null
          failed: number | null
          finished_at: string | null
          id: string | null
          last_progress_at: string | null
          mode: string | null
          pages_per_minute: number | null
          progress_samples: Json | null
          report: Json | null
          retry_queue: Json | null
          started_at: string | null
          status: string | null
          succeeded: number | null
          total: number | null
          watchdog_events: Json | null
          wave: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _haversine_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      access_requests_stats: { Args: never; Returns: Json }
      add_submission_site: {
        Args: { p_site_id: string; p_submission_id: string }
        Returns: Json
      }
      ai_cache_hit: {
        Args: { _credits: number; _key: string }
        Returns: undefined
      }
      ai_economy_stats: { Args: { _days?: number }; Returns: Json }
      blog_increment_view: { Args: { _post_id: string }; Returns: undefined }
      blog_mesh_cancel: { Args: { _run_id: string }; Returns: undefined }
      blog_mesh_pause: { Args: { _run_id: string }; Returns: undefined }
      blog_mesh_resume: { Args: { _run_id: string }; Returns: undefined }
      blog_mesh_retry_errors: { Args: { _run_id: string }; Returns: number }
      blog_mesh_start: {
        Args: {
          _batch_pages?: number
          _batch_posts?: number
          _item_ids?: string[]
          _mode?: string
        }
        Returns: string
      }
      blog_mesh_state: { Args: never; Returns: Json }
      blog_mesh_stats: { Args: never; Returns: Json }
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
      count_active_dumps_by_city: {
        Args: { _city_slug: string }
        Returns: number
      }
      crm_merge_entities: {
        Args: { _owner_type: string; _source_id: string; _target_id: string }
        Returns: undefined
      }
      crm_notification_stats: { Args: never; Returns: Json }
      crm_notifications_sweep: { Args: never; Returns: Json }
      crm_notify: {
        Args: {
          p_action_url?: string
          p_body?: string
          p_category: string
          p_client_name?: string
          p_dedupe_key: string
          p_due_at?: string
          p_entity_id?: string
          p_entity_type?: string
          p_lead_number?: string
          p_meta?: Json
          p_priority: string
          p_reopen?: boolean
          p_title: string
          p_type: string
        }
        Returns: string
      }
      crm_resolve: {
        Args: {
          p_categories?: string[]
          p_entity_id: string
          p_entity_type: string
          p_types?: string[]
        }
        Returns: number
      }
      current_user_email: { Args: never; Returns: string }
      decide_submission_site: {
        Args: {
          p_decision: string
          p_note?: string
          p_site_id: string
          p_submission_id: string
        }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      dispatch_apply_scenario: {
        Args: { _scenario_id: string; _scheduled_at?: string }
        Returns: string
      }
      dispatch_generate_scenarios: {
        Args: { _limit?: number; _request_id: string }
        Returns: {
          breakdown: Json
          carrier_id: string | null
          chosen_at: string | null
          chosen_by: string | null
          created_at: string
          driver_id: string | null
          dump_id: string | null
          estimated_cost: number | null
          estimated_distance_km: number | null
          estimated_duration_min: number | null
          estimated_margin: number | null
          estimated_revenue: number | null
          expires_at: string
          id: string
          rank: number
          reasons: Json
          score: number
          transport_request_id: string
          trip_id: string | null
          truck_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "dispatch_scenarios"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dompe_freshness: {
        Args: {
          _confirmed_at: string
          _days: number
          _revalidation_requested_at?: string
        }
        Returns: string
      }
      dompe_public_point: {
        Args: { _id: string; _lat: number; _lng: number }
        Returns: {
          lat: number
          lng: number
        }[]
      }
      dompe_revalidation_days: {
        Args: { _s: Database["public"]["Tables"]["submissions"]["Row"] }
        Returns: number
      }
      dompe_revalidation_queue: {
        Args: { _limit?: number }
        Returns: {
          availability_status: string
          availability_updated_at: string
          city: string
          cohort: string
          dompe_number: string
          freshness: string
          id: string
          materials: string[]
          priority_score: number
          remaining_capacity: string
          status: string
          submission_number: number
          tonnage: string
        }[]
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      entr_status_label: { Args: { _status: string }; Returns: string }
      exec_claim_optim_tasks: {
        Args: { _run_id: string; _size: number }
        Returns: {
          attempts: number
          id: string
          max_attempts: number
          page_id: string
          qa_before: number
        }[]
      }
      fleet_can_access: { Args: { _company_id: string }; Returns: boolean }
      fleet_can_administer: { Args: { _company_id: string }; Returns: boolean }
      fleet_can_manage: { Args: { _company_id: string }; Returns: boolean }
      fleet_member_role: { Args: { _company_id: string }; Returns: string }
      fleet_scan_due: { Args: never; Returns: Json }
      geo_hay: { Args: { _txt: string }; Returns: string }
      geo_match_address: {
        Args: { _address: string }
        Returns: {
          score: number
          territory_id: string
        }[]
      }
      geo_normalize: { Args: { _txt: string }; Returns: string }
      geo_resolve_location: {
        Args: { _address: string; _city: string }
        Returns: {
          confidence: string
          reason: string
          source: string
          territory_id: string
        }[]
      }
      geo_resolve_territory: { Args: { _city: string }; Returns: string }
      get_comparateur_selection: {
        Args: { p_submission_id: string }
        Returns: Json
      }
      get_entrepreneur_directory: {
        Args: never
        Returns: {
          city: string
          company: string
          id: string
          postal_sector: string
          province: string
          province_name: string
          region: string
          truck_count: string
          truck_types: string[]
        }[]
      }
      get_entrepreneur_leads: {
        Args: never
        Returns: {
          access_details: Json
          access_heavy_truck: string
          accessibility: string[]
          availability_note: string
          availability_status: string
          availability_updated_at: string
          contamination: string
          created_at: string
          deliver_or_remove: string
          dompe_number: string
          freshness: string
          id: string
          is_assigned: boolean
          latitude: number
          longitude: number
          machinery_available: boolean
          machinery_description: string
          materials: string[]
          opening_hours: string
          other_material: string
          postal_prefix: string
          priority: string
          property_type: string
          quantity: string
          remaining_capacity: string
          request_type: string
          status: string
          submission_number: number
          tonnage: string
          truck_types_allowed: string[]
        }[]
      }
      get_my_submissions: {
        Args: never
        Returns: {
          address: string
          city: string
          created_at: string
          desired_date: string
          formatted_address: string
          id: string
          latitude: number
          longitude: number
          materials: string[]
          other_material: string
          place_id: string
          quantity: string
          quote_distance_km: number
          quote_duration_minutes: number
          quote_material: string
          request_type: string
          selected_site_address: string
          selected_site_id: string
          selected_site_label: string
          selection_updated_at: string
          site_availability_status: string
          site_availability_updated_at: string
          site_validated_at: string
          status: string
          submission_number: number
          tonnage: string
        }[]
      }
      get_public_dumps: {
        Args: never
        Returns: {
          accessibility: string[]
          availability_status: string
          availability_updated_at: string
          dompe_number: string
          freshness: string
          id: string
          latitude: number
          longitude: number
          materials: string[]
          opening_hours: string
          remaining_capacity: string
          submission_number: number
          truck_types_allowed: string[]
        }[]
      }
      get_submission_sites: {
        Args: { p_submission_id: string }
        Returns: {
          created_at: string
          decided_at: string
          decision_note: string
          public_latitude: number
          public_longitude: number
          site_address: string
          site_id: string
          site_label: string
          site_latitude: number
          site_longitude: number
          site_material: string
          site_status: string
          status: string
          submission_id: string
        }[]
      }
      get_submission_transport_request: {
        Args: { p_stage?: string; p_submission_id: string }
        Returns: Json
      }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
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
      is_entrepreneur_visible_dompe: {
        Args: { _s: Database["public"]["Tables"]["submissions"]["Row"] }
        Returns: boolean
      }
      is_fill_request_type: {
        Args: { _request_type: string }
        Returns: boolean
      }
      is_usable_fill_request: {
        Args: {
          _require_gps?: boolean
          _s: Database["public"]["Tables"]["submissions"]["Row"]
        }
        Returns: boolean
      }
      jsc_add_company_member: {
        Args: {
          _company_id: string
          _email: string
          _full_name?: string
          _role?: string
        }
        Returns: string
      }
      jsc_advance_flow: {
        Args: { _entity_id: string; _entity_type: string }
        Returns: Json
      }
      jsc_archive_record: {
        Args: { _id: string; _restore?: boolean; _table: string }
        Returns: Json
      }
      jsc_bi_alerts: { Args: { _company_id?: string }; Returns: Json }
      jsc_bi_analytics: {
        Args: { _company_id?: string; _from?: string; _to?: string }
        Returns: Json
      }
      jsc_bi_forecast: {
        Args: { _company_id?: string; _months?: number }
        Returns: Json
      }
      jsc_bi_goal_progress: { Args: { _company_id?: string }; Returns: Json }
      jsc_bi_order_facts: {
        Args: { _company_id: string; _from: string; _to: string }
        Returns: {
          carrier_id: string
          carrier_name: string
          category_name: string
          city: string
          client_id: string
          client_name: string
          gross_margin: number
          material_cost: number
          material_id: string
          material_name: string
          net_margin: number
          occurred_on: string
          order_id: string
          project_id: string
          quantity: number
          region: string
          status: string
          subtotal: number
          supplier_id: string
          supplier_name: string
          total: number
          transport_cost: number
          truck_id: string
        }[]
      }
      jsc_bi_overview: {
        Args: { _company_id?: string; _from?: string; _to?: string }
        Returns: Json
      }
      jsc_can: {
        Args: { _action: string; _company_id: string; _module: string }
        Returns: boolean
      }
      jsc_can_manage: { Args: { _user_id: string }; Returns: boolean }
      jsc_client_portal: { Args: never; Returns: Json }
      jsc_company_role: {
        Args: { _company_id: string; _user_id: string }
        Returns: string
      }
      jsc_compute_taxes: {
        Args: { _company_id: string; _subtotal: number; _taxable?: boolean }
        Returns: Json
      }
      jsc_convert_estimate_to_quote: {
        Args: { _estimate_id: string; _valid_days?: number }
        Returns: string
      }
      jsc_convert_order_to_invoice: {
        Args: { _order_id: string }
        Returns: string
      }
      jsc_convert_quote_to_order: {
        Args: { _quote_id: string; _scheduled_date?: string }
        Returns: string
      }
      jsc_dashboard_360: { Args: { p_company_id?: string }; Returns: Json }
      jsc_dashboard_stats: { Args: { _company_id?: string }; Returns: Json }
      jsc_default_company_id: { Args: never; Returns: string }
      jsc_driver_portal: {
        Args: { _from?: string; _to?: string }
        Returns: Json
      }
      jsc_emit_event: {
        Args: {
          _company_id: string
          _entity_id?: string
          _entity_type?: string
          _event_type: string
          _label?: string
          _payload?: Json
          _severity?: string
        }
        Returns: string
      }
      jsc_executive_dashboard: { Args: { _company_id?: string }; Returns: Json }
      jsc_export_config: { Args: { _company_id?: string }; Returns: Json }
      jsc_flow_allowed: { Args: never; Returns: boolean }
      jsc_generate_deliveries: { Args: { _order_id: string }; Returns: number }
      jsc_import_config: {
        Args: { _company_id?: string; _payload: Json }
        Returns: Json
      }
      jsc_import_transport_request: { Args: { _id: string }; Returns: string }
      jsc_intel_apply_optimization: {
        Args: { _decision?: string; _id: string }
        Returns: Json
      }
      jsc_intel_dashboard: { Args: { _company_id?: string }; Returns: Json }
      jsc_intel_detect_anomalies: {
        Args: { _company_id?: string }
        Returns: Json
      }
      jsc_intel_learn: { Args: { _company_id?: string }; Returns: Json }
      jsc_intel_optimize: { Args: { _company_id?: string }; Returns: Json }
      jsc_intel_predict: { Args: { _company_id?: string }; Returns: Json }
      jsc_intel_score_all: { Args: { _company_id?: string }; Returns: Json }
      jsc_is_member: { Args: { _company_id: string }; Returns: boolean }
      jsc_learning_stats: { Args: { _company_id?: string }; Returns: Json }
      jsc_log_event: {
        Args: {
          _action: string
          _context?: Json
          _entity_id: string
          _entity_type: string
          _label?: string
        }
        Returns: string
      }
      jsc_material_slugify: { Args: { _text: string }; Returns: string }
      jsc_material_supply: {
        Args: { _material_id?: string; _slug?: string }
        Returns: {
          company_id: string | null
          cost_per_tonne: number | null
          density_kg_per_m3: number | null
          is_ready: boolean | null
          is_taxable: boolean | null
          material_archived_at: string | null
          material_id: string | null
          material_is_active: boolean | null
          material_name: string | null
          material_slug: string | null
          material_unit: string | null
          pickup_address: string | null
          pickup_city: string | null
          pickup_is_active: boolean | null
          pickup_latitude: number | null
          pickup_loading_time_minutes: number | null
          pickup_location_id: string | null
          pickup_longitude: number | null
          pickup_name: string | null
          pickup_postal_code: string | null
          pickup_type: string | null
          price_per_tonne: number | null
          supplier_id: string | null
          supplier_name: string | null
          supplier_type: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "jsc_material_supply_v"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      jsc_my_client_ids: { Args: never; Returns: string[] }
      jsc_my_driver_ids: { Args: never; Returns: string[] }
      jsc_next_number: {
        Args: { _company_id: string; _kind: string }
        Returns: string
      }
      jsc_notify: {
        Args: {
          _audience?: string
          _body: string
          _company_id: string
          _entity_id?: string
          _entity_type?: string
          _event_code: string
          _title: string
          _user_id?: string
        }
        Returns: string
      }
      jsc_ops_dashboard: { Args: { _company_id?: string }; Returns: Json }
      jsc_orch_control: { Args: { _company_id?: string }; Returns: Json }
      jsc_orch_detect_risks: { Args: { _company_id?: string }; Returns: Json }
      jsc_orch_kpis: { Args: { _company_id?: string }; Returns: Json }
      jsc_orch_map: { Args: { _company_id?: string }; Returns: Json }
      jsc_orch_rules_eval: { Args: { _company_id?: string }; Returns: Json }
      jsc_orch_simulate: {
        Args: {
          _company_id: string
          _inputs: Json
          _name: string
          _scenario_type: string
        }
        Returns: Json
      }
      jsc_orch_twin: { Args: { _company_id?: string }; Returns: Json }
      jsc_production_guard: { Args: never; Returns: Json }
      jsc_public_catalog: {
        Args: never
        Returns: {
          availability: string
          category: string
          cover_image_url: string
          images: string[]
          name: string
          public_description: string
          seo_description: string
          seo_keywords: string[]
          seo_title: string
          slug: string
          subcategory: string
          unit: string
          uses: string[]
        }[]
      }
      jsc_public_material: { Args: { _slug: string }; Returns: Json }
      jsc_public_material_units: {
        Args: never
        Returns: {
          allowed_units: string[]
          has_density: boolean
          slug: string
        }[]
      }
      jsc_public_materials_calc: {
        Args: never
        Returns: {
          allowed_units: string[]
          density_kg_per_m3: number
          name: string
          slug: string
        }[]
      }
      jsc_public_truck_capacity: { Args: never; Returns: number }
      jsc_public_truck_profiles: {
        Args: never
        Returns: {
          access_requirements: string[]
          axle_count: number
          capacity_m3: number
          capacity_tonnes: number
          id: string
          limitations: string[]
          name: string
          public_description: string
          public_image_url: string
          public_uses: string[]
          truck_type: string
        }[]
      }
      jsc_public_trucks: {
        Args: never
        Returns: {
          capacity_tonnes: number
          id: string
          name: string
          truck_type: string
        }[]
      }
      jsc_readiness: { Args: { _company_id?: string }; Returns: Json }
      jsc_seed_role_permissions: {
        Args: { _company_id: string }
        Returns: number
      }
      jsc_select_estimate: { Args: { _estimate_id: string }; Returns: string }
      jsc_supply_readiness: {
        Args: never
        Returns: {
          is_ready: boolean
          issues: string[]
          material_id: string
          material_name: string
          material_slug: string
          pickup_name: string
          price_per_tonne: number
          supplier_name: string
          supplier_type: string
        }[]
      }
      jsc_user_controls_company: {
        Args: { _company_id: string }
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
      matching_lab_candidates: {
        Args: { _lat?: number; _limit?: number; _lng?: number }
        Returns: {
          accepted_materials: Json
          access: Json
          address: string
          availability_confirmed_at: string
          availability_status: string
          city: string
          distance_kind: string
          distance_km: number
          dompe_number: string
          id: string
          latitude: number
          longitude: number
          materials: string
          other_material: string
          remaining_capacity: string
          status: string
          submission_number: string
          truck_types_allowed: string[]
        }[]
      }
      matching_v2_network_overview: { Args: never; Returns: Json }
      material_normalization_preview: {
        Args: never
        Returns: {
          confidence: string
          match_type: string
          material_id: string
          name_fr: string
          original_value: string
          outcome: string
          rule_applied: string
          slug: string
          submission_id: string
          submission_number: string
        }[]
      }
      material_normalize_text: { Args: { p: string }; Returns: string }
      material_resolve: {
        Args: { p_raw: string }
        Returns: {
          confidence: string
          match_type: string
          material_id: string
          name_fr: string
          rule_applied: string
          slug: string
        }[]
      }
      mkt_admin_board: {
        Args: never
        Returns: {
          award_amount: number
          award_status: string
          awarded_at: string
          bids_count: number
          bids_total: number
          city: string
          client_type: string
          commission_amount: number
          commission_status: string
          contact_name: string
          created_at: string
          deadline_at: string
          desired_date: string
          estimated_value: number
          id: string
          invitations_count: number
          invitations_sent_at: string
          last_activity_at: string
          last_bid_at: string
          notes_count: number
          organization_name: string
          region: string
          request_number: string
          responses_count: number
          status: string
          title: string
          unread_messages: number
        }[]
      }
      mkt_admin_set_status: {
        Args: { _note?: string; _request_id: string; _status: string }
        Returns: undefined
      }
      mkt_analytics: { Args: { _from?: string; _to?: string }; Returns: Json }
      mkt_can_join_thread: {
        Args: { _company_id: string; _thread_id: string }
        Returns: boolean
      }
      mkt_can_manage_photo_object: { Args: { _name: string }; Returns: boolean }
      mkt_can_see_request: { Args: { _request_id: string }; Returns: boolean }
      mkt_client_contact: {
        Args: { _company_id: string; _request_id: string }
        Returns: {
          address: string
          contact_email: string
          contact_name: string
          contact_phone: string
          organization_name: string
          rule: string
          visible: boolean
        }[]
      }
      mkt_client_select_bid: { Args: { _bid_id: string }; Returns: string }
      mkt_commission_board: {
        Args: never
        Returns: {
          amount: number
          awarded_at: string
          base_amount: number
          company_id: string
          created_at: string
          id: string
          invoiced_at: string
          label: string
          model: string
          paid_at: string
          partner_name: string
          request_id: string
          request_number: string
          request_title: string
          status: string
        }[]
      }
      mkt_compute_commission: { Args: { _award_id: string }; Returns: string }
      mkt_contact_is_revealed: {
        Args: { _company_id: string; _request_id: string }
        Returns: boolean
      }
      mkt_contact_rule: { Args: { _request_id: string }; Returns: string }
      mkt_contact_visible: {
        Args: { _company_id: string; _request_id: string }
        Returns: boolean
      }
      mkt_deal_suggest: {
        Args: {
          _material?: string
          _quantity?: number
          _request_id: string
          _unit?: string
        }
        Returns: Json
      }
      mkt_directory: {
        Args: {
          _category_slug?: string
          _city?: string
          _limit?: number
          _region?: string
          _service?: string
        }
        Returns: {
          city: string
          company_id: string
          description: string
          is_verified: boolean
          logo_url: string
          name: string
          public_score: number
          region: string
          services: string[]
          territories: string[]
        }[]
      }
      mkt_in_thread: { Args: { _thread_id: string }; Returns: boolean }
      mkt_invite_partners: {
        Args: {
          _company_ids: string[]
          _lot_id?: string
          _mode?: string
          _request_id: string
        }
        Returns: number
      }
      mkt_is_admin: { Args: never; Returns: boolean }
      mkt_is_member: { Args: { _company_id: string }; Returns: boolean }
      mkt_match_partners: {
        Args: { _lot_id?: string; _request_id: string }
        Returns: {
          already_invited: boolean
          availability_status: string
          city: string
          company_id: string
          distance_km: number
          is_verified: boolean
          last_activity: string
          matched_services: string[]
          partner_name: string
          reasons: Json
          region: string
          score: number
        }[]
      }
      mkt_next_request_number: { Args: never; Returns: string }
      mkt_notify:
        | {
            Args: {
              _audience: string
              _body?: string
              _company_id?: string
              _event: string
              _level?: string
              _link?: string
              _request_id?: string
              _title: string
              _user_id?: string
            }
            Returns: string
          }
        | {
            Args: {
              _audience: string
              _body?: string
              _company_id?: string
              _dedupe_key?: string
              _event: string
              _level?: string
              _link?: string
              _request_id?: string
              _title: string
              _user_id?: string
            }
            Returns: string
          }
        | {
            Args: {
              _audience: string
              _body?: string
              _company_id?: string
              _data?: Json
              _dedupe_key?: string
              _event: string
              _level?: string
              _link?: string
              _request_id?: string
              _title: string
              _user_id?: string
            }
            Returns: string
          }
      mkt_owns_request: { Args: { _request_id: string }; Returns: boolean }
      mkt_partner_contact: {
        Args: { _company_id: string; _request_id: string }
        Returns: {
          address: string
          email: string
          phone: string
          rule: string
          trade_name: string
          visible: boolean
          website: string
        }[]
      }
      mkt_partner_full: {
        Args: { _company_id: string }
        Returns: {
          accepts_subcontracting: boolean
          accepts_tenders: boolean
          address: string | null
          archived_at: string | null
          archived_by: string | null
          availability_note: string | null
          availability_status: string
          city: string | null
          company_id: string
          contact_name: string | null
          created_at: string
          description: string | null
          email: string | null
          founded_year: number | null
          id: string
          is_active: boolean
          is_public: boolean
          is_verified: boolean
          latitude: number | null
          legal_name: string | null
          logo_url: string | null
          longitude: number | null
          max_distance_km: number | null
          max_project_amount: number | null
          min_project_amount: number | null
          neq: string | null
          onboarding_status: string
          phone: string | null
          postal_code: string | null
          profile_id: string | null
          project_sizes: string[]
          region: string | null
          trade_name: string | null
          updated_at: string
          website: string | null
        }
        SetofOptions: {
          from: "*"
          to: "mkt_partners"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mkt_partner_is_public: { Args: { _company_id: string }; Returns: boolean }
      mkt_partner_public: { Args: { _company_id: string }; Returns: Json }
      mkt_photo_object_is_public: { Args: { _name: string }; Returns: boolean }
      mkt_recipient_email: {
        Args: { _company_id: string; _user_id: string }
        Returns: string
      }
      mkt_recompute_scores: { Args: never; Returns: number }
      mkt_resolve_pricing_rule: {
        Args: { _at?: string; _category_id?: string; _company_id: string }
        Returns: {
          category_id: string | null
          company_id: string | null
          created_at: string
          credits: number | null
          fixed_amount: number | null
          id: string
          is_default: boolean
          label: string
          max_amount: number | null
          min_amount: number | null
          model: string
          notes: string | null
          priority: number
          rate_percent: number | null
          scope: string
          status: string
          subscription_amount: number | null
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "mkt_pricing_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mkt_reveal_contact: {
        Args: { _request_id: string; _reveal?: boolean }
        Returns: undefined
      }
      mkt_run_automations: { Args: never; Returns: Json }
      mkt_run_automations_manual: { Args: never; Returns: Json }
      mkt_set_commission_status: {
        Args: { _commission_id: string; _note?: string; _status: string }
        Returns: undefined
      }
      mkt_thread_mark_read: { Args: { _thread_id: string }; Returns: undefined }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      ops_dashboard_stats: { Args: never; Returns: Json }
      ops_planning_range: {
        Args: { _from: string; _to: string }
        Returns: Json
      }
      platform_cleanup: { Args: never; Returns: Json }
      platform_has_capability: {
        Args: {
          _capability: string
          _company_id: string
          _environment?: string
        }
        Returns: boolean
      }
      platform_health: { Args: never; Returns: Json }
      platform_is_billing_manager: {
        Args: { _company_id: string }
        Returns: boolean
      }
      platform_is_company_member: {
        Args: { _company_id: string }
        Returns: boolean
      }
      platform_log_event: {
        Args: {
          _context?: Json
          _duration_ms?: number
          _event: string
          _level?: string
          _message?: string
          _ref_id?: string
          _source: string
          _status_code?: number
        }
        Returns: number
      }
      platform_subscription_covers: {
        Args: { _company_id: string; _environment?: string }
        Returns: boolean
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      remove_submission_site: {
        Args: { p_site_id: string; p_submission_id: string }
        Returns: Json
      }
      revoke_selected_site_validation: {
        Args: { p_submission_id: string }
        Returns: Json
      }
      save_comparateur_selection: {
        Args: {
          p_access_details?: Json
          p_desired_date?: string
          p_distance_km?: number
          p_duration_minutes?: number
          p_material?: string
          p_quantity?: number
          p_site_id: string
          p_site_label?: string
          p_submission_id: string
          p_timeframe?: string
          p_tonnage?: number
          p_trips?: number
          p_truck?: string
          p_unit?: string
        }
        Returns: Json
      }
      seo_bulk_errors: {
        Args: { _run_id: string }
        Returns: {
          attempts: number
          error: string
          last_error_at: string
          page_id: string
          slug: string
          task_id: string
          title: string
        }[]
      }
      seo_bulk_housekeeping: { Args: never; Returns: number }
      seo_bulk_overview: { Args: never; Returns: Json }
      seo_bulk_preview: {
        Args: { _mode?: string; _scope?: string }
        Returns: Json
      }
      seo_bulk_reconcile: { Args: never; Returns: number }
      seo_bulk_retry_task: { Args: { _task_id: string }; Returns: boolean }
      seo_bulk_start: {
        Args: {
          _concurrency?: number
          _limit?: number
          _mode?: string
          _scope?: string
        }
        Returns: Json
      }
      seo_bulk_start_pages: {
        Args: {
          _concurrency?: number
          _force?: boolean
          _mode?: string
          _page_ids: string[]
        }
        Returns: Json
      }
      seo_bulk_state: { Args: never; Returns: Json }
      seo_city_active_run: { Args: never; Returns: Json }
      seo_city_generation_overview: { Args: never; Returns: Json }
      seo_city_generation_report: {
        Args: { _city_slug: string }
        Returns: Json
      }
      seo_city_is_generable: { Args: { _city_slug: string }; Returns: boolean }
      seo_city_matrix: { Args: { _city_slug: string }; Returns: Json }
      seo_city_publish_missing: { Args: { _city_slug: string }; Returns: Json }
      seo_city_retry_errors: { Args: { _city_slug: string }; Returns: number }
      seo_city_run_abandon: { Args: { _job_id: string }; Returns: undefined }
      seo_city_run_finish: {
        Args: {
          _created: number
          _details?: Json
          _errors: number
          _job_id: string
        }
        Returns: undefined
      }
      seo_city_run_history: {
        Args: { _city_slug: string; _limit?: number }
        Returns: Json
      }
      seo_city_run_progress: {
        Args: {
          _created: number
          _current_label?: string
          _done: number
          _errors: number
          _job_id: string
        }
        Returns: undefined
      }
      seo_city_run_start: {
        Args: { _city_slug: string; _total: number }
        Returns: string
      }
      seo_city_slots_expected: {
        Args: { _city_slug?: string }
        Returns: {
          city_name: string
          city_slug: string
          kind: string
          label: string
          material_slug: string
          service_slug: string
        }[]
      }
      seo_control_center: { Args: never; Returns: Json }
      seo_copilot_state: { Args: never; Returns: Json }
      seo_dashboard_stats: { Args: never; Returns: Json }
      seo_executive_dashboard: { Args: never; Returns: Json }
      seo_final_coverage_report: { Args: never; Returns: Json }
      seo_final_report: { Args: { _run_id?: string }; Returns: Json }
      seo_generator_catalog: { Args: never; Returns: Json }
      seo_index_diagnosis: { Args: never; Returns: Json }
      seo_intelligence_dashboard: { Args: never; Returns: Json }
      seo_intelligence_pages: {
        Args: { _filter?: string; _limit?: number }
        Returns: {
          avg_position: number
          backlinks_count: number
          clicks: number
          ctr: number
          diagnostic_report: Json
          discovered_at: string
          id: string
          impressions: number
          indexed_at: string
          intelligence_flags: string[]
          intelligence_last_checked_at: string
          published_at: string
          qa_last_score: number
          slug: string
          status: string
          title: string
          top_queries: Json
        }[]
      }
      seo_manager_cities: { Args: never; Returns: Json }
      seo_opportunity_analysis: { Args: never; Returns: Json }
      seo_optimization_autotune: { Args: { _run_id: string }; Returns: number }
      seo_optimization_cancel: { Args: { _run_id: string }; Returns: undefined }
      seo_optimization_candidates: {
        Args: { _limit?: number; _offset?: number; _scope?: string }
        Returns: {
          avg_position: number
          backlinks_count: number
          clicks: number
          ctr: number
          google_index_status: string
          id: string
          impressions: number
          improvements_applied: number
          indexed_at: string
          intelligence_flags: string[]
          internal_link_count: number
          last_improved_at: string
          meta_description: string
          meta_title: string
          primary_keyword: string
          priority_level: string
          priority_score: number
          published_at: string
          qa_last_score: number
          reasons: string[]
          seo_score: number
          slug: string
          title: string
          top_queries: Json
          word_count: number
        }[]
      }
      seo_optimization_counts: { Args: never; Returns: Json }
      seo_optimization_finalize: { Args: { _run_id: string }; Returns: string }
      seo_optimization_pause: { Args: { _run_id: string }; Returns: undefined }
      seo_optimization_resume: { Args: { _run_id: string }; Returns: undefined }
      seo_optimization_retry_errors: {
        Args: { _run_id: string }
        Returns: number
      }
      seo_optimization_start: {
        Args: {
          _actions?: string[]
          _city_slugs?: string[]
          _concurrency?: number
          _force_all?: boolean
          _limit?: number
          _skip_above?: number
          _threshold?: number
        }
        Returns: string
      }
      seo_optimization_state: { Args: never; Returns: Json }
      seo_optimization_watchdog: { Args: never; Returns: number }
      seo_orchestrator_acquire_lease: {
        Args: { _holder_id: string; _ttl_seconds?: number }
        Returns: boolean
      }
      seo_orchestrator_release_lease: {
        Args: { _holder_id: string }
        Returns: boolean
      }
      seo_orchestrator_try_lock: { Args: never; Returns: boolean }
      seo_orchestrator_unlock: { Args: never; Returns: boolean }
      seo_page_optim_history: {
        Args: { _limit?: number; _page_id: string }
        Returns: {
          error: string
          finished_at: string
          fixed_actions: string[]
          mode: string
          qa_after: number
          qa_before: number
          run_id: string
          skip_reason: string
          status: string
          task_id: string
        }[]
      }
      seo_page_publish: { Args: { _page_id: string }; Returns: Json }
      seo_page_rollback: { Args: { _improvement_id: string }; Returns: Json }
      seo_page_save: { Args: { _page_id: string; _patch: Json }; Returns: Json }
      seo_pipeline_cancel: { Args: { _run_id: string }; Returns: undefined }
      seo_pipeline_detect_stalls: {
        Args: { _alert_minutes?: number }
        Returns: Json
      }
      seo_pipeline_health: { Args: never; Returns: Json }
      seo_pipeline_missing_preview: { Args: never; Returns: Json }
      seo_pipeline_pause: { Args: { _run_id: string }; Returns: undefined }
      seo_pipeline_purge_stale: { Args: never; Returns: number }
      seo_pipeline_regenerate_city: {
        Args: { _city_slug: string }
        Returns: string
      }
      seo_pipeline_republish_city: {
        Args: { _city_slug: string }
        Returns: string
      }
      seo_pipeline_resume: { Args: { _run_id: string }; Returns: undefined }
      seo_pipeline_retry_errors: { Args: { _run_id: string }; Returns: number }
      seo_pipeline_start: {
        Args: {
          _city_slugs?: string[]
          _force_regenerate?: boolean
          _mode?: string
          _qa_threshold?: number
        }
        Returns: string
      }
      seo_pipeline_start_missing: {
        Args: { _qa_threshold?: number }
        Returns: Json
      }
      seo_pipeline_state: { Args: never; Returns: Json }
      seo_pipeline_state_v2: { Args: never; Returns: Json }
      seo_pipeline_stop: { Args: { _run_id: string }; Returns: undefined }
      seo_priority_score: { Args: { _page_id: string }; Returns: number }
      seo_publication_dashboard: { Args: never; Returns: Json }
      seo_recompute_page_scores: {
        Args: { _page_id?: string }
        Returns: number
      }
      seo_slot_rows: {
        Args: { _city_slug?: string }
        Returns: {
          city_name: string
          city_slug: string
          gen_state: string
          issues: string[]
          kind: string
          label: string
          last_generated_at: string
          material_slug: string
          page_id: string
          page_slug: string
          page_status: string
          pub_state: string
          published_at: string
          seo_score: number
          service_slug: string
          task_attempts: number
          task_error: string
          task_status: string
          task_step: string
          task_updated_at: string
          title: string
          word_count: number
        }[]
      }
      seo_slugify: { Args: { _s: string }; Returns: string }
      seo_sync_cities_from_territories: { Args: never; Returns: Json }
      seo_territorial_coverage: { Args: never; Returns: Json }
      seo_triage_summary: { Args: never; Returns: Json }
      seo_truth_metrics: { Args: never; Returns: Json }
      seo_validate_page_fields: {
        Args: {
          _city_slug: string
          _content_html: string
          _dupe: boolean
          _h1: string
          _meta_description: string
          _meta_title: string
          _slug: string
        }
        Returns: string[]
      }
      set_dompe_availability: {
        Args: {
          _confirm?: boolean
          _note?: string
          _reason?: string
          _request_revalidation?: boolean
          _source?: string
          _status?: string
          _submission_id: string
        }
        Returns: {
          access_criteria: string[] | null
          access_details: Json | null
          access_heavy_truck: string | null
          accessibility: string[] | null
          address: string
          assigned_entrepreneur: string | null
          availability_confirmed_by: string | null
          availability_note: string | null
          availability_reason: string | null
          availability_source: string | null
          availability_status: string
          availability_updated_at: string | null
          budget_max: string | null
          budget_unit: string | null
          callara_call_id: string | null
          city: string | null
          client_id: string | null
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
          landing_referrer: string | null
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
          next_follow_up_at: string | null
          opening_hours: string | null
          other_material: string | null
          parcours_direction: string | null
          phone: string | null
          photos: string[] | null
          photos_meta: Json | null
          place_id: string | null
          postal_code: string | null
          postal_latitude: number | null
          postal_latitude_old: number | null
          postal_longitude: number | null
          postal_longitude_old: number | null
          priority: string
          property_type: string
          province: string | null
          public_latitude: number | null
          public_longitude: number | null
          public_point_updated_at: string | null
          quantity: string
          quantity_unit: string | null
          quantity_value: number | null
          quote_distance_km: number | null
          quote_duration_minutes: number | null
          quote_id: string | null
          quote_material: string | null
          quote_number: string | null
          quote_quantity: number | null
          quote_tonnage: number | null
          quote_total: number | null
          quote_trips: number | null
          quote_truck: string | null
          quote_unit: string | null
          remaining_capacity: string | null
          request_type: string
          revalidation_days_override: number | null
          revalidation_requested_at: string | null
          selected_site_address: string | null
          selected_site_id: string | null
          selected_site_label: string | null
          selected_site_latitude: number | null
          selected_site_longitude: number | null
          selection_updated_at: string | null
          service_type: string | null
          sheet_backup_at: string | null
          show_on_admin_map: boolean
          site_validated_at: string | null
          site_validated_by: string | null
          status: string
          submission_number: number
          territory_confidence: string | null
          territory_id: string | null
          territory_reason: string | null
          territory_sector: string | null
          territory_source: string | null
          territory_status: string | null
          tonnage: string
          truck_type_key: string | null
          truck_types_allowed: string[] | null
          updated_at: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visible_to_entrepreneur: boolean
          width_ft: string | null
        }
        SetofOptions: {
          from: "*"
          to: "submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_my_network_visibility: {
        Args: { _visible: boolean }
        Returns: boolean
      }
      submission_belongs_to_current_user: {
        Args: { p_submission_id: string }
        Returns: boolean
      }
      trip_advance_status: {
        Args: {
          _next: Database["public"]["Enums"]["trip_status"]
          _reason?: string
          _trip_id: string
        }
        Returns: undefined
      }
      unaccent_immutable: { Args: { _text: string }; Returns: string }
      unaccent_less: { Args: { _s: string }; Returns: string }
      unaccent_string: { Args: { input: string }; Returns: string }
      validate_selected_site: {
        Args: { p_submission_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "user"
        | "entrepreneur"
        | "proprietaire"
        | "transporteur"
      blog_post_status: "draft" | "published" | "scheduled" | "archived"
      calendar_event_status:
        | "a_planifier"
        | "planifie"
        | "en_cours"
        | "termine"
        | "reporte"
        | "annule"
      driver_status: "disponible" | "occupe" | "inactif"
      transport_dimension_source:
        | "ACTUAL_MEASURED"
        | "MANUFACTURER_SPEC"
        | "REGULATORY_LIMIT"
        | "OPERATIONAL_ESTIMATE"
        | "DEFAULT_ESTIMATE"
      transport_request_status:
        | "nouvelle"
        | "a_rappeler"
        | "en_analyse"
        | "soumission_envoyee"
        | "acceptee"
        | "planifiee"
        | "en_cours"
        | "terminee"
        | "annulee"
        | "en_attente_proprietaire"
        | "refusee"
      trip_status:
        | "demande"
        | "soumission_envoyee"
        | "accepte"
        | "planifie"
        | "en_route"
        | "chargement"
        | "transport"
        | "livraison"
        | "termine"
        | "facture"
        | "paye"
        | "annule"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
        "user",
        "entrepreneur",
        "proprietaire",
        "transporteur",
      ],
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
      transport_dimension_source: [
        "ACTUAL_MEASURED",
        "MANUFACTURER_SPEC",
        "REGULATORY_LIMIT",
        "OPERATIONAL_ESTIMATE",
        "DEFAULT_ESTIMATE",
      ],
      transport_request_status: [
        "nouvelle",
        "a_rappeler",
        "en_analyse",
        "soumission_envoyee",
        "acceptee",
        "planifiee",
        "en_cours",
        "terminee",
        "annulee",
        "en_attente_proprietaire",
        "refusee",
      ],
      trip_status: [
        "demande",
        "soumission_envoyee",
        "accepte",
        "planifie",
        "en_route",
        "chargement",
        "transport",
        "livraison",
        "termine",
        "facture",
        "paye",
        "annule",
      ],
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
