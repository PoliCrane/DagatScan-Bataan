-- ============================================================================
-- DATABASE MIGRATION: ADD ACCOUNT DEACTIVATION SUPPORT
-- Adds `active` column to users table for account deactivation feature
-- Date: June 2026
-- ============================================================================

-- Add active column to users table (default true for existing accounts)
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Create index for faster queries filtering active accounts
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);

-- Verify the migration
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'active';

-- Note: All existing user accounts will have active = true by default
-- Deactivated accounts (active = false) will be excluded from admin user lists
-- and will be unable to log in due to login verification
