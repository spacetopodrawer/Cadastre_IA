/*
  # Cadastre_IA - Initial Database Schema
  
  ## Overview
  This migration creates the foundational database structure for the Cadastre_IA application,
  a collaborative drawing/paint application with role-based access control.
  
  ## Tables Created
  
  ### 1. profiles
  Extends Supabase auth.users with additional user information:
  - `id` (uuid, FK to auth.users) - User identifier
  - `full_name` (text) - User's display name
  - `role` (text) - User role: 'SUPER_ADMIN', 'ADMIN', or 'USER'
  - `created_at` (timestamptz) - Account creation timestamp
  - `updated_at` (timestamptz) - Last profile update
  
  ### 2. files
  Stores metadata and content for user drawings:
  - `id` (uuid) - Unique file identifier
  - `name` (text) - Display name of the file
  - `description` (text) - Optional file description
  - `content` (jsonb) - Canvas data in Fabric.js format
  - `thumbnail` (text) - Data URL of preview image
  - `owner_id` (uuid, FK to profiles) - File creator
  - `is_shared` (boolean) - Whether file is shared with others
  - `created_at` (timestamptz) - File creation time
  - `updated_at` (timestamptz) - Last modification time
  
  ### 3. file_versions
  Version history for drawings:
  - `id` (uuid) - Version identifier
  - `file_id` (uuid, FK to files) - Parent file
  - `version_number` (integer) - Sequential version number
  - `content` (jsonb) - Canvas data snapshot
  - `modified_by` (uuid, FK to profiles) - User who made changes
  - `change_log` (text) - Optional description of changes
  - `created_at` (timestamptz) - Version creation time
  
  ### 4. file_permissions
  Sharing and access control:
  - `id` (uuid) - Permission record identifier
  - `file_id` (uuid, FK to files) - File being shared
  - `user_id` (uuid, FK to profiles) - User granted access
  - `permission_level` (text) - 'READ', 'WRITE', or 'ADMIN'
  - `granted_at` (timestamptz) - When access was granted
  - `granted_by` (uuid, FK to profiles) - Who granted access
  
  ## Security (RLS Policies)
  
  ### Profiles Table
  - Users can read their own profile
  - Users can update their own profile (except role)
  - Admins can read all profiles
  - Super admins can update any profile
  
  ### Files Table
  - Users can create files (they become owner)
  - Users can read their own files
  - Users can read files shared with them
  - Owners can update/delete their files
  - Admins can read all files
  
  ### File Versions Table
  - Users can create versions for files they own or have write access to
  - Users can read version history of accessible files
  
  ### File Permissions Table
  - File owners can grant/revoke permissions
  - Users can see permissions granted to them
  - Admins can see all permissions
  
  ## Important Notes
  - All tables have RLS enabled for security
  - Default role for new users is 'USER'
  - File content stored as JSONB for efficient querying
  - Cascading deletes ensure data integrity
*/

-- Create profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'USER' CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'USER')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create files table
CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  content jsonb NOT NULL DEFAULT '{}',
  thumbnail text,
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_shared boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create file_versions table
CREATE TABLE IF NOT EXISTS file_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  content jsonb NOT NULL,
  modified_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  change_log text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(file_id, version_number)
);

-- Create file_permissions table
CREATE TABLE IF NOT EXISTS file_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  permission_level text NOT NULL CHECK (permission_level IN ('READ', 'WRITE', 'ADMIN')),
  granted_at timestamptz DEFAULT now(),
  granted_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(file_id, user_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_files_owner_id ON files(owner_id);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_versions_file_id ON file_versions(file_id);
CREATE INDEX IF NOT EXISTS idx_file_permissions_file_id ON file_permissions(file_id);
CREATE INDEX IF NOT EXISTS idx_file_permissions_user_id ON file_permissions(user_id);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_permissions ENABLE ROW LEVEL SECURITY;

-- Profiles RLS Policies
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id AND
    role = (SELECT role FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Super admins can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'SUPER_ADMIN'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'SUPER_ADMIN'
    )
  );

-- Files RLS Policies
CREATE POLICY "Users can create files"
  ON files FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can read own files"
  ON files FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can read shared files"
  ON files FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM file_permissions
      WHERE file_permissions.file_id = files.id
      AND file_permissions.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can read all files"
  ON files FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

CREATE POLICY "Owners can update files"
  ON files FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can delete files"
  ON files FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

-- File Versions RLS Policies
CREATE POLICY "Users can create versions for owned files"
  ON file_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM files
      WHERE files.id = file_versions.file_id
      AND files.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can create versions for files with write access"
  ON file_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM file_permissions
      WHERE file_permissions.file_id = file_versions.file_id
      AND file_permissions.user_id = auth.uid()
      AND file_permissions.permission_level IN ('WRITE', 'ADMIN')
    )
  );

CREATE POLICY "Users can read versions of accessible files"
  ON file_versions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM files
      WHERE files.id = file_versions.file_id
      AND (
        files.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM file_permissions
          WHERE file_permissions.file_id = files.id
          AND file_permissions.user_id = auth.uid()
        )
      )
    )
  );

-- File Permissions RLS Policies
CREATE POLICY "Owners can grant permissions"
  ON file_permissions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM files
      WHERE files.id = file_permissions.file_id
      AND files.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can revoke permissions"
  ON file_permissions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM files
      WHERE files.id = file_permissions.file_id
      AND files.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can read permissions granted to them"
  ON file_permissions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all permissions"
  ON file_permissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    'USER'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile automatically
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER set_updated_at_files
  BEFORE UPDATE ON files
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();