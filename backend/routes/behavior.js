const express = require('express');
const { dashboardPool } = require('../config/database');
const { usageFilter, usageSource, noteSource } = require('./filter-utils');

const router = express.Router();

router.get('/daily-users', async (req, res, next) => {
    try {
        const filter = usageFilter(req);
        const { rows } = await dashboardPool.query(
            `SELECT
                event_at::date AS date,
                COUNT(DISTINCT user_key)::bigint AS users
             FROM ${usageSource} u
             WHERE ${filter.sql}
             GROUP BY event_at::date
             ORDER BY event_at::date`,
            filter.params
        );
        res.json({ success: true, data: rows, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

router.get('/trending-tags', async (req, res, next) => {
    try {
        const filter = usageFilter(req, 'n', 'created_at');
        const { rows } = await dashboardPool.query(
            `SELECT t.display_tag AS tag, COUNT(*)::bigint AS frequency
             FROM ${noteSource} n
             JOIN bridge_note_tag b ON b.note_key = n.note_key
             JOIN dim_tag t ON t.tag_key = b.tag_key
             WHERE n.is_active AND ${filter.sql}
             GROUP BY t.tag_key, t.display_tag
             ORDER BY frequency DESC
             LIMIT 15`,
            filter.params
        );
        res.json({ success: true, data: rows, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

router.get('/app-distribution', async (req, res, next) => {
    try {
        const filter = usageFilter(req);
        const { rows } = await dashboardPool.query(
            `WITH app_usage AS (
                SELECT
                    a.app_name,
                    COUNT(*)::bigint AS usage_count,
                    COUNT(DISTINCT u.user_key)::bigint AS active_users
                FROM ${usageSource} u
                JOIN dim_app a ON a.app_key = u.app_key
                WHERE ${filter.sql}
                GROUP BY a.app_key, a.app_name
             ), ranked AS (
                SELECT
                    *,
                    ROW_NUMBER() OVER (ORDER BY usage_count DESC) AS rank,
                    SUM(usage_count) OVER () AS total_usage
                FROM app_usage
             ), grouped AS (
                SELECT
                    CASE WHEN rank <= 5 THEN app_name ELSE 'Other' END AS app,
                    SUM(usage_count)::bigint AS usage_count,
                    SUM(active_users)::bigint AS active_users,
                    MAX(total_usage)::bigint AS total_usage,
                    MIN(rank) AS sort_order
                FROM ranked
                GROUP BY CASE WHEN rank <= 5 THEN app_name ELSE 'Other' END
             )
             SELECT
                app,
                usage_count AS "usageCount",
                active_users AS "activeUsers",
                ROUND(usage_count * 100.0 / NULLIF(total_usage, 0), 2) AS percentage
             FROM grouped
             ORDER BY sort_order`,
            filter.params
        );
        res.json({ success: true, data: rows, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

router.get('/kpi', async (req, res, next) => {
    try {
        const filter = usageFilter(req, 'n', 'created_at');
        const { rows } = await dashboardPool.query(
            `SELECT
                COUNT(*) FILTER (WHERE is_active)::bigint AS "totalNotesGenerated",
                COUNT(DISTINCT user_key) FILTER (WHERE is_active)::bigint AS "noteAuthors",
                MAX(created_at) AS "dataAsOf"
             FROM ${noteSource} n
             WHERE ${filter.sql}`,
            filter.params
        );
        res.json({ success: true, data: rows[0], source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
