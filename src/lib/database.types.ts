export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      bot_state: {
        Row: {
          key: string;
          updated_at: string;
          value: Json;
        };
        Insert: {
          key: string;
          updated_at?: string;
          value: Json;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: Json;
        };
        Relationships: [];
      };
      chat_context_messages: {
        Row: {
          chat_id: number;
          content: string;
          created_at: string;
          id: number;
          role: "user" | "assistant";
        };
        Insert: {
          chat_id: number;
          content: string;
          created_at?: string;
          id?: number;
          role: "user" | "assistant";
        };
        Update: {
          chat_id?: number;
          content?: string;
          created_at?: string;
          id?: number;
          role?: "user" | "assistant";
        };
        Relationships: [
          {
            foreignKeyName: "chat_context_messages_chat_id_fkey";
            columns: ["chat_id"];
            isOneToOne: false;
            referencedRelation: "telegram_chat_settings";
            referencedColumns: ["chat_id"];
          },
        ];
      };
      daily_question_log: {
        Row: {
          chat_id: number;
          deleted_at: string | null;
          id: number;
          question: string;
          sent_at: string;
          telegram_message_id: number | null;
        };
        Insert: {
          chat_id: number;
          deleted_at?: string | null;
          id?: number;
          question: string;
          sent_at?: string;
          telegram_message_id?: number | null;
        };
        Update: {
          chat_id?: number;
          deleted_at?: string | null;
          id?: number;
          question?: string;
          sent_at?: string;
          telegram_message_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "daily_question_log_chat_id_fkey";
            columns: ["chat_id"];
            isOneToOne: false;
            referencedRelation: "telegram_chat_settings";
            referencedColumns: ["chat_id"];
          },
        ];
      };
      daily_question_send_lock: {
        Row: {
          chat_id: number;
          created_at: string;
          send_date: string;
        };
        Insert: {
          chat_id: number;
          created_at?: string;
          send_date: string;
        };
        Update: {
          chat_id?: number;
          created_at?: string;
          send_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_question_send_lock_chat_id_fkey";
            columns: ["chat_id"];
            isOneToOne: false;
            referencedRelation: "telegram_chat_settings";
            referencedColumns: ["chat_id"];
          },
        ];
      };
      telegram_chat_settings: {
        Row: {
          chat_id: number;
          created_at: string;
          daily_questions_enabled: boolean;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          chat_id: number;
          created_at?: string;
          daily_questions_enabled?: boolean;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          chat_id?: number;
          created_at?: string;
          daily_questions_enabled?: boolean;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
