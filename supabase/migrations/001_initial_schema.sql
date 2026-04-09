-- ============================================================
-- ProFix Marketplace — Full Database Schema
-- Migration: 001_initial_schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('owner', 'worker', 'admin');
CREATE TYPE kyc_status_type AS ENUM ('none', 'pending', 'approved', 'rejected');
CREATE TYPE job_status AS ENUM ('open', 'in_progress', 'completed', 'cancelled', 'disputed');
CREATE TYPE application_status AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn');
CREATE TYPE contract_status AS ENUM ('draft', 'active', 'completed', 'cancelled', 'disputed');
CREATE TYPE payment_mode AS ENUM ('milestone', 'full');
CREATE TYPE milestone_status AS ENUM (
  'pending', 'funded', 'in_progress', 'submitted',
  'approved', 'released', 'disputed', 'refunded'
);
CREATE TYPE transaction_type AS ENUM ('funding', 'release', 'refund', 'fee');
CREATE TYPE transaction_status AS ENUM ('pending', 'success', 'failed', 'abandoned');
CREATE TYPE ledger_entry_type AS ENUM ('deposit', 'release', 'refund', 'fee');
CREATE TYPE dispute_status AS ENUM (
  'open', 'under_review', 'resolved_release', 'resolved_refund', 'closed'
);
CREATE TYPE message_type AS ENUM ('text', 'system', 'contract_proposal', 'file');
CREATE TYPE notification_type AS ENUM (
  'new_message', 'milestone_funded', 'milestone_completed',
  'payment_released', 'dispute_created', 'contract_created',
  'application_accepted', 'application_rejected'
);

-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE public.users (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             TEXT UNIQUE,
  phone             TEXT UNIQUE,
  full_name         TEXT NOT NULL DEFAULT '',
  avatar_url        TEXT,
  bio               TEXT,
  role              user_role NOT NULL DEFAULT 'worker',
  email_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  kyc_level         INTEGER NOT NULL DEFAULT 0 CHECK (kyc_level BETWEEN 0 AND 3),
  kyc_status        kyc_status_type NOT NULL DEFAULT 'none',
  skills            TEXT[] DEFAULT '{}',
  location          TEXT,
  rating            DECIMAL(3,2) DEFAULT 0.00,
  total_jobs        INTEGER DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  is_banned         BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- JOBS
-- ============================================================

CREATE TABLE public.jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description   TEXT NOT NULL CHECK (char_length(description) >= 20),
  category      TEXT NOT NULL,
  sub_category  TEXT,
  budget_min    DECIMAL(12,2) CHECK (budget_min >= 0),
  budget_max    DECIMAL(12,2) CHECK (budget_max >= 0),
  location      TEXT,
  is_remote     BOOLEAN DEFAULT FALSE,
  skills_needed TEXT[] DEFAULT '{}',
  status        job_status NOT NULL DEFAULT 'open',
  views         INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT budget_range_valid CHECK (budget_max IS NULL OR budget_max >= budget_min)
);

-- ============================================================
-- APPLICATIONS
-- ============================================================

CREATE TABLE public.applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  worker_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  cover_letter    TEXT CHECK (char_length(cover_letter) <= 2000),
  proposed_price  DECIMAL(12,2) CHECK (proposed_price > 0),
  proposed_days   INTEGER CHECK (proposed_days > 0),
  status          application_status NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, worker_id)
);

-- ============================================================
-- CONTRACTS
-- ============================================================

CREATE TABLE public.contracts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES public.jobs(id),
  owner_id        UUID NOT NULL REFERENCES public.users(id),
  worker_id       UUID NOT NULL REFERENCES public.users(id),
  application_id  UUID REFERENCES public.applications(id),
  payment_mode    payment_mode NOT NULL,
  total_price     DECIMAL(12,2) NOT NULL CHECK (total_price > 0),
  platform_fee    DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_amount      DECIMAL(12,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'NGN',
  status          contract_status NOT NULL DEFAULT 'draft',
  version         INTEGER NOT NULL DEFAULT 1,
  terms           TEXT,
  start_date      DATE,
  end_date        DATE,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT different_parties CHECK (owner_id != worker_id)
);

