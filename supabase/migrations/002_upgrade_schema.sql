-- ============================================================
-- ProFix Upgrade Migration 002
-- Safe additions only — no breaking changes
-- ============================================================

-- ============================================================
-- 1. COMMISSION TIERS FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_commission(amount DECIMAL)
RETURNS DECIMAL AS $$
BEGIN
  IF amount <= 100000 THEN
    RETURN FLOOR(amount * 0.05);
  ELSIF amount <= 500000 THEN
    RETURN FLOOR(amount * 0.035);
  ELSIF amount <= 1000000 THEN
    RETURN FLOOR(amount * 0.025);
  ELSE
    RETURN FLOOR(amount * 0.01);
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- 2. ADD COMMISSION FIELDS TO TRANSACTIONS
-- ============================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS gross_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_commission_reversed BOOLEAN DEFAULT FALSE;

-- ============================================================
-- 3. WALLET SYSTEM
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wallets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  available_balance DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  pending_balance   DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (pending_balance >= 0),
  locked_balance    DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (locked_balance >= 0),
  total_earned      DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_withdrawn   DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'NGN',
  is_frozen         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id       UUID NOT NULL REFERENCES public.wallets(id),
  user_id         UUID NOT NULL REFERENCES public.users(id),
  type            TEXT NOT NULL CHECK (type IN (
                    'escrow_credit', 'commission_debit', 'withdrawal',
                    'refund_credit', 'platform_fee', 'reversal'
                  )),
  amount          DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  balance_before  DECIMAL(12,2) NOT NULL,
  balance_after   DECIMAL(12,2) NOT NULL,
  reference       TEXT UNIQUE NOT NULL,
  description     TEXT,
  contract_id     UUID REFERENCES public.contracts(id),
  milestone_id    UUID REFERENCES public.milestones(id),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. WITHDRAWAL REQUESTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.users(id),
  wallet_id        UUID NOT NULL REFERENCES public.wallets(id),
  amount           DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  bank_code        TEXT NOT NULL,
  account_number   TEXT NOT NULL,
  account_name     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  paystack_ref     TEXT,
  failure_reason   TEXT,
  idempotency_key  TEXT UNIQUE NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. KYC TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kyc_verifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL DEFAULT 'manual',
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'verified', 'rejected', 'expired')),
  level           INTEGER NOT NULL DEFAULT 0,
  full_name       TEXT,
  date_of_birth   DATE,
  id_type         TEXT CHECK (id_type IN ('nin', 'bvn', 'passport', 'drivers_license')),
  id_number       TEXT,
  selfie_url      TEXT,
  id_front_url    TEXT,
  id_back_url     TEXT,
  rejection_reason TEXT,
  verified_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. PRICE AGREEMENT SYSTEM
-- ============================================================

CREATE TABLE IF NOT EXISTS public.price_agreements (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id               UUID NOT NULL REFERENCES public.jobs(id),
  owner_id             UUID NOT NULL REFERENCES public.users(id),
  worker_id            UUID NOT NULL REFERENCES public.users(id),
  agreed_price         DECIMAL(12,2) NOT NULL CHECK (agreed_price > 0),
  currency             TEXT NOT NULL DEFAULT 'NGN',
  agreement_status     TEXT NOT NULL DEFAULT 'pending'
                       CHECK (agreement_status IN ('pending', 'locked', 'cancelled')),
  agreement_timestamp  TIMESTAMPTZ,
  locked_at            TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, owner_id, worker_id)
);

-- ============================================================
-- 7. ANTI-FRAUD FLAGS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fraud_flags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id),
  flag_type       TEXT NOT NULL CHECK (flag_type IN (
                    'suspicious_transaction', 'rapid_withdrawal',
                    'repeated_disputes', 'abnormal_activity',
                    'kyc_mismatch', 'multiple_accounts'
                  )),
  severity        TEXT NOT NULL DEFAULT 'low'
                  CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description     TEXT NOT NULL,
  is_resolved     BOOLEAN DEFAULT FALSE,
  resolved_by     UUID REFERENCES public.users(id),
  resolved_at     TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. USER REPORTS (Play Store compliance)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID NOT NULL REFERENCES public.users(id),
  reported_id  UUID NOT NULL REFERENCES public.users(id),
  reason       TEXT NOT NULL CHECK (reason IN (
                 'spam', 'fraud', 'harassment', 'fake_profile',
                 'inappropriate_content', 'other'
               )),
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  reviewed_by  UUID REFERENCES public.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reporter_id, reported_id)
);

-- ============================================================
-- 9. ACCOUNT DELETION REQUESTS (Play Store compliance)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id),
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

-- ============================================================
-- 10. ADD MISSING INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_jobs_status_created
  ON public.jobs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_user_status
  ON public.transactions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_messages_room_created
  ON public.messages(room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallets_user
  ON public.wallets(user_id);

CREATE INDEX IF NOT EXISTS idx_wallet_txns_wallet
  ON public.wallet_transactions(wallet_id);

CREATE INDEX IF NOT EXISTS idx_withdrawal_user
  ON public.withdrawal_requests(user_id, status);

CREATE INDEX IF NOT EXISTS idx_kyc_user
  ON public.kyc_verifications(user_id, status);

CREATE INDEX IF NOT EXISTS idx_fraud_flags_user
  ON public.fraud_flags(user_id, is_resolved);

-- ============================================================
-- 11. UPDATED_AT TRIGGERS FOR NEW TABLES
-- ============================================================

CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_withdrawal_updated_at
  BEFORE UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_kyc_updated_at
  BEFORE UPDATE ON public.kyc_verifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_price_agreement_updated_at
  BEFORE UPDATE ON public.price_agreements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 12. AUTO CREATE WALLET FOR NEW USERS
-- ============================================================

CREATE OR REPLACE FUNCTION create_wallet_for_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.wallets (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_create_wallet
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION create_wallet_for_user();

-- ============================================================
-- 13. RLS FOR NEW TABLES
-- ============================================================

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

-- Wallets: users see only their own
CREATE POLICY "wallets_own" ON public.wallets
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Wallet transactions: users see only their own
CREATE POLICY "wallet_txns_own" ON public.wallet_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- Withdrawals: users see only their own
CREATE POLICY "withdrawals_own" ON public.withdrawal_requests
  FOR SELECT USING (auth.uid() = user_id);

-- KYC: users see only their own
CREATE POLICY "kyc_own" ON public.kyc_verifications
  FOR SELECT USING (auth.uid() = user_id);

-- Price agreements: only parties involved
CREATE POLICY "price_agreements_parties" ON public.price_agreements
  FOR ALL USING (auth.uid() = owner_id OR auth.uid() = worker_id);

-- Fraud flags: admin only
CREATE POLICY "fraud_flags_admin" ON public.fraud_flags
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- User reports: reporters see their own
CREATE POLICY "user_reports_own" ON public.user_reports
  FOR SELECT USING (auth.uid() = reporter_id);

CREATE POLICY "user_reports_insert" ON public.user_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- Deletion requests: users see their own
CREATE POLICY "deletion_requests_own" ON public.deletion_requests
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 14. REALTIME FOR NEW TABLES
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.withdrawal_requests;