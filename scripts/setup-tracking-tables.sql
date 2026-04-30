-- ============================================
-- DRAGON TRACKING SYSTEM - DATABASE SETUP
-- ============================================
-- Execute este script no Supabase SQL Editor para criar as tabelas de tracking

-- 1. TABELA: dragon_tracking_users
-- Armazena dados de usuarios com UTMs (primeira origem)
CREATE TABLE IF NOT EXISTS dragon_tracking_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  telegram_id TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: um usuario por bot
  CONSTRAINT dragon_tracking_users_unique UNIQUE (bot_id, telegram_id)
);

-- Indices para performance
CREATE INDEX IF NOT EXISTS idx_tracking_users_bot ON dragon_tracking_users(bot_id);
CREATE INDEX IF NOT EXISTS idx_tracking_users_telegram ON dragon_tracking_users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_tracking_users_campaign ON dragon_tracking_users(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_tracking_users_source ON dragon_tracking_users(utm_source);

-- 2. TABELA: dragon_tracking_events
-- Armazena eventos do funil (Lead, ViewContent, InitiateCheckout, Purchase)
CREATE TABLE IF NOT EXISTS dragon_tracking_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  telegram_id TEXT NOT NULL,
  flow_id UUID REFERENCES flows(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  value NUMERIC,
  event_id TEXT NOT NULL UNIQUE, -- Para deduplicacao
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para performance e relatorios
CREATE INDEX IF NOT EXISTS idx_tracking_events_bot ON dragon_tracking_events(bot_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_telegram ON dragon_tracking_events(telegram_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_event ON dragon_tracking_events(event_name);
CREATE INDEX IF NOT EXISTS idx_tracking_events_flow ON dragon_tracking_events(flow_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_created ON dragon_tracking_events(created_at);

-- 3. TABELA: tracking_profiles
-- Perfis de configuracao de tracking (Meta Pixel, UTMify, etc)
CREATE TABLE IF NOT EXISTS tracking_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pixel_id TEXT,
  access_token TEXT,
  utmify_token TEXT,
  events TEXT[] DEFAULT ARRAY['Lead', 'ViewContent', 'InitiateCheckout', 'Purchase'],
  linked_flows UUID[] DEFAULT ARRAY[]::UUID[],
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para performance
CREATE INDEX IF NOT EXISTS idx_tracking_profiles_user ON tracking_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_tracking_profiles_bot ON tracking_profiles(bot_id);
CREATE INDEX IF NOT EXISTS idx_tracking_profiles_active ON tracking_profiles(active);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Habilitar RLS
ALTER TABLE dragon_tracking_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE dragon_tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_profiles ENABLE ROW LEVEL SECURITY;

-- Politicas para tracking_profiles (usuarios so veem seus proprios perfis)
CREATE POLICY "Users can view own profiles" ON tracking_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profiles" ON tracking_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profiles" ON tracking_profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own profiles" ON tracking_profiles
  FOR DELETE USING (auth.uid() = user_id);

-- Politicas para tracking_users e events (acesso via service_role)
-- Estas tabelas sao escritas pelo backend, nao pelo frontend
CREATE POLICY "Service role full access to tracking_users" ON dragon_tracking_users
  FOR ALL USING (true);

CREATE POLICY "Service role full access to tracking_events" ON dragon_tracking_events
  FOR ALL USING (true);

-- ============================================
-- COMENTARIOS PARA DOCUMENTACAO
-- ============================================

COMMENT ON TABLE dragon_tracking_users IS 'Usuarios com UTMs capturadas na entrada do bot. UTMs da primeira visita sao preservadas.';
COMMENT ON TABLE dragon_tracking_events IS 'Eventos do funil: Lead, ViewContent, InitiateCheckout, Purchase. event_id usado para deduplicacao.';
COMMENT ON TABLE tracking_profiles IS 'Perfis de configuracao de tracking (Meta Pixel, UTMify). Vinculados a fluxos ou bots.';

COMMENT ON COLUMN dragon_tracking_users.utm_source IS 'Fonte do trafego (ex: facebook, google, instagram)';
COMMENT ON COLUMN dragon_tracking_users.utm_medium IS 'Tipo de midia (ex: cpc, email, social)';
COMMENT ON COLUMN dragon_tracking_users.utm_campaign IS 'Nome da campanha';
COMMENT ON COLUMN dragon_tracking_events.event_id IS 'ID unico do evento para deduplicacao no Meta/UTMify';

-- ============================================
-- FIM DO SETUP
-- ============================================
