const express = require('express');
const { dashboardPool } = require('../config/database');
const { usageFilter, usageSource, modelUsageSource } = require('./filter-utils');

const router = express.Router();

router.get('/summary', async (req, res, next) => {
    try {
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const offset = Math.max(0, Number(req.query.offset) || 0);
        const filter = usageFilter(req);
        const { rows } = await dashboardPool.query(
            `WITH usage_summary AS (
                SELECT
                    campus,
                    faculty,
                    department,
                    SUM(COALESCE(total_coins, 0)) AS coin_consumption,
                    COUNT(*)::bigint AS transactions
                FROM ${usageSource} u
                WHERE department IS NOT NULL AND ${filter.sql}
                GROUP BY campus, faculty, department
             ), model_summary AS (
                SELECT
                    campus,
                    faculty,
                    department,
                    SUM(total_tokens)::bigint AS tokens
                FROM ${modelUsageSource} u
                WHERE department IS NOT NULL AND ${filter.sql}
                GROUP BY campus, faculty, department
             )
             SELECT
                a.department AS name,
                a.faculty,
                a.campus,
                COALESCE(m.tokens, 0)::bigint AS "totalTokensUsed",
                a.coin_consumption AS "coinConsumption",
                a.transactions,
                COUNT(*) OVER ()::int AS "totalRows"
             FROM usage_summary a
             LEFT JOIN model_summary m
               ON m.campus = a.campus
              AND m.faculty = a.faculty
              AND m.department = a.department
             ORDER BY "totalTokensUsed" DESC
             LIMIT $6 OFFSET $7`,
            [...filter.params, limit, offset]
        );
        const unmapped = await dashboardPool.query(
            `SELECT COUNT(*)::int AS count
             FROM ${usageSource} u
             WHERE department IS NULL AND ${filter.sql}`,
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

router.get('/kpis', async (req, res, next) => {
    try {
        const filter = usageFilter(req);
        const { rows } = await dashboardPool.query(
            `WITH usage_totals AS (
                SELECT
                    COUNT(*)::bigint AS transactions,
                    COUNT(DISTINCT user_key)::bigint AS active_users,
                    SUM(COALESCE(total_coins, 0)) AS coin_consumption,
                    MAX(event_at) AS data_as_of
                FROM ${usageSource} u
                WHERE ${filter.sql}
             ), model_totals AS (
                SELECT
                    SUM(total_tokens)::bigint AS tokens,
                    MAX(event_at) AS data_as_of
                FROM ${modelUsageSource} u
                WHERE ${filter.sql}
             )
             SELECT
                usage_totals.transactions AS "totalTransactions",
                usage_totals.active_users AS "activeUsers",
                model_totals.tokens AS "totalTokens",
                usage_totals.coin_consumption AS "coinConsumption",
                'Coin' AS unit,
                GREATEST(usage_totals.data_as_of, model_totals.data_as_of) AS "dataAsOf"
             FROM usage_totals CROSS JOIN model_totals`,
            filter.params
        );
        res.json({ success: true, data: rows[0], source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

router.get('/growth', async (req, res, next) => {
    try {
        const { rows } = await dashboardPool.query(
            `SELECT
                DATE_TRUNC('month', f.event_at)::date AS month,
                o.name_en AS department,
                SUM(f.total_tokens)::bigint AS tokens,
                COUNT(*)::bigint AS transactions
             FROM fact_usage_event f
             JOIN dim_org_unit o ON o.org_unit_key = f.org_unit_key
             WHERE o.org_level IN ('department', 'unit')
             GROUP BY DATE_TRUNC('month', f.event_at), o.org_unit_key, o.name_en
             ORDER BY month, tokens DESC`
        );
        res.json({ success: true, data: rows, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

router.get('/heatmap', async (req, res, next) => {
    try {
        const filter = usageFilter(req);
        const { rows } = await dashboardPool.query(
            `SELECT
                EXTRACT(DOW FROM event_at)::int AS day,
                FLOOR(EXTRACT(HOUR FROM event_at) / 3)::int * 3 AS hour,
                COUNT(*)::bigint AS value
             FROM ${usageSource} u
             WHERE ${filter.sql}
             GROUP BY EXTRACT(DOW FROM event_at),
                      FLOOR(EXTRACT(HOUR FROM event_at) / 3)::int * 3
             ORDER BY day, hour`,
            filter.params
        );
        res.json({ success: true, data: rows, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
