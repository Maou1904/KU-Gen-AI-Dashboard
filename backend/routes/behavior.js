const express = require('express');
const { dashboardPool } = require('../config/database');

const router = express.Router();

router.get('/daily-users', async (req, res, next) => {
    try {
        const { rows } = await dashboardPool.query(
            `SELECT
                activity_date AS date,
                COUNT(DISTINCT user_key)::bigint AS users
             FROM fact_user_activity_daily
             GROUP BY activity_date
             ORDER BY activity_date`
        );
        res.json({ success: true, data: rows, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

router.get('/trending-tags', async (req, res, next) => {
    try {
        const { rows } = await dashboardPool.query(
            `SELECT t.display_tag AS tag, SUM(a.note_count)::bigint AS frequency
             FROM agg_topic_daily a
             JOIN dim_tag t ON t.tag_key = a.tag_key
             GROUP BY t.tag_key, t.display_tag
             ORDER BY frequency DESC
             LIMIT 15`
        );
        res.json({ success: true, data: rows, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

router.get('/app-distribution', async (req, res, next) => {
    try {
        const { rows } = await dashboardPool.query(
            `WITH app_usage AS (
                SELECT
                    a.app_name,
                    COUNT(*)::bigint AS usage_count,
                    COUNT(DISTINCT f.user_key)::bigint AS active_users
                FROM fact_usage_event f
                JOIN dim_app a ON a.app_key = f.app_key
                GROUP BY a.app_key, a.app_name
             )
             SELECT
                app_name AS app,
                usage_count AS "usageCount",
                active_users AS "activeUsers",
                ROUND(usage_count * 100.0 / NULLIF(SUM(usage_count) OVER (), 0), 2) AS percentage
             FROM app_usage
             ORDER BY usage_count DESC`
        );
        res.json({ success: true, data: rows, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

router.get('/kpi', async (req, res, next) => {
    try {
        const { rows } = await dashboardPool.query(
            `SELECT
                COUNT(*) FILTER (WHERE is_active)::bigint AS "totalNotesGenerated",
                COUNT(DISTINCT user_key) FILTER (WHERE is_active)::bigint AS "noteAuthors",
                MAX(created_at) AS "dataAsOf"
             FROM fact_note`
        );
        res.json({ success: true, data: rows[0], source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
