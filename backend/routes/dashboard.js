const express = require('express');
const { dashboardPool } = require('../config/database');
const {
    usageFilter,
    comparisonFilters,
    percentChange,
    usageSource,
    modelUsageSource,
    noteSource,
} = require('./filter-utils');

const router = express.Router();

router.get('/available-years', async (req, res, next) => {
    try {
        const { rows } = await dashboardPool.query(
            `WITH years AS (
                SELECT EXTRACT(YEAR FROM event_at)::int AS year
                FROM ${usageSource} u
                WHERE event_at IS NOT NULL
                UNION
                SELECT EXTRACT(YEAR FROM event_at)::int AS year
                FROM ${modelUsageSource} u
                WHERE event_at IS NOT NULL
                UNION
                SELECT EXTRACT(YEAR FROM created_at)::int AS year
                FROM ${noteSource} n
                WHERE created_at IS NOT NULL
             )
             SELECT year
             FROM years
             WHERE year IS NOT NULL
             ORDER BY year`
        );
        res.json({
            success: true,
            data: rows.map(row => Number(row.year)),
            source: 'dashboard_test',
        });
    } catch (error) {
        next(error);
    }
});

router.get('/metrics', async (req, res, next) => {
    try {
        const filters = comparisonFilters(req);
        const { rows } = await dashboardPool.query(
            `WITH current_usage AS (
                SELECT
                    COUNT(DISTINCT user_key) AS active_users,
                    SUM(COALESCE(total_coins, 0)) AS coins,
                    COUNT(*) AS transactions,
                    MAX(event_at) AS data_as_of
                FROM ${usageSource} u
                WHERE ${filters.current.sql}
             ), previous_usage AS (
                SELECT
                    COUNT(DISTINCT user_key) AS active_users,
                    SUM(COALESCE(total_coins, 0)) AS coins,
                    COUNT(*) AS transactions
                FROM ${usageSource} u
                WHERE ${filters.previous.sql}
             ), current_model AS (
                SELECT
                    SUM(total_tokens) AS tokens,
                    MAX(event_at) AS data_as_of
                FROM ${modelUsageSource} u
                WHERE ${filters.current.sql}
             ), previous_model AS (
                SELECT SUM(total_tokens) AS tokens
                FROM ${modelUsageSource} u
                WHERE ${filters.previous.sql}
             )
             SELECT
                current_usage.active_users,
                previous_usage.active_users AS previous_active_users,
                current_model.tokens,
                previous_model.tokens AS previous_tokens,
                current_usage.coins,
                previous_usage.coins AS previous_coins,
                current_usage.transactions,
                previous_usage.transactions AS previous_transactions,
                GREATEST(current_usage.data_as_of, current_model.data_as_of) AS data_as_of
             FROM current_usage
             CROSS JOIN previous_usage
             CROSS JOIN current_model
             CROSS JOIN previous_model`,
            [...filters.current.params, ...filters.previous.params]
        );
        const row = rows[0] || {};
        const data = [
            ['ACTIVE_USERS', row.active_users, row.previous_active_users, 'users'],
            ['TOKEN_CONSUMPTION', row.tokens, row.previous_tokens, 'tokens'],
            ['COIN_CONSUMPTION', row.coins, row.previous_coins, 'Coin'],
            ['TOTAL_TRANSACTIONS', row.transactions, row.previous_transactions, 'transactions'],
        ].map(([metricName, value, previousValue, unit]) => ({
            metricName,
            value: Number(value || 0),
            previousValue: Number(previousValue || 0),
            changePercent: percentChange(value, previousValue),
            unit,
        }));
        res.json({ success: true, data, dataAsOf: row.data_as_of, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

router.get('/monthly-usage', async (req, res, next) => {
    try {
        const filter = usageFilter(req);
        const allowedGranularities = new Set(['day', 'month', 'year']);
        const granularity = allowedGranularities.has(req.query.granularity)
            ? req.query.granularity
            : 'month';
        const { rows } = await dashboardPool.query(
             `WITH usage_monthly AS (
                SELECT
                    DATE_TRUNC('${granularity}', event_at) AS month_date,
                    COUNT(*)::bigint AS usage,
                    COUNT(DISTINCT user_key)::bigint AS active_users,
                    SUM(COALESCE(total_coins, 0)) AS coins
                FROM ${usageSource} u
                WHERE ${filter.sql}
                GROUP BY DATE_TRUNC('${granularity}', event_at)
             ), model_monthly AS (
                SELECT
                    DATE_TRUNC('${granularity}', event_at) AS month_date,
                    SUM(total_tokens)::bigint AS tokens
                FROM ${modelUsageSource} u
                WHERE ${filter.sql}
                GROUP BY DATE_TRUNC('${granularity}', event_at)
             )
             SELECT
                TO_CHAR(COALESCE(a.month_date, m.month_date), 'YYYY-MM-DD') AS date,
                TO_CHAR(COALESCE(a.month_date, m.month_date), 'Mon') AS month,
                EXTRACT(YEAR FROM COALESCE(a.month_date, m.month_date))::int AS year,
                COALESCE(a.usage, 0)::bigint AS usage,
                COALESCE(a.active_users, 0)::bigint AS "activeUsers",
                COALESCE(a.coins, 0) AS coins,
                COALESCE(m.tokens, 0)::bigint AS tokens
             FROM usage_monthly a
             FULL OUTER JOIN model_monthly m ON m.month_date = a.month_date
             ORDER BY COALESCE(a.month_date, m.month_date)`,
            filter.params
        );
        res.json({ success: true, data: rows, granularity, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

router.get('/trending-topics', async (req, res, next) => {
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

module.exports = router;