-- ============================================================
-- CONTRACT VERSIONS
-- ============================================================

CREATE TABLE public.contract_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  UUID NOT NULL REFERENCES public.contracts(id),
  version      INTEGER NOT NULL,
  snapshot     JSONB NOT NULL,
  changed_by   UUID REFERENCES public.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MILESTONES
-- ============================================================

CREATE TABLE public.milestones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id   UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  amount        DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  due_date      DATE,
  order_index   INTEGER NOT NULL DEFAULT 0,
  status        milestone_status NOT NULL DEFAULT 'pending',
  funded_at     TIMESTAMPTZ,
  submitted_at  TIMESTAMPTZ,
  approved_at   TIMESTAMPTZ,
  released_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ESCROW WALLETS
-- ============================================================

CREATE TABLE public.escrow_wallets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     UUID UNIQUE NOT NULL REFERENCES public.contracts(id),
  balance         DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  locked_balance  DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (locked_balance >= 0),
  released_total  DECIMAL(12,2) NOT NULL DEFAULT 0,
  refunded_total  DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'NGN',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ESCROW LEDGER
-- ============================================================

CREATE TABLE public.escrow_ledger (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id        UUID NOT NULL REFERENCES public.escrow_wallets(id),
  contract_id      UUID NOT NULL REFERENCES public.contracts(id),
  milestone_id     UUID REFERENCES public.milestones(id),
  entry_type       ledger_entry_type NOT NULL,
  amount           DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  balance_before   DECIMAL(12,2) NOT NULL,
  balance_after    DECIMAL(12,2) NOT NULL,
  reference        TEXT UNIQUE NOT NULL,
  paystack_ref     TEXT,
  description      TEXT,
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TRANSACTIONS
-- ============================================================

CREATE TABLE public.transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(id),
  contract_id         UUID REFERENCES public.contracts(id),
  milestone_id        UUID REFERENCES public.milestones(id),
  paystack_reference  TEXT UNIQUE,
  idempotency_key     TEXT UNIQUE NOT NULL,
  amount              DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  fee                 DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'NGN',
  type                transaction_type NOT NULL,
  status              transaction_status NOT NULL DEFAULT 'pending',
  gateway_response    TEXT,
  channel             TEXT,
  ip_address          TEXT,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CHAT ROOMS
-- ============================================================

CREATE TABLE public.chat_rooms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID UNIQUE NOT NULL REFERENCES public.jobs(id),
  contract_id  UUID REFERENCES public.contracts(id),
  owner_id     UUID NOT NULL REFERENCES public.users(id),
  worker_id    UUID NOT NULL REFERENCES public.users(id),
  is_locked    BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MESSAGES
-- ============================================================

CREATE TABLE public.messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_id     UUID NOT NULL REFERENCES public.users(id),
  content       TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
  message_type  message_type NOT NULL DEFAULT 'text',
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted    BOOLEAN NOT NULL DEFAULT FALSE,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DISPUTES
-- ============================================================

CREATE TABLE public.disputes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     UUID NOT NULL REFERENCES public.contracts(id),
  milestone_id    UUID REFERENCES public.milestones(id),
  raised_by       UUID NOT NULL REFERENCES public.users(id),
  reason          TEXT NOT NULL CHECK (char_length(reason) >= 20),
  evidence_urls   TEXT[] DEFAULT '{}',
  status          dispute_status NOT NULL DEFAULT 'open',
  resolution_note TEXT,
  resolved_by     UUID REFERENCES public.users(id),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type        notification_type NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  data        JSONB DEFAULT '{}',
  action_url  TEXT,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOGS
-- ============================================================

CREATE TABLE public.audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES public.users(id),
  action       TEXT NOT NULL,
  table_name   TEXT,
  record_id    UUID,
  old_data     JSONB,
  new_data     JSONB,
  ip_address   INET,
  user_agent   TEXT,
  edge_fn_name TEXT,
  success      BOOLEAN DEFAULT TRUE,
  error_msg    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- OTP RATE LIMITING
-- ============================================================

CREATE TABLE public.otp_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier   TEXT NOT NULL,
  ip_address   INET,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_phone ON public.users(phone);
CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_jobs_owner ON public.jobs(owner_id);
CREATE INDEX idx_jobs_status ON public.jobs(status);
CREATE INDEX idx_jobs_category ON public.jobs(category);
CREATE INDEX idx_jobs_created ON public.jobs(created_at DESC);
CREATE INDEX idx_applications_job ON public.applications(job_id);
CREATE INDEX idx_applications_worker ON public.applications(worker_id);
CREATE INDEX idx_contracts_owner ON public.contracts(owner_id);
CREATE INDEX idx_contracts_worker ON public.contracts(worker_id);
CREATE INDEX idx_contracts_status ON public.contracts(status);
CREATE INDEX idx_milestones_contract ON public.milestones(contract_id);
CREATE INDEX idx_milestones_status ON public.milestones(status);
CREATE INDEX idx_ledger_wallet ON public.escrow_ledger(wallet_id);
CREATE INDEX idx_ledger_contract ON public.escrow_ledger(contract_id);
CREATE INDEX idx_transactions_user ON public.transactions(user_id);
CREATE INDEX idx_transactions_contract ON public.transactions(contract_id);
CREATE INDEX idx_transactions_paystack ON public.transactions(paystack_reference);
CREATE INDEX idx_transactions_idempotency ON public.transactions(idempotency_key);
CREATE INDEX idx_messages_room ON public.messages(room_id);
CREATE INDEX idx_messages_created ON public.messages(created_at DESC);
CREATE INDEX idx_messages_unread ON public.messages(room_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_audit_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_created ON public.audit_logs(created_at DESC);
CREATE INDEX idx_otp_identifier ON public.otp_requests(identifier, requested_at DESC);

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_milestones_updated_at
  BEFORE UPDATE ON public.milestones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_escrow_wallets_updated_at
  BEFORE UPDATE ON public.escrow_wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_disputes_updated_at
  BEFORE UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TRIGGER — Create user profile on signup
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'worker')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TRIGGER — Sync email verified
-- ============================================================

CREATE OR REPLACE FUNCTION sync_email_verified()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    UPDATE public.users SET email_verified = TRUE WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_email_verified
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_email_verified();

-- ============================================================
-- TRIGGER — Contract version snapshot
-- ============================================================

CREATE OR REPLACE FUNCTION snapshot_contract_version()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.total_price != NEW.total_price OR
    OLD.payment_mode != NEW.payment_mode OR
    OLD.status != NEW.status
  ) THEN
    INSERT INTO public.contract_versions (contract_id, version, snapshot)
    VALUES (OLD.id, OLD.version, row_to_json(OLD)::JSONB);
    NEW.version = OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contract_versioning
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION snapshot_contract_version();

