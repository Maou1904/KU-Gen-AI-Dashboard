const express = require('express');
const { dashboardPool } = require('../config/database');

const router = express.Router();

const changePercent = (current, previous) => {
    const a = Number(current || 0);
    const b = Number(previous || 0);
    if (!b) return a ? 100 : 0;
    return Number((((a - b) / b) * 100).toFixed(2));
};

router.get('/metrics', async (req, res, next) => {
    try {
        const { rows } = await dashboardPool.query(
            `WITH anchor AS (
                SELECT MAX(event_at) AS data_as_of FROM fact_usage_event
             ), totals AS (
                SELECT
                    COUNT(DISTINCT user_key) FILTER (
                        WHERE event_at > data_as_of - INTERVAL '30 days'
                    ) AS active_users,
                    COUNT(DISTINCT user_key) FILTER (
                        WHERE event_at > data_as_of - INTERVAL '60 days'
                          AND event_at <= data_as_of - INTERVAL '30 days'
                    ) AS previous_active_users,
                    SUM(total_tokens) FILTER (
                        WHERE event_at > data_as_of - INTERVAL '30 days'
                    ) AS tokens,
                    SUM(total_tokens) FILTER (
                        WHERE event_at > data_as_of - INTERVAL '60 days'
                          AND event_at <= data_as_of - INTERVAL '30 days'
                    ) AS previous_tokens,
                    SUM(COALESCE(total_coins, 0)) FILTER (
                        WHERE event_at > data_as_of - INTERVAL '30 days'
                    ) AS coins,
                    SUM(COALESCE(total_coins, 0)) FILTER (
                        WHERE event_at > data_as_of - INTERVAL '60 days'
                          AND event_at <= data_as_of - INTERVAL '30 days'
                    ) AS previous_coins,
                    COUNT(*) FILTER (
                        WHERE event_at > data_as_of - INTERVAL '30 days'
                    ) AS transactions,
                    COUNT(*) FILTER (
                        WHERE event_at > data_as_of - INTERVAL '60 days'
                          AND event_at <= data_as_of - INTERVAL '30 days'
                    ) AS previous_transactions,
                    data_as_of
                FROM fact_usage_event CROSS JOIN anchor
                GROUP BY data_as_of
             )
             SELECT * FROM totals`
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
            changePercent: changePercent(value, previousValue),
            unit,
        }));
        res.json({ success: true, data, dataAsOf: row.data_as_of, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

router.get('/monthly-usage', async (req, res, next) => {
    try {
        const { rows } = await dashboardPool.query(
            `SELECT
                TO_CHAR(DATE_TRUNC('month', usage_date), 'Mon') AS month,
                EXTRACT(YEAR FROM usage_date)::int AS year,
                SUM(transaction_count)::bigint AS usage,
                SUM(total_tokens)::bigint AS tokens
             FROM agg_usage_daily
             GROUP BY DATE_TRUNC('month', usage_date), EXTRACT(YEAR FROM usage_date)
             ORDER BY DATE_TRUNC('month', usage_date)`
        );
        res.json({ success: true, data: rows, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

router.get('/trending-topics', async (req, res, next) => {
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

module.exports = router;
