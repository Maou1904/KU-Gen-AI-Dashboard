-- Minimal source-compatible schema for local Dify demo data.
-- This is intentionally limited to the columns consumed by sync-service.js.

CREATE TABLE IF NOT EXISTS app_model_configs (
    id UUID PRIMARY KEY,
    provider TEXT,
    model_id TEXT
);

CREATE TABLE IF NOT EXISTS apps (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    mode TEXT,
    status TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    app_model_config_id UUID REFERENCES app_model_configs(id)
);

CREATE INDEX IF NOT EXISTS idx_dify_apps_updated_at ON apps(updated_at);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY,
    app_id UUID REFERENCES apps(id),
    conversation_id TEXT,
    model_provider TEXT,
    model_id TEXT,
    message_tokens BIGINT,
    answer_tokens BIGINT,
    total_price NUMERIC(20, 8),
    currency VARCHAR(10),
    provider_response_latency NUMERIC(20, 6),
    workflow_run_id UUID,
    status VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dify_messages_updated_id ON messages(updated_at, id);
CREATE INDEX IF NOT EXISTS idx_dify_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_dify_messages_workflow_run ON messages(workflow_run_id);

CREATE TABLE IF NOT EXISTS workflow_node_executions (
    id UUID PRIMARY KEY,
    app_id UUID REFERENCES apps(id),
    workflow_run_id UUID,
    node_id TEXT,
    node_type VARCHAR(80),
    status VARCHAR(50),
    elapsed_time NUMERIC(20, 6),
    process_data JSONB,
    execution_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dify_workflow_created_id ON workflow_node_executions(created_at, id);
CREATE INDEX IF NOT EXISTS idx_dify_workflow_run ON workflow_node_executions(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_dify_workflow_node_type ON workflow_node_executions(node_type);
