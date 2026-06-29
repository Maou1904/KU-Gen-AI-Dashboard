const express = require('express');
const { dashboardPool } = require('../config/database');

const router = express.Router();

router.get('/summary', async (req, res, next) => {
    try {
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const offset = Math.max(0, Number(req.query.offset) || 0);
        const { rows } = await dashboardPool.query(
            `SELECT
                o.name_en AS name,
                COALESCE(p.name_en, 'Unknown') AS faculty,
                SUM(f.total_tokens)::bigint AS "totalTokensUsed",
                SUM(COALESCE(f.total_coins, 0)) AS "coinConsumption",
                COUNT(*)::bigint AS transactions,
                COUNT(*) OVER ()::int AS "totalRows"
             FROM fact_usage_event f
             JOIN dim_org_unit o ON o.org_unit_key = f.org_unit_key
             LEFT JOIN dim_org_unit p ON p.org_unit_key = o.parent_org_unit_key
             WHERE o.org_level IN ('department', 'unit')
             GROUP BY o.org_unit_key, o.name_en, p.name_en
             ORDER BY "totalTokensUsed" DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );
        res.json({ success: true, data: rows, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

router.get('/kpis', async (req, res, next) => {
    try {
        const { rows } = await dashboardPool.query(
            `SELECT
                COUNT(*)::bigint AS "totalTransactions",
                COUNT(DISTINCT user_key)::bigint AS "activeUsers",
                SUM(COALESCE(total_coins, 0)) AS "coinConsumption",
                'Coin' AS unit,
                MAX(event_at) AS "dataAsOf"
             FROM fact_usage_event`
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
        const { rows } = await dashboardPool.query(
            `SELECT
                EXTRACT(DOW FROM usage_date)::int AS day,
                hour_bucket AS hour,
                SUM(transaction_count)::bigint AS value
             FROM agg_usage_hourly
             GROUP BY EXTRACT(DOW FROM usage_date), hour_bucket
             ORDER BY day, hour`
        );
        res.json({ success: true, data: rows, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
