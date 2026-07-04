const express = require('express');
const { dashboardPool } = require('../config/database');
const {
    usageFilter,
    usageSource,
    modelUsageSource,
    noteSource,
} = require('./filter-utils');

const router = express.Router();

const changePercent = (current, previous) => {
    const a = Number(current || 0);
    const b = Number(previous || 0);
    if (!b) return a ? 100 : 0;
    return Number((((a - b) / b) * 100).toFixed(2));
};

router.get('/metrics', async (req, res, next) => {
    try {
        const filter = usageFilter(req);
        const { rows } = await dashboardPool.query(
            `WITH usage_totals AS (
                SELECT
                    COUNT(DISTINCT user_key) AS active_users,
                    SUM(COALESCE(total_coins, 0)) AS coins,
                    COUNT(*) AS transactions,
                    MAX(event_at) AS data_as_of
                FROM ${usageSource} u
                WHERE ${filter.sql}
             ), model_totals AS (
                SELECT
                    SUM(total_tokens) AS tokens,
                    MAX(event_at) AS data_as_of
                FROM ${modelUsageSource} u
                WHERE ${filter.sql}
             )
             SELECT
                usage_totals.active_users,
                0::bigint AS previous_active_users,
                model_totals.tokens,
                0::bigint AS previous_tokens,
                usage_totals.coins,
                0::numeric AS previous_coins,
                usage_totals.transactions,
                0::bigint AS previous_transactions,
                GREATEST(usage_totals.data_as_of, model_totals.data_as_of) AS data_as_of
             FROM usage_totals CROSS JOIN model_totals`,
            filter.params
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
            changePercent: Number(previousValue || 0) ? changePercent(value, previousValue) : null,
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
        const { rows } = await dashboardPool.query(
            `WITH usage_monthly AS (
                SELECT
                    DATE_TRUNC('month', event_at) AS month_date,
                    COUNT(*)::bigint AS usage
                FROM ${usageSource} u
                WHERE ${filter.sql}
                GROUP BY DATE_TRUNC('month', event_at)
             ), model_monthly AS (
                SELECT
                    DATE_TRUNC('month', event_at) AS month_date,
                    SUM(total_tokens)::bigint AS tokens
                FROM ${modelUsageSource} u
                WHERE ${filter.sql}
                GROUP BY DATE_TRUNC('month', event_at)
             )
             SELECT
                TO_CHAR(COALESCE(a.month_date, m.month_date), 'Mon') AS month,
                EXTRACT(YEAR FROM COALESCE(a.month_date, m.month_date))::int AS year,
                COALESCE(a.usage, 0)::bigint AS usage,
                COALESCE(m.tokens, 0)::bigint AS tokens
             FROM usage_monthly a
             FULL OUTER JOIN model_monthly m ON m.month_date = a.month_date
             ORDER BY COALESCE(a.month_date, m.month_date)`,
            filter.params
        );
        res.json({ success: true, data: rows, source: 'dashboard_test' });
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
