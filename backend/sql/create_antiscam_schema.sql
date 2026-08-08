-- Fresh PostgreSQL schema for the FintechGuard anti-scam application.
-- Run with a database owner. This script never drops databases, schemas, or tables.
--
-- Example:
--   psql -U antiscam -d antiscam -f backend/sql/create_antiscam_schema.sql
--
-- The backend must use this search path after the script completes:
--   ALTER ROLE antiscam IN DATABASE antiscam SET search_path = antiscam, public;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SCHEMA IF NOT EXISTS antiscam;
SET search_path TO antiscam, public;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    hashed_password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user'
        CHECK (role IN ('user', 'admin')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    balance BIGINT NOT NULL DEFAULT 50000000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intelligence_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    source_type VARCHAR(50) NOT NULL,
    source_url TEXT,
    license_name VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS model_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_name VARCHAR(100) NOT NULL,
    version VARCHAR(100) NOT NULL,
    model_type VARCHAR(50) NOT NULL,
    provider VARCHAR(100),
    configuration JSONB,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    deployed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (model_name, version)
);

CREATE TABLE IF NOT EXISTS blacklist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(20) NOT NULL
        CHECK (entity_type IN ('account', 'phone', 'email', 'url')),
    entity_value VARCHAR(255) NOT NULL,
    bank VARCHAR(100),
    source VARCHAR(255) NOT NULL,
    risk_score NUMERIC(5,4) NOT NULL DEFAULT 0.9500
        CHECK (risk_score BETWEEN 0 AND 1),
    evidence JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scam_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pattern_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    keywords VARCHAR(120)[],
    risk_weight NUMERIC(5,4) NOT NULL DEFAULT 0.5000
        CHECK (risk_weight BETWEEN 0 AND 1),
    source_id UUID REFERENCES intelligence_sources(id) ON DELETE SET NULL,
    vector_document_id UUID,
    embedding_model VARCHAR(100),
    embedding_updated_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trusted_recipients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_name VARCHAR(255) NOT NULL,
    account_number VARCHAR(64) NOT NULL,
    bank_code VARCHAR(32),
    trusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, account_number, bank_code)
);

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payee_account VARCHAR(64) NOT NULL,
    payee_name VARCHAR(255) NOT NULL,
    bank_code VARCHAR(32),
    amount BIGINT NOT NULL,
    note TEXT,
    transaction_status VARCHAR(30) NOT NULL DEFAULT 'draft'
        CHECK (transaction_status IN (
            'draft', 'risk_checking', 'awaiting_decision', 'processing',
            'completed', 'failed', 'cancelled'
        )),
    environment VARCHAR(20) NOT NULL DEFAULT 'sandbox'
        CHECK (environment IN ('sandbox', 'production')),
    currency CHAR(3) NOT NULL DEFAULT 'VND',
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transaction_risk_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    risk_score NUMERIC(5,4) NOT NULL CHECK (risk_score BETWEEN 0 AND 1),
    risk_level VARCHAR(20) NOT NULL
        CHECK (risk_level IN ('safe', 'low', 'medium', 'high')),
    should_warn BOOLEAN NOT NULL DEFAULT FALSE,
    model_version VARCHAR(100),
    rules_version VARCHAR(100),
    blacklist_match_found BOOLEAN NOT NULL DEFAULT FALSE,
    explanation TEXT NOT NULL,
    raw_result JSONB,
    latency_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID NOT NULL
        REFERENCES transaction_risk_assessments(id) ON DELETE CASCADE,
    signal_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL
        CHECK (severity IN ('info', 'low', 'medium', 'high')),
    score NUMERIC(5,4),
    explanation TEXT NOT NULL,
    matched_blacklist_id UUID REFERENCES blacklist(id) ON DELETE SET NULL,
    matched_pattern_id UUID REFERENCES scam_patterns(id) ON DELETE SET NULL,
    evidence JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transaction_warnings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    assessment_id UUID NOT NULL REFERENCES transaction_risk_assessments(id),
    warning_level VARCHAR(20) NOT NULL
        CHECK (warning_level IN ('medium', 'high')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    transparency_reason TEXT NOT NULL,
    displayed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    countdown_seconds SMALLINT NOT NULL DEFAULT 30
        CHECK (countdown_seconds BETWEEN 0 AND 60),
    user_decision VARCHAR(20)
        CHECK (user_decision IN ('proceeded', 'cancelled')),
    verification_confirmed BOOLEAN,
    verification_method VARCHAR(50),
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intervention_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    warning_id UUID REFERENCES transaction_warnings(id) ON DELETE CASCADE,
    agent_run_id UUID,
    node_name VARCHAR(100),
    step_number INTEGER,
    agent_message TEXT,
    user_response TEXT,
    risk_factors JSONB,
    suggested_actions JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warning_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    warning_id UUID NOT NULL UNIQUE
        REFERENCES transaction_warnings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feedback_type VARCHAR(30) NOT NULL
        CHECK (feedback_type IN (
            'helpful', 'false_positive', 'confirmed_scam', 'not_helpful', 'unsure'
        )),
    comment TEXT,
    review_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (review_status IN ('pending', 'validated', 'rejected')),
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scam_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    report_type VARCHAR(50) NOT NULL
        CHECK (report_type IN ('false_positive', 'new_scam', 'bypass')),
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'reviewing', 'resolved', 'rejected')),
    admin_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    metadata_json JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type VARCHAR(50) NOT NULL
        CHECK (consent_type IN (
            'terms_of_service', 'privacy_policy', 'fraud_analysis', 'model_improvement'
        )),
    consent_version VARCHAR(30) NOT NULL,
    is_granted BOOLEAN NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    withdrawn_at TIMESTAMPTZ,
    ip_address INET,
    UNIQUE (user_id, consent_type, consent_version)
);

