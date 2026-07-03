const express = require('express');
const { dashboardPool } = require('../config/database');
const { usageFilter, usageSource, noteSource } = require('./filter-utils');

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
            `SELECT
                COUNT(DISTINCT user_key) AS active_users,
                0::bigint AS previous_active_users,
                SUM(total_tokens) AS tokens,
                0::bigint AS previous_tokens,
                SUM(COALESCE(total_coins, 0)) AS coins,
                0::numeric AS previous_coins,
                COUNT(*) AS transactions,
                0::bigint AS previous_transactions,
                MAX(event_at) AS data_as_of
             FROM ${usageSource} u
             WHERE ${filter.sql}`,
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
            `SELECT
                TO_CHAR(DATE_TRUNC('month', event_at), 'Mon') AS month,
                EXTRACT(YEAR FROM event_at)::int AS year,
                COUNT(*)::bigint AS usage,
                SUM(total_tokens)::bigint AS tokens
             FROM ${usageSource} u
             WHERE ${filter.sql}
             GROUP BY DATE_TRUNC('month', event_at), EXTRACT(YEAR FROM event_at)
             ORDER BY DATE_TRUNC('month', event_at)`,
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