-- ============================================================
-- TRIGGER — Auto create escrow wallet
-- ============================================================

CREATE OR REPLACE FUNCTION create_escrow_wallet_on_contract()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status = 'draft' THEN
    INSERT INTO public.escrow_wallets (contract_id)
    VALUES (NEW.id)
    ON CONFLICT (contract_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_create_escrow_wallet
  AFTER UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION create_escrow_wallet_on_contract();

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION check_otp_rate_limit(p_identifier TEXT, p_ip INET)
RETURNS BOOLEAN AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM public.otp_requests
  WHERE identifier = p_identifier
    AND requested_at > NOW() - INTERVAL '1 hour';
  IF recent_count >= 3 THEN
    RETURN FALSE;
  END IF;
  INSERT INTO public.otp_requests (identifier, ip_address)
  VALUES (p_identifier, p_ip);
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION calculate_platform_fee(amount DECIMAL)
RETURNS DECIMAL AS $$
BEGIN
  RETURN ROUND(amount * 0.025, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

CREATE POLICY "users_select_public" ON public.users
  FOR SELECT USING (is_active = TRUE AND is_banned = FALSE);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "jobs_select_open" ON public.jobs
  FOR SELECT USING (status = 'open' OR owner_id = auth.uid());

CREATE POLICY "jobs_insert_owner" ON public.jobs
  FOR INSERT WITH CHECK (
    auth.uid() = owner_id AND
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "jobs_update_owner" ON public.jobs
  FOR UPDATE USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "applications_select" ON public.applications
  FOR SELECT USING (
    auth.uid() = worker_id OR
    EXISTS (SELECT 1 FROM public.jobs WHERE id = job_id AND owner_id = auth.uid())
  );

CREATE POLICY "applications_insert_worker" ON public.applications
  FOR INSERT WITH CHECK (
    auth.uid() = worker_id AND
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'worker')
  );

CREATE POLICY "applications_update" ON public.applications
  FOR UPDATE USING (
    auth.uid() = worker_id OR
    EXISTS (SELECT 1 FROM public.jobs WHERE id = job_id AND owner_id = auth.uid())
  );

CREATE POLICY "contracts_select_parties" ON public.contracts
  FOR SELECT USING (auth.uid() = owner_id OR auth.uid() = worker_id);

CREATE POLICY "contracts_insert_service" ON public.contracts
  FOR INSERT WITH CHECK (FALSE);

CREATE POLICY "contract_versions_select" ON public.contract_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.contracts
      WHERE id = contract_id AND (owner_id = auth.uid() OR worker_id = auth.uid())
    )
  );

