const express = require('express');
const { dashboardPool } = require('../config/database');
const { usageFilter, usageSource } = require('./filter-utils');

const router = express.Router();

router.get('/summary', async (req, res, next) => {
    try {
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const offset = Math.max(0, Number(req.query.offset) || 0);
        const filter = usageFilter(req);
        const { rows } = await dashboardPool.query(
            `SELECT
                department AS name,
                faculty,
                campus,
                SUM(total_tokens)::bigint AS "totalTokensUsed",
                SUM(COALESCE(total_coins, 0)) AS "coinConsumption",
                COUNT(*)::bigint AS transactions,
                COUNT(*) OVER ()::int AS "totalRows"
             FROM ${usageSource} u
             WHERE department IS NOT NULL AND ${filter.sql}
             GROUP BY campus, faculty, department
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
            `SELECT
                COUNT(*)::bigint AS "totalTransactions",
                COUNT(DISTINCT user_key)::bigint AS "activeUsers",
                SUM(total_tokens)::bigint AS "totalTokens",
                SUM(COALESCE(total_coins, 0)) AS "coinConsumption",
                'Coin' AS unit,
                MAX(event_at) AS "dataAsOf"
             FROM ${usageSource} u
             WHERE ${filter.sql}`,
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
