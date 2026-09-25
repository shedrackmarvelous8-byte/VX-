-- ==============================================================================
-- VX DATABASE SCHEMA MIGRATION: EMAIL VERIFICATION & BREVO INTEGRATION
-- Migration Version: 20260923000001_email_verification.sql
-- Description: Adds email_verified flag to profiles and creates auth_verification_codes table
-- ==============================================================================

-- 1. Add email_verified column to profiles if not exists
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

-- 2. Create auth_verification_codes table
CREATE TABLE IF NOT EXISTS public.auth_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  last_resend_at TIMESTAMPTZ,
  resend_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_user_verification UNIQUE (user_id)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_verification_user_id ON public.auth_verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_expires_at ON public.auth_verification_codes(expires_at);

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE public.auth_verification_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own verification code record"
  ON public.auth_verification_codes FOR SELECT
  USING (auth.uid() = user_id);