CREATE POLICY "milestones_select_parties" ON public.milestones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.contracts
      WHERE id = contract_id AND (owner_id = auth.uid() OR worker_id = auth.uid())
    )
  );

CREATE POLICY "wallets_select_parties" ON public.escrow_wallets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.contracts
      WHERE id = contract_id AND (owner_id = auth.uid() OR worker_id = auth.uid())
    )
  );

CREATE POLICY "ledger_select_parties" ON public.escrow_ledger
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.contracts
      WHERE id = contract_id AND (owner_id = auth.uid() OR worker_id = auth.uid())
    )
  );

CREATE POLICY "transactions_select_own" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "rooms_select_participants" ON public.chat_rooms
  FOR SELECT USING (auth.uid() = owner_id OR auth.uid() = worker_id);

CREATE POLICY "messages_select_participants" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_rooms
      WHERE id = room_id AND (owner_id = auth.uid() OR worker_id = auth.uid())
    )
  );

CREATE POLICY "messages_insert_participants" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.chat_rooms
      WHERE id = room_id AND (owner_id = auth.uid() OR worker_id = auth.uid())
        AND is_locked = FALSE
    )
  );

CREATE POLICY "messages_update_read" ON public.messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.chat_rooms
      WHERE id = room_id AND (owner_id = auth.uid() OR worker_id = auth.uid())
    )
  );

CREATE POLICY "disputes_select_parties" ON public.disputes
  FOR SELECT USING (
    auth.uid() = raised_by OR
    EXISTS (
      SELECT 1 FROM public.contracts
      WHERE id = contract_id AND (owner_id = auth.uid() OR worker_id = auth.uid())
    )
  );

CREATE POLICY "notifications_own" ON public.notifications
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "audit_logs_admin_only" ON public.audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "otp_no_user_access" ON public.otp_requests
  FOR ALL USING (FALSE);

-- ============================================================
-- REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contracts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.milestones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.disputes;