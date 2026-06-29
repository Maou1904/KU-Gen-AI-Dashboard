const express = require('express');
const { dashboardPool } = require('../config/database');

const router = express.Router();

router.get('/model-consumption', async (req, res, next) => {
    try {
        const { rows } = await dashboardPool.query(
            `WITH totals AS (
                SELECT
                    m.model_name,
                    m.provider,
                    SUM(f.total_tokens)::bigint AS tokens,
                    SUM(COALESCE(f.total_price, 0)) AS cost
                FROM fact_model_usage_event f
                JOIN dim_model m ON m.model_key = f.model_key
                GROUP BY m.model_key, m.model_name, m.provider
             )
             SELECT
                model_name AS "modelName",
                provider,
                tokens,
                cost,
                ROUND(tokens * 100.0 / NULLIF(SUM(tokens) OVER (), 0), 2) AS percentage
             FROM totals
             ORDER BY tokens DESC`
        );
        res.json({ success: true, data: rows, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

router.get('/hierarchy', async (req, res, next) => {
    try {
        const { campus, faculty, department } = req.query;
        const { rows } = await dashboardPool.query(
            `SELECT
                CASE
                    WHEN o.org_level = 'campus' THEN o.name_en
                    WHEN p1.org_level = 'campus' THEN p1.name_en
                    WHEN p2.org_level = 'campus' THEN p2.name_en
                    ELSE 'Unknown'
                END AS campus,
                CASE
                    WHEN o.org_level = 'faculty' THEN o.name_en
                    WHEN p1.org_level = 'faculty' THEN p1.name_en
                    ELSE 'Unknown'
                END AS faculty,
                CASE WHEN o.org_level IN ('department', 'unit') THEN o.name_en ELSE 'Unknown' END AS department,
                SUM(f.total_tokens)::bigint AS "tokensUsed",
                SUM(COALESCE(f.total_coins, 0)) AS "coinConsumption"
             FROM fact_usage_event f
             JOIN dim_org_unit o ON o.org_unit_key = f.org_unit_key
             LEFT JOIN dim_org_unit p1 ON p1.org_unit_key = o.parent_org_unit_key
             LEFT JOIN dim_org_unit p2 ON p2.org_unit_key = p1.parent_org_unit_key
             GROUP BY 1,2,3
             HAVING ($1::text IS NULL OR $1 = 'All' OR
                        CASE
                            WHEN o.org_level = 'campus' THEN o.name_en
                            WHEN p1.org_level = 'campus' THEN p1.name_en
                            WHEN p2.org_level = 'campus' THEN p2.name_en
                            ELSE 'Unknown'
                        END = $1)
                AND ($2::text IS NULL OR $2 = 'All' OR
                        CASE
                            WHEN o.org_level = 'faculty' THEN o.name_en
                            WHEN p1.org_level = 'faculty' THEN p1.name_en
                            ELSE 'Unknown'
                        END = $2)
                AND ($3::text IS NULL OR $3 = 'All' OR
                        CASE WHEN o.org_level IN ('department', 'unit') THEN o.name_en ELSE 'Unknown' END = $3)
             ORDER BY "tokensUsed" DESC`,
            [campus || null, faculty || null, department || null]
        );
        res.json({ success: true, data: rows, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

router.get('/costs', async (req, res, next) => {
    try {
        const { rows } = await dashboardPool.query(
            `WITH anchor AS (
                SELECT MAX(event_at) AS data_as_of FROM fact_usage_event
             ), coin_usage AS (
                SELECT
                    data_as_of,
                    SUM(COALESCE(total_coins, 0)) FILTER (
                        WHERE DATE_TRUNC('month', event_at) = DATE_TRUNC('month', data_as_of)
                    ) AS current_coins,
                    SUM(COALESCE(total_coins, 0)) FILTER (
                        WHERE DATE_TRUNC('month', event_at) = DATE_TRUNC('month', data_as_of - INTERVAL '1 month')
                    ) AS previous_coins
                FROM fact_usage_event CROSS JOIN anchor
                GROUP BY data_as_of
             )
             SELECT
                current_coins AS "currentBillingCycle",
                CASE
                    WHEN EXTRACT(DAY FROM data_as_of) > 0
                    THEN current_coins / EXTRACT(DAY FROM data_as_of)
                         * EXTRACT(DAY FROM (DATE_TRUNC('month', data_as_of) + INTERVAL '1 month - 1 day'))
                    ELSE 0
                END AS "projectedEndOfMonth",
                current_coins - previous_coins AS "usageChange",
                NULL::numeric AS "cachingSavings",
                'Coin' AS unit,
                data_as_of AS "dataAsOf"
             FROM coin_usage`
        );
        res.json({ success: true, data: rows[0] || {}, source: 'dashboard_test' });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
