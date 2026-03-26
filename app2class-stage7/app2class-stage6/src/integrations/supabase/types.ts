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
      approvals: {
        Row: {
          approver_id: string | null
          created_at: string
          id: string
          notes: string | null
          required_role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["approval_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          approver_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          required_role: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          approver_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          required_role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assignments: {
        Row: {
          allow_late_submission: boolean | null
          allow_revision: boolean | null
          class_id: string
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          max_grade: number | null
          published: boolean | null
          school_id: string
          subject: string
          teacher_id: string
          title: string
          type: Database["public"]["Enums"]["assignment_type"]
          updated_at: string
          weight_percent: number | null
        }
        Insert: {
          allow_late_submission?: boolean | null
          allow_revision?: boolean | null
          class_id: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          max_grade?: number | null
          published?: boolean | null
          school_id: string
          subject: string
          teacher_id: string
          title: string
          type?: Database["public"]["Enums"]["assignment_type"]
          updated_at?: string
          weight_percent?: number | null
        }
        Update: {
          allow_late_submission?: boolean | null
          allow_revision?: boolean | null
          class_id?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          max_grade?: number | null
          published?: boolean | null
          school_id?: string
          subject?: string
          teacher_id?: string
          title?: string
          type?: Database["public"]["Enums"]["assignment_type"]
          updated_at?: string
          weight_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          id: string
          lesson_id: string
          noted_at: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          lesson_id: string
          noted_at?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          lesson_id?: string
          noted_at?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      avatars: {
        Row: {
          accessory: string | null
          background: string
          created_at: string
          expression: string
          eye_color: string
          eye_shape: string
          face_shape: string
          facial_hair: string | null
          hair_color: string
          hair_style: string
          id: string
          outfit: string
          outfit_color: string
          skin_color: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accessory?: string | null
          background?: string
          created_at?: string
          expression?: string
          eye_color?: string
          eye_shape?: string
          face_shape?: string
          facial_hair?: string | null
          hair_color?: string
          hair_style?: string
          id?: string
          outfit?: string
          outfit_color?: string
          skin_color?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accessory?: string | null
          background?: string
          created_at?: string
          expression?: string
          eye_color?: string
          eye_shape?: string
          face_shape?: string
          facial_hair?: string | null
          hair_color?: string
          hair_style?: string
          id?: string
          outfit?: string
          outfit_color?: string
          skin_color?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bell_schedule: {
        Row: {
          break_duration_minutes: number | null
          end_time: string
          id: string
          is_break: boolean
          label: string
          lesson_number: number
          school_id: string
          start_time: string
        }
        Insert: {
          break_duration_minutes?: number | null
          end_time: string
          id?: string
          is_break?: boolean
          label?: string
          lesson_number: number
          school_id: string
          start_time: string
        }
        Update: {
          break_duration_minutes?: number | null
          end_time?: string
          id?: string
          is_break?: boolean
          label?: string
          lesson_number?: number
          school_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "bell_schedule_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_settings: {
        Row: {
          id: string
          quiet_hours_enabled: boolean | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          class_number: number
          created_at: string
          grade: Database["public"]["Enums"]["grade_level"]
          id: string
          school_id: string
        }
        Insert: {
          class_number: number
          created_at?: string
          grade: Database["public"]["Enums"]["grade_level"]
          id?: string
          school_id: string
        }
        Update: {
          class_number?: number
          created_at?: string
          grade?: Database["public"]["Enums"]["grade_level"]
          id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          last_read_at: string | null
          muted: boolean | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          muted?: boolean | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          muted?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          class_id: string | null
          created_at: string
          created_by: string
          grade: string | null
          id: string
          is_accepted: boolean | null
          school_id: string
          subject: string | null
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          created_by: string
          grade?: string | null
          id?: string
          is_accepted?: boolean | null
          school_id: string
          subject?: string | null
          title?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          created_by?: string
          grade?: string | null
          id?: string
          is_accepted?: boolean | null
          school_id?: string
          subject?: string | null
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      event_approvals: {
        Row: {
          approved: boolean | null
          created_at: string
          event_id: string
          id: string
          parent_id: string
          signed_at: string | null
          student_id: string
        }
        Insert: {
          approved?: boolean | null
          created_at?: string
          event_id: string
          id?: string
          parent_id: string
          signed_at?: string | null
          student_id: string
        }
        Update: {
          approved?: boolean | null
          created_at?: string
          event_id?: string
          id?: string
          parent_id?: string
          signed_at?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_approvals_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "grade_events"
            referencedColumns: ["id"]
          },
        ]
      }
      faction_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          flowers: number
          id: string
          is_anonymous: boolean
          is_removed: boolean | null
          post_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          flowers?: number
          id?: string
          is_anonymous?: boolean
          is_removed?: boolean | null
          post_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          flowers?: number
          id?: string
          is_anonymous?: boolean
          is_removed?: boolean | null
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "faction_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "faction_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      faction_members: {
        Row: {
          faction_id: string
          id: string
          joined_at: string
          reputation: number
          role: string
          user_id: string
        }
        Insert: {
          faction_id: string
          id?: string
          joined_at?: string
          reputation?: number
          role?: string
          user_id: string
        }
        Update: {
          faction_id?: string
          id?: string
          joined_at?: string
          reputation?: number
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "faction_members_faction_id_fkey"
            columns: ["faction_id"]
            isOneToOne: false
            referencedRelation: "factions"
            referencedColumns: ["id"]
          },
        ]
      }
      faction_posts: {
        Row: {
          author_id: string
          content: string
          created_at: string
          faction_id: string
          flowers: number
          id: string
          is_anonymous: boolean
          is_community_pinned: boolean | null
          is_pinned: boolean | null
          is_removed: boolean | null
          removed_by: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          faction_id: string
          flowers?: number
          id?: string
          is_anonymous?: boolean
          is_community_pinned?: boolean | null
          is_pinned?: boolean | null
          is_removed?: boolean | null
          removed_by?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          faction_id?: string
          flowers?: number
          id?: string
          is_anonymous?: boolean
          is_community_pinned?: boolean | null
          is_pinned?: boolean | null
          is_removed?: boolean | null
          removed_by?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faction_posts_faction_id_fkey"
            columns: ["faction_id"]
            isOneToOne: false
            referencedRelation: "factions"
            referencedColumns: ["id"]
          },
        ]
      }
      factions: {
        Row: {
          class_id: string | null
          color: string | null
          created_at: string
          description: string | null
          eligible_roles: string[]
          faction_type: string
          grade: string | null
          icon: string | null
          id: string
          is_sub_faction: boolean | null
          name: string
          parent_faction_id: string | null
          school_id: string
          sub_type: string | null
          subject: string | null
        }
        Insert: {
          class_id?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          eligible_roles?: string[]
          faction_type: string
          grade?: string | null
          icon?: string | null
          id?: string
          is_sub_faction?: boolean | null
          name: string
          parent_faction_id?: string | null
          school_id: string
          sub_type?: string | null
          subject?: string | null
        }
        Update: {
          class_id?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          eligible_roles?: string[]
          faction_type?: string
          grade?: string | null
          icon?: string | null
          id?: string
          is_sub_faction?: boolean | null
          name?: string
          parent_faction_id?: string | null
          school_id?: string
          sub_type?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "factions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factions_parent_faction_id_fkey"
            columns: ["parent_faction_id"]
            isOneToOne: false
            referencedRelation: "factions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      flower_votes: {
        Row: {
          comment_id: string | null
          created_at: string
          id: string
          post_id: string | null
          user_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          user_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flower_votes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "faction_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flower_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "faction_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      focus_reports: {
        Row: {
          created_at: string
          id: string
          lesson_id: string
          level: number
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_id: string
          level: number
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lesson_id?: string
          level?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "focus_reports_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_announcements: {
        Row: {
          announcement_type: string
          content: string
          created_at: string
          created_by: string
          grade: Database["public"]["Enums"]["grade_level"]
          id: string
          published: boolean | null
          published_at: string | null
          school_id: string
          target_audience: string
          title: string
          updated_at: string
        }
        Insert: {
          announcement_type?: string
          content: string
          created_at?: string
          created_by: string
          grade: Database["public"]["Enums"]["grade_level"]
          id?: string
          published?: boolean | null
          published_at?: string | null
          school_id: string
          target_audience?: string
          title: string
          updated_at?: string
        }
        Update: {
          announcement_type?: string
          content?: string
          created_at?: string
          created_by?: string
          grade?: Database["public"]["Enums"]["grade_level"]
          id?: string
          published?: boolean | null
          published_at?: string | null
          school_id?: string
          target_audience?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_events: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          description: string | null
          end_time: string | null
          event_date: string
          event_end_date: string | null
          event_type: string
          grade: Database["public"]["Enums"]["grade_level"]
          id: string
          max_exams_per_week: number | null
          notes: string | null
          proposed_by: string
          rejection_reason: string | null
          requires_parent_approval: boolean | null
          school_id: string
          start_time: string | null
          status: string
          subject: string | null
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          event_date: string
          event_end_date?: string | null
          event_type?: string
          grade: Database["public"]["Enums"]["grade_level"]
          id?: string
          max_exams_per_week?: number | null
          notes?: string | null
          proposed_by: string
          rejection_reason?: string | null
          requires_parent_approval?: boolean | null
          school_id: string
          start_time?: string | null
          status?: string
          subject?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          event_date?: string
          event_end_date?: string | null
          event_type?: string
          grade?: Database["public"]["Enums"]["grade_level"]
          id?: string
          max_exams_per_week?: number | null
          notes?: string | null
          proposed_by?: string
          rejection_reason?: string | null
          requires_parent_approval?: boolean | null
          school_id?: string
          start_time?: string | null
          status?: string
          subject?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_notes: {
        Row: {
          category: Database["public"]["Enums"]["note_category"]
          created_at: string
          id: string
          lesson_id: string
          note: string | null
          student_id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["note_category"]
          created_at?: string
          id?: string
          lesson_id: string
          note?: string | null
          student_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["note_category"]
          created_at?: string
          id?: string
          lesson_id?: string
          note?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_notes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          class_id: string
          created_at: string
          id: string
          lesson_date: string
          lesson_number: number
          school_id: string
          subject: string
          teacher_id: string
          topic: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          lesson_date?: string
          lesson_number?: number
          school_id: string
          subject: string
          teacher_id: string
          topic?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          lesson_date?: string
          lesson_number?: number
          school_id?: string
          subject?: string
          teacher_id?: string
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      live_poll_responses: {
        Row: {
          created_at: string
          id: string
          poll_id: string
          selected_option: number
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          poll_id: string
          selected_option: number
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          poll_id?: string
          selected_option?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_poll_responses_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "live_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      live_polls: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          options: Json
          poll_type: string
          question: string
          session_id: string
          show_results: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          options?: Json
          poll_type?: string
          question: string
          session_id: string
          show_results?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          options?: Json
          poll_type?: string
          question?: string
          session_id?: string
          show_results?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "live_polls_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_question_votes: {
        Row: {
          created_at: string
          id: string
          question_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          question_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_question_votes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "live_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_questions: {
        Row: {
          content: string
          created_at: string
          id: string
          is_anonymous: boolean
          is_answered: boolean
          session_id: string
          student_id: string
          upvotes: number
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_anonymous?: boolean
          is_answered?: boolean
          session_id: string
          student_id: string
          upvotes?: number
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_anonymous?: boolean
          is_answered?: boolean
          session_id?: string
          student_id?: string
          upvotes?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sessions: {
        Row: {
          class_id: string
          created_at: string
          id: string
          is_active: boolean
          lesson_number: number
          school_id: string
          session_date: string
          shared_content_title: string | null
          shared_content_type: string | null
          shared_content_url: string | null
          subject: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          lesson_number: number
          school_id: string
          session_date?: string
          shared_content_title?: string | null
          shared_content_type?: string | null
          shared_content_url?: string | null
          subject: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          lesson_number?: number
          school_id?: string
          session_date?: string
          shared_content_title?: string | null
          shared_content_type?: string | null
          shared_content_url?: string | null
          subject?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_sessions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_attendees: {
        Row: {
          confirmed: boolean | null
          created_at: string
          id: string
          meeting_id: string
          user_id: string
        }
        Insert: {
          confirmed?: boolean | null
          created_at?: string
          id?: string
          meeting_id: string
          user_id: string
        }
        Update: {
          confirmed?: boolean | null
          created_at?: string
          id?: string
          meeting_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "staff_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          flag_reason: string | null
          id: string
          is_flagged: boolean | null
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          flag_reason?: string | null
          id?: string
          is_flagged?: boolean | null
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          flag_reason?: string | null
          id?: string
          is_flagged?: boolean | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_student: {
        Row: {
          created_at: string
          id: string
          parent_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parent_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parent_id?: string
          student_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          class_id: string | null
          created_at: string
          date_of_birth: string | null
          email: string
          full_name: string
          id: string
          id_number: string | null
          is_approved: boolean
          phone: string | null
          school_id: string | null
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          email: string
          full_name: string
          id: string
          id_number?: string | null
          is_approved?: boolean
          phone?: string | null
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string
          full_name?: string
          id?: string
          id_number?: string | null
          is_approved?: boolean
          phone?: string | null
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      staff_meetings: {
        Row: {
          ai_suggested: boolean | null
          created_at: string
          description: string | null
          end_time: string | null
          grade: Database["public"]["Enums"]["grade_level"] | null
          id: string
          location: string | null
          meeting_date: string
          organized_by: string
          protocol: string | null
          school_id: string
          start_time: string | null
          status: string
          subject: string | null
          suggestion_reason: string | null
          title: string
          updated_at: string
        }
        Insert: {
          ai_suggested?: boolean | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          grade?: Database["public"]["Enums"]["grade_level"] | null
          id?: string
          location?: string | null
          meeting_date: string
          organized_by: string
          protocol?: string | null
          school_id: string
          start_time?: string | null
          status?: string
          subject?: string | null
          suggestion_reason?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          ai_suggested?: boolean | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          grade?: Database["public"]["Enums"]["grade_level"] | null
          id?: string
          location?: string | null
          meeting_date?: string
          organized_by?: string
          protocol?: string | null
          school_id?: string
          start_time?: string | null
          status?: string
          subject?: string | null
          suggestion_reason?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_meetings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      student_tracks: {
        Row: {
          approved: boolean | null
          approved_by: string | null
          created_at: string
          id: string
          level: string | null
          school_id: string
          track_name: string
          track_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved?: boolean | null
          approved_by?: string | null
          created_at?: string
          id?: string
          level?: string | null
          school_id: string
          track_name: string
          track_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved?: boolean | null
          approved_by?: string | null
          created_at?: string
          id?: string
          level?: string | null
          school_id?: string
          track_name?: string
          track_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_tracks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          assignment_id: string
          content: string | null
          created_at: string
          feedback: string | null
          file_url: string | null
          grade: number | null
          graded_at: string | null
          graded_by: string | null
          id: string
          status: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          assignment_id: string
          content?: string | null
          created_at?: string
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          status?: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          content?: string | null
          created_at?: string
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          status?: Database["public"]["Enums"]["submission_status"]
          student_id?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      task_questions: {
        Row: {
          assignment_id: string
          correct_answer: string | null
          created_at: string
          difficulty: number | null
          explanation: string | null
          id: string
          image_url: string | null
          options: Json | null
          order_num: number
          points: number | null
          question_text: string
          question_type: Database["public"]["Enums"]["question_type"]
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          assignment_id: string
          correct_answer?: string | null
          created_at?: string
          difficulty?: number | null
          explanation?: string | null
          id?: string
          image_url?: string | null
          options?: Json | null
          order_num?: number
          points?: number | null
          question_text: string
          question_type?: Database["public"]["Enums"]["question_type"]
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          correct_answer?: string | null
          created_at?: string
          difficulty?: number | null
          explanation?: string | null
          id?: string
          image_url?: string | null
          options?: Json | null
          order_num?: number
          points?: number | null
          question_text?: string
          question_type?: Database["public"]["Enums"]["question_type"]
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_questions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_classes: {
        Row: {
          class_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_classes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_slots: {
        Row: {
          class_id: string | null
          color: string | null
          created_at: string
          day_of_week: number
          group_name: string | null
          id: string
          lesson_number: number
          room: string | null
          school_id: string
          subject: string
          teacher_id: string | null
          teacher_name: string | null
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          color?: string | null
          created_at?: string
          day_of_week: number
          group_name?: string | null
          id?: string
          lesson_number: number
          room?: string | null
          school_id: string
          subject: string
          teacher_id?: string | null
          teacher_name?: string | null
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          color?: string | null
          created_at?: string
          day_of_week?: number
          group_name?: string | null
          id?: string
          lesson_number?: number
          room?: string | null
          school_id?: string
          subject?: string
          teacher_id?: string | null
          teacher_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      tutoring_sessions: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          end_time: string | null
          grade: Database["public"]["Enums"]["grade_level"]
          id: string
          max_students: number | null
          room: string | null
          school_id: string
          session_date: string
          start_time: string | null
          status: string
          subject: string
          teacher_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          end_time?: string | null
          grade: Database["public"]["Enums"]["grade_level"]
          id?: string
          max_students?: number | null
          room?: string | null
          school_id: string
          session_date: string
          start_time?: string | null
          status?: string
          subject: string
          teacher_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          end_time?: string | null
          grade?: Database["public"]["Enums"]["grade_level"]
          id?: string
          max_students?: number | null
          room?: string | null
          school_id?: string
          session_date?: string
          start_time?: string | null
          status?: string
          subject?: string
          teacher_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutoring_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      tutoring_students: {
        Row: {
          attended: boolean | null
          created_at: string
          id: string
          session_id: string
          student_id: string
        }
        Insert: {
          attended?: boolean | null
          created_at?: string
          id?: string
          session_id: string
          student_id: string
        }
        Update: {
          attended?: boolean | null
          created_at?: string
          id?: string
          session_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutoring_students_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "tutoring_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_category: string
          badge_icon: string
          badge_key: string
          badge_label: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_category?: string
          badge_icon?: string
          badge_key: string
          badge_label: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_category?: string
          badge_icon?: string
          badge_key?: string
          badge_label?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_reliability: {
        Row: {
          id: string
          is_faction_guardian: boolean
          score: number
          total_negative: number
          total_positive: number
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          is_faction_guardian?: boolean
          score?: number
          total_negative?: number
          total_positive?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          is_faction_guardian?: boolean
          score?: number
          total_negative?: number
          total_positive?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          grade: Database["public"]["Enums"]["grade_level"] | null
          homeroom_class_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          subject: string | null
          user_id: string
        }
        Insert: {
          grade?: Database["public"]["Enums"]["grade_level"] | null
          homeroom_class_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          subject?: string | null
          user_id: string
        }
        Update: {
          grade?: Database["public"]["Enums"]["grade_level"] | null
          homeroom_class_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          subject?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_homeroom_class_id_fkey"
            columns: ["homeroom_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_streaks: {
        Row: {
          current_streak: number
          id: string
          last_active_date: string
          longest_streak: number
          total_active_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_streak?: number
          id?: string
          last_active_date?: string
          longest_streak?: number
          total_active_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_streak?: number
          id?: string
          last_active_date?: string
          longest_streak?: number
          total_active_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_and_award_badge: {
        Args: {
          p_badge_icon: string
          p_badge_key: string
          p_badge_label: string
          p_category: string
          p_user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_current_user_approved: { Args: never; Returns: boolean }
      update_user_streak: { Args: { p_user_id: string }; Returns: undefined }
    }
    Enums: {
      app_role:
        | "student"
        | "parent"
        | "educator"
        | "professional_teacher"
        | "subject_coordinator"
        | "grade_coordinator"
        | "counselor"
        | "management"
        | "system_admin"
      approval_status: "pending" | "approved" | "rejected"
      assignment_type: "homework" | "exam" | "quiz" | "project" | "exercise"
      attendance_status: "present" | "absent" | "late" | "excused"
      grade_level: "ז" | "ח" | "ט" | "י" | "יא" | "יב"
      note_category:
        | "disruption"
        | "phone"
        | "disrespect"
        | "no_equipment"
        | "no_homework"
        | "positive_participation"
        | "helped_peer"
        | "excellence"
      question_type:
        | "multiple_choice"
        | "open"
        | "true_false"
        | "fill_blank"
        | "matching"
      submission_status:
        | "draft"
        | "submitted"
        | "graded"
        | "revision_needed"
        | "revised"
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
        "student",
        "parent",
        "educator",
        "professional_teacher",
        "subject_coordinator",
        "grade_coordinator",
        "counselor",
        "management",
        "system_admin",
      ],
      approval_status: ["pending", "approved", "rejected"],
      assignment_type: ["homework", "exam", "quiz", "project", "exercise"],
      attendance_status: ["present", "absent", "late", "excused"],
      grade_level: ["ז", "ח", "ט", "י", "יא", "יב"],
      note_category: [
        "disruption",
        "phone",
        "disrespect",
        "no_equipment",
        "no_homework",
        "positive_participation",
        "helped_peer",
        "excellence",
      ],
      question_type: [
        "multiple_choice",
        "open",
        "true_false",
        "fill_blank",
        "matching",
      ],
      submission_status: [
        "draft",
        "submitted",
        "graded",
        "revision_needed",
        "revised",
      ],
    },
  },
} as const
