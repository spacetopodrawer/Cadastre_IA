export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'USER';
export type PermissionLevel = 'READ' | 'WRITE' | 'ADMIN';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: UserRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
      };
      files: {
        Row: {
          id: string;
          name: string;
          description: string;
          content: Json;
          thumbnail: string | null;
          owner_id: string;
          is_shared: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string;
          content: Json;
          thumbnail?: string | null;
          owner_id: string;
          is_shared?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          content?: Json;
          thumbnail?: string | null;
          owner_id?: string;
          is_shared?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      file_versions: {
        Row: {
          id: string;
          file_id: string;
          version_number: number;
          content: Json;
          modified_by: string;
          change_log: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          file_id: string;
          version_number: number;
          content: Json;
          modified_by: string;
          change_log?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          file_id?: string;
          version_number?: number;
          content?: Json;
          modified_by?: string;
          change_log?: string;
          created_at?: string;
        };
      };
      file_permissions: {
        Row: {
          id: string;
          file_id: string;
          user_id: string;
          permission_level: PermissionLevel;
          granted_at: string;
          granted_by: string;
        };
        Insert: {
          id?: string;
          file_id: string;
          user_id: string;
          permission_level: PermissionLevel;
          granted_at?: string;
          granted_by: string;
        };
        Update: {
          id?: string;
          file_id?: string;
          user_id?: string;
          permission_level?: PermissionLevel;
          granted_at?: string;
          granted_by?: string;
        };
      };
    };
  };
}
