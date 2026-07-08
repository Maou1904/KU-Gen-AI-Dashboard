const express = require('express');
const { dashboardPool } = require('../config/database');
const {
    usageFilter,
    comparisonFilters,
    percentChange,
    usageSource,
    modelUsageSource,
} = require('./filter-utils');

const router = express.Router();
const modelUsageScopeSql = alias => `((
    ${alias}.source_table = 'workflow_node_executions'
    AND ${alias}.status = 'succeeded'
) OR (
    ${alias}.source_table = 'messages'
    AND ${alias}.source_run_id IS NULL
))`;
const modelFamilySql = alias => `CASE
    WHEN ${alias}.provider = 'unknown' OR ${alias}.model_name = 'unknown' THEN 'Unattributed'
    WHEN LOWER(${alias}.provider || ' ' || ${alias}.model_name) ~ 'openai|(^|[/ -])(gpt|chatgpt|o1|o3|o4)([/ :.-]|$)' THEN 'GPT'
    WHEN LOWER(${alias}.provider || ' ' || ${alias}.model_name) ~ 'gemini|google' THEN 'Gemini'
    WHEN LOWER(${alias}.provider || ' ' || ${alias}.model_name) ~ 'claude|anthropic' THEN 'Claude'
    WHEN LOWER(${alias}.provider || ' ' || ${alias}.model_name) ~ 'grok|x-ai' THEN 'Grok'
    WHEN LOWER(${alias}.provider || ' ' || ${alias}.model_name) ~ 'mistral' THEN 'Mistral'
    WHEN LOWER(${alias}.provider || ' ' || ${alias}.model_name) ~ 'deepseek' THEN 'DeepSeek'
    WHEN LOWER(${alias}.provider || ' ' || ${alias}.model_name) ~ 'nova|bedrock|amazon' THEN 'Amazon'
    ELSE 'Other'
END`;