CREATE TABLE IF NOT EXISTS data_retention_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    data_category VARCHAR(50) NOT NULL UNIQUE,
    retention_days INTEGER NOT NULL CHECK (retention_days > 0),
    anonymize_after_days INTEGER,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_blacklist_entity_value ON blacklist(entity_value);
CREATE INDEX IF NOT EXISTS ix_blacklist_active_account_bank
    ON blacklist(entity_value, bank)
    WHERE entity_type = 'account' AND is_active = TRUE;
CREATE INDEX IF NOT EXISTS ix_scam_patterns_keywords ON scam_patterns USING GIN(keywords);
CREATE INDEX IF NOT EXISTS ix_trusted_recipients_user_id ON trusted_recipients(user_id);
CREATE INDEX IF NOT EXISTS ix_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS ix_transactions_payee_account ON transactions(payee_account);
CREATE INDEX IF NOT EXISTS ix_transactions_status ON transactions(transaction_status);
CREATE INDEX IF NOT EXISTS ix_assessments_transaction_id
    ON transaction_risk_assessments(transaction_id);
CREATE INDEX IF NOT EXISTS ix_risk_signals_assessment_id ON risk_signals(assessment_id);
CREATE INDEX IF NOT EXISTS ix_warnings_transaction_id ON transaction_warnings(transaction_id);
CREATE INDEX IF NOT EXISTS ix_warnings_assessment_id ON transaction_warnings(assessment_id);
CREATE INDEX IF NOT EXISTS ix_intervention_logs_transaction_id ON intervention_logs(transaction_id);
CREATE INDEX IF NOT EXISTS ix_warning_feedback_user_id ON warning_feedback(user_id);
CREATE INDEX IF NOT EXISTS ix_scam_reports_user_id ON scam_reports(user_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS ix_user_consents_user_id ON user_consents(user_id);

-- Verify the selected schema and table count.
SELECT current_schema();
SELECT COUNT(*) AS created_tables
FROM information_schema.tables
WHERE table_schema = 'antiscam' AND table_type = 'BASE TABLE';
