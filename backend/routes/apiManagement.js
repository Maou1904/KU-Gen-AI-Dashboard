const express = require('express');
const { dashboardPool } = require('../config/database');
const { usageFilter, usageSource } = require('./filter-utils');

const router = express.Router();
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
                WHERE ${filter.sql}
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
            `SELECT
                campus, faculty, department,
                SUM(total_tokens)::bigint AS "tokensUsed",
                SUM(COALESCE(total_coins, 0)) AS "coinConsumption"
             FROM ${usageSource} u
             WHERE org_unit_key IS NOT NULL AND ${filter.sql}
             GROUP BY campus, faculty, department
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
        const filter = usageFilter(req);
        const { rows } = await dashboardPool.query(
            `WITH coin_usage AS (
                SELECT
                    MAX(event_at) AS data_as_of,
                    SUM(COALESCE(total_coins, 0)) AS current_coins
                FROM ${usageSource} u
                WHERE ${filter.sql}
             )
             SELECT
                current_coins AS "currentBillingCycle",
                CASE
                    WHEN EXTRACT(DAY FROM data_as_of) > 0
                    THEN current_coins / EXTRACT(DAY FROM data_as_of)
                         * EXTRACT(DAY FROM (DATE_TRUNC('month', data_as_of) + INTERVAL '1 month - 1 day'))
                    ELSE 0
                END AS "projectedEndOfMonth",
                0::numeric AS "usageChange",
                NULL::numeric AS "cachingSavings",
                'Coin' AS unit,
                data_as_of AS "dataAsOf"
             FROM coin_usage`,
            filter.params
        );
        res.json({ success: true, data: rows[0] || {}, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