router.get('/provider-consumption', async (req, res, next) => {
    try {
        const filter = usageFilter(req, 's');
        const { rows } = await dashboardPool.query(
            `WITH model_scope AS (
                SELECT f.*, u.campus, u.faculty, u.department
                FROM fact_model_usage_event f
                LEFT JOIN ${usageSource} u
                    ON u.usage_event_key = f.usage_event_key
             ), totals AS (
                SELECT
                    ${modelFamilySql('m')} AS family,
                    SUM(s.total_tokens)::bigint AS tokens,
                    COUNT(*)::bigint AS events
                FROM model_scope s
                JOIN dim_model m ON m.model_key = s.model_key
                WHERE ${modelUsageScopeSql('s')}
                  AND ${filter.sql}
                GROUP BY ${modelFamilySql('m')}
             )
             SELECT
                family,
                tokens,
                events,
                ROUND(tokens * 100.0 / NULLIF(SUM(tokens) OVER (), 0), 2) AS percentage
             FROM totals
             ORDER BY tokens DESC`,
            filter.params
        );
        res.json({ success: true, data: rows, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

router.get('/model-consumption', async (req, res, next) => {
    try {
        const family = req.query.family || null;
        const filter = usageFilter(req, 's');
        const { rows } = await dashboardPool.query(
            `WITH model_scope AS (
                SELECT f.*, u.campus, u.faculty, u.department
                FROM fact_model_usage_event f
                LEFT JOIN ${usageSource} u
                    ON u.usage_event_key = f.usage_event_key
             ), totals AS (
                SELECT
                    m.model_name,
                    m.provider,
                    SUM(s.total_tokens)::bigint AS tokens,
                    SUM(COALESCE(s.total_price, 0)) AS cost
                FROM model_scope s
                JOIN dim_model m ON m.model_key = s.model_key
                WHERE ($6::text IS NULL OR ${modelFamilySql('m')} = $6)
                  AND ${modelUsageScopeSql('s')}
                  AND ${filter.sql}
                GROUP BY m.model_key, m.model_name, m.provider
             )
             SELECT
                model_name AS "modelName",
                provider,
                tokens,
                cost,
                ROUND(tokens * 100.0 / NULLIF(SUM(tokens) OVER (), 0), 2) AS percentage
             FROM totals
             ORDER BY tokens DESC`,
            [...filter.params, family]
        );
        res.json({ success: true, data: rows, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

router.get('/hierarchy', async (req, res, next) => {
    try {
        const filter = usageFilter(req);
        const { rows } = await dashboardPool.query(
            `WITH usage_summary AS (
                SELECT
                    campus,
                    faculty,
                    department,
                    SUM(COALESCE(total_coins, 0)) AS coin_consumption
                FROM ${usageSource} u
                WHERE org_unit_key IS NOT NULL AND ${filter.sql}
                GROUP BY campus, faculty, department
             ), model_summary AS (
                SELECT
                    campus,
                    faculty,
                    department,
                    SUM(total_tokens)::bigint AS tokens
                FROM ${modelUsageSource} u
                WHERE usage_event_key IS NOT NULL AND ${filter.sql}
                GROUP BY campus, faculty, department
             )
             SELECT
                a.campus,
                a.faculty,
                a.department,
                COALESCE(m.tokens, 0)::bigint AS "tokensUsed",
                a.coin_consumption AS "coinConsumption"
             FROM usage_summary a
             LEFT JOIN model_summary m
               ON m.campus = a.campus
              AND m.faculty = a.faculty
              AND m.department = a.department
             ORDER BY "tokensUsed" DESC`,
            filter.params
        );
        const unmapped = await dashboardPool.query(
            `SELECT COUNT(*)::int AS count
             FROM ${usageSource} u
             WHERE org_unit_key IS NULL AND ${filter.sql}`,
            filter.params
        );
        res.json({
            success: true,
            data: rows,
            meta: { unmappedUsage: unmapped.rows[0].count },
            source: 'dashboard_test',
        });
    } catch (error) {
        next(error);
    }
});

router.get('/costs', async (req, res, next) => {
    try {
        const filters = comparisonFilters(req);
        const { rows } = await dashboardPool.query(
            `WITH current_usage AS (
                SELECT
                    MAX(event_at) AS data_as_of,
                    SUM(COALESCE(total_coins, 0)) AS current_coins
                FROM ${usageSource} u
                WHERE ${filters.current.sql}
             ), previous_usage AS (
                SELECT SUM(COALESCE(total_coins, 0)) AS previous_coins
                FROM ${usageSource} u
                WHERE ${filters.previous.sql}
             )
             SELECT
                current_coins AS "currentBillingCycle",
                previous_coins AS "previousBillingCycle",
                current_coins - previous_coins AS "usageChange",
                'Coin' AS unit,
                data_as_of AS "dataAsOf"
             FROM current_usage
             CROSS JOIN previous_usage`,
            [...filters.current.params, ...filters.previous.params]
        );
        const row = rows[0] || {};
        const currentCoins = Number(row.currentBillingCycle || 0);
        const dataAsOf = row.dataAsOf ? new Date(row.dataAsOf) : null;
        const today = new Date();
        const selectedStart = req.query.start ? new Date(`${req.query.start}T00:00:00Z`) : null;
        const selectedEnd = req.query.end ? new Date(`${req.query.end}T23:59:59Z`) : null;
        const isCurrentMonth = Boolean(
            dataAsOf
            && selectedStart
            && selectedEnd
            && selectedEnd >= today
            && selectedStart.getUTCDate() === 1
            && selectedStart.getUTCFullYear() === dataAsOf.getUTCFullYear()
            && selectedStart.getUTCMonth() === dataAsOf.getUTCMonth()
            && dataAsOf.getUTCFullYear() === today.getUTCFullYear()
            && dataAsOf.getUTCMonth() === today.getUTCMonth()
        );
        const daysInMonth = dataAsOf
            ? new Date(Date.UTC(
                dataAsOf.getUTCFullYear(),
                dataAsOf.getUTCMonth() + 1,
                0
            )).getUTCDate()
            : 0;
        const projectedEndOfMonth = isCurrentMonth && dataAsOf.getUTCDate() > 0
            ? currentCoins / dataAsOf.getUTCDate() * daysInMonth
            : currentCoins;
        res.json({
            success: true,
            data: {
                ...row,
                projectedEndOfMonth,
                isProjected: isCurrentMonth,
                changePercent: percentChange(
                    row.currentBillingCycle,
                    row.previousBillingCycle
                ),
            },
            source: 'dashboard_test',
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
