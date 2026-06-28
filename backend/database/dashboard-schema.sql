-- PostgreSQL starter schema for the KU GenAI Dashboard data mart.
-- The source databases remain read-only; only the middleware writes here.

CREATE TABLE IF NOT EXISTS etl_run (
    run_id BIGSERIAL PRIMARY KEY,
    source_name VARCHAR(50) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL CHECK (status IN ('running', 'success', 'failed', 'partial')),
    rows_read BIGINT NOT NULL DEFAULT 0,
    rows_inserted BIGINT NOT NULL DEFAULT 0,
    rows_updated BIGINT NOT NULL DEFAULT 0,
    rows_rejected BIGINT NOT NULL DEFAULT 0,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS etl_watermark (
    source_name VARCHAR(50) NOT NULL,
    source_table VARCHAR(100) NOT NULL,
    cursor_timestamp TIMESTAMPTZ,
    cursor_id TEXT,
    last_success_run_id BIGINT REFERENCES etl_run(run_id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (source_name, source_table)
);

CREATE TABLE IF NOT EXISTS etl_data_quality (
    quality_id BIGSERIAL PRIMARY KEY,
    run_id BIGINT REFERENCES etl_run(run_id),
    check_name VARCHAR(120) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
    affected_rows BIGINT NOT NULL DEFAULT 0,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dim_org_unit (
    org_unit_key BIGSERIAL PRIMARY KEY,
    parent_org_unit_key BIGINT REFERENCES dim_org_unit(org_unit_key),
    source_system VARCHAR(50) NOT NULL,
    source_code VARCHAR(150) NOT NULL,
    org_level VARCHAR(30) NOT NULL CHECK (org_level IN ('university', 'campus', 'faculty', 'department', 'unit')),
    name_th VARCHAR(255),
    name_en VARCHAR(255),
    valid_from TIMESTAMPTZ NOT NULL,
    valid_to TIMESTAMPTZ,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    row_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_system, source_code, valid_from)
);

CREATE INDEX IF NOT EXISTS idx_org_current
    ON dim_org_unit (source_system, source_code)
    WHERE is_current;

CREATE TABLE IF NOT EXISTS dim_user (
    user_key BIGSERIAL PRIMARY KEY,
    source_user_id TEXT NOT NULL UNIQUE,
    is_active BOOLEAN,
    member_type VARCHAR(100),
    first_seen_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    source_updated_at TIMESTAMPTZ,
    row_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_org_history (
    user_org_key BIGSERIAL PRIMARY KEY,
    user_key BIGINT NOT NULL REFERENCES dim_user(user_key),
    org_unit_key BIGINT NOT NULL REFERENCES dim_org_unit(org_unit_key),
    valid_from TIMESTAMPTZ NOT NULL,
    valid_to TIMESTAMPTZ,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    row_hash VARCHAR(64) NOT NULL,
    UNIQUE (user_key, org_unit_key, valid_from)
);

CREATE INDEX IF NOT EXISTS idx_user_org_current
    ON user_org_history (user_key)
    WHERE is_current;

CREATE TABLE IF NOT EXISTS dim_app (
    app_key BIGSERIAL PRIMARY KEY,
    kucs_app_id UUID UNIQUE,
    dify_app_id UUID UNIQUE,
    app_name VARCHAR(255) NOT NULL,
    category_name VARCHAR(255),
    sub_category_name VARCHAR(255),
    app_mode VARCHAR(80),
    app_source VARCHAR(80),
    configured_provider VARCHAR(150),
    configured_model VARCHAR(150),
    is_active BOOLEAN,
    mapping_status VARCHAR(30) NOT NULL DEFAULT 'unverified',
    source_updated_at TIMESTAMPTZ,
    row_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dim_model (
    model_key BIGSERIAL PRIMARY KEY,
    provider VARCHAR(150) NOT NULL,
    model_name VARCHAR(150) NOT NULL,
    normalized_name VARCHAR(150) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, model_name)
);

CREATE TABLE IF NOT EXISTS fact_usage_event (
    usage_event_key BIGSERIAL PRIMARY KEY,
    source_usage_id UUID NOT NULL UNIQUE,
    user_key BIGINT REFERENCES dim_user(user_key),
    app_key BIGINT REFERENCES dim_app(app_key),
    org_unit_key BIGINT REFERENCES dim_org_unit(org_unit_key),
    source_conversation_id TEXT,
    event_at TIMESTAMPTZ NOT NULL,
    input_tokens BIGINT,
    output_tokens BIGINT,
    total_tokens BIGINT NOT NULL DEFAULT 0,
    original_price NUMERIC(20, 8),
    original_currency VARCHAR(10),
    exchange_rate NUMERIC(20, 8),
    vat_rate NUMERIC(10, 6),
    cost_thb NUMERIC(20, 6),
    total_coins NUMERIC(20, 6),
    calculate_method VARCHAR(80),
    source_created_at TIMESTAMPTZ,
    source_updated_at TIMESTAMPTZ,
    source_row_hash VARCHAR(64) NOT NULL,
    quality_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_event_at ON fact_usage_event (event_at);
CREATE INDEX IF NOT EXISTS idx_usage_org_event ON fact_usage_event (org_unit_key, event_at);
CREATE INDEX IF NOT EXISTS idx_usage_app_event ON fact_usage_event (app_key, event_at);
CREATE INDEX IF NOT EXISTS idx_usage_user_event ON fact_usage_event (user_key, event_at);

CREATE TABLE IF NOT EXISTS fact_model_usage_event (
    model_usage_key BIGSERIAL PRIMARY KEY,
    usage_event_key BIGINT REFERENCES fact_usage_event(usage_event_key),
    app_key BIGINT REFERENCES dim_app(app_key),
    model_key BIGINT REFERENCES dim_model(model_key),
    source_table VARCHAR(80) NOT NULL,
    source_event_id UUID NOT NULL,
    source_run_id UUID,
    event_at TIMESTAMPTZ NOT NULL,
    node_type VARCHAR(80),
    status VARCHAR(50),
    total_tokens BIGINT NOT NULL DEFAULT 0,
    total_price NUMERIC(20, 8),
    currency VARCHAR(10),
    latency_seconds NUMERIC(20, 6),
    attribution_method VARCHAR(40) NOT NULL,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_table, source_event_id)
);

CREATE INDEX IF NOT EXISTS idx_model_usage_event_at ON fact_model_usage_event (event_at);
CREATE INDEX IF NOT EXISTS idx_model_usage_model_at ON fact_model_usage_event (model_key, event_at);

CREATE TABLE IF NOT EXISTS fact_note (
    note_key BIGSERIAL PRIMARY KEY,
    source_note_id BIGINT NOT NULL UNIQUE,
    user_key BIGINT REFERENCES dim_user(user_key),
    org_unit_key BIGINT REFERENCES dim_org_unit(org_unit_key),
    is_active BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL,
    source_updated_at TIMESTAMPTZ,
    source_row_hash VARCHAR(64) NOT NULL,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dim_tag (
    tag_key BIGSERIAL PRIMARY KEY,
    normalized_tag VARCHAR(255) NOT NULL UNIQUE,
    display_tag VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS bridge_note_tag (
    note_key BIGINT NOT NULL REFERENCES fact_note(note_key) ON DELETE CASCADE,
    tag_key BIGINT NOT NULL REFERENCES dim_tag(tag_key),
    PRIMARY KEY (note_key, tag_key)
);

CREATE TABLE IF NOT EXISTS fact_user_activity_daily (
    activity_date DATE NOT NULL,
    user_key BIGINT NOT NULL REFERENCES dim_user(user_key),
    app_key BIGINT NOT NULL REFERENCES dim_app(app_key),
    org_unit_key BIGINT REFERENCES dim_org_unit(org_unit_key),
    transaction_count BIGINT NOT NULL,
    total_tokens BIGINT NOT NULL,
    cost_thb NUMERIC(20, 6) NOT NULL,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (activity_date, user_key, app_key)
);

CREATE TABLE IF NOT EXISTS agg_usage_daily (
    usage_date DATE NOT NULL,
    org_unit_key BIGINT REFERENCES dim_org_unit(org_unit_key),
    app_key BIGINT REFERENCES dim_app(app_key),
    model_key BIGINT REFERENCES dim_model(model_key),
    transaction_count BIGINT NOT NULL,
    active_user_count BIGINT NOT NULL,
    input_tokens BIGINT NOT NULL,
    output_tokens BIGINT NOT NULL,
    total_tokens BIGINT NOT NULL,
    cost_thb NUMERIC(20, 6) NOT NULL,
    total_coins NUMERIC(20, 6) NOT NULL,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (usage_date, org_unit_key, app_key, model_key)
);

CREATE TABLE IF NOT EXISTS agg_usage_hourly (
    usage_date DATE NOT NULL,
    hour_bucket SMALLINT NOT NULL CHECK (hour_bucket BETWEEN 0 AND 23),
    org_unit_key BIGINT REFERENCES dim_org_unit(org_unit_key),
    app_key BIGINT REFERENCES dim_app(app_key),
    transaction_count BIGINT NOT NULL,
    active_user_count BIGINT NOT NULL,
    total_tokens BIGINT NOT NULL,
    cost_thb NUMERIC(20, 6) NOT NULL,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (usage_date, hour_bucket, org_unit_key, app_key)
);

CREATE TABLE IF NOT EXISTS agg_topic_daily (
    topic_date DATE NOT NULL,
    tag_key BIGINT NOT NULL REFERENCES dim_tag(tag_key),
    org_unit_key BIGINT REFERENCES dim_org_unit(org_unit_key),
    note_count BIGINT NOT NULL,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (topic_date, tag_key, org_unit_key)
);

