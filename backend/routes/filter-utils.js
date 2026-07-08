const csv = value => String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

const shiftToPreviousPeriod = (startValue, endValue) => {
    if (!startValue || !endValue) return [null, null];
    const start = new Date(`${startValue}T00:00:00.000Z`);
    const end = new Date(`${endValue}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
        return [null, null];
    }
    const dayMs = 24 * 60 * 60 * 1000;
    const durationDays = Math.floor((end - start) / dayMs) + 1;
    const previousEnd = new Date(start.getTime() - dayMs);
    const previousStart = new Date(previousEnd.getTime() - ((durationDays - 1) * dayMs));
    return [
        previousStart.toISOString().slice(0, 10),
        previousEnd.toISOString().slice(0, 10),
    ];
};

const usageFilter = (
    req,
    alias = 'u',
    timestampColumn = 'event_at',
    parameterOffset = 0,
    period = 'current'
) => {
    let start = req.query.start || null;
    let end = req.query.end || null;
    if (period === 'previous') {
        [start, end] = shiftToPreviousPeriod(start, end);
    }
    const campuses = csv(req.query.campuses);
    const faculties = csv(req.query.faculties);
    const departments = csv(req.query.departments);
    const p = index => `$${parameterOffset + index}`;
    return {
        sql: `(${p(1)}::date IS NULL OR ${alias}.${timestampColumn} >= ${p(1)}::date)
            AND (${p(2)}::date IS NULL OR ${alias}.${timestampColumn} < ${p(2)}::date + INTERVAL '1 day')
            AND (CARDINALITY(${p(3)}::text[]) = 0 OR ${alias}.campus = ANY(${p(3)}::text[]))
            AND (CARDINALITY(${p(4)}::text[]) = 0 OR ${alias}.faculty = ANY(${p(4)}::text[]))
            AND (CARDINALITY(${p(5)}::text[]) = 0 OR ${alias}.department = ANY(${p(5)}::text[]))`,
        params: [start, end, campuses, faculties, departments],
    };
};

const comparisonFilters = (req, alias = 'u', timestampColumn = 'event_at') => {
    const current = usageFilter(req, alias, timestampColumn, 0, 'current');
    const previous = usageFilter(req, alias, timestampColumn, 5, 'previous');
    if (!req.query.start || !req.query.end) {
        previous.sql = `FALSE AND ${previous.sql}`;
    }
    return { current, previous };
};

const percentChange = (current, previous) => {
    const currentValue = Number(current || 0);
    const previousValue = Number(previous || 0);
    if (!previousValue) return null;
    return Number((((currentValue - previousValue) / previousValue) * 100).toFixed(2));
};

const usageSource = `(
    SELECT
        f.*,
        CASE
            WHEN o.org_level = 'campus' THEN o.name_en
            WHEN p1.org_level = 'campus' THEN p1.name_en
            WHEN p2.org_level = 'campus' THEN p2.name_en
        END AS campus,
        CASE
            WHEN o.org_level = 'faculty' THEN o.name_en
            WHEN p1.org_level = 'faculty' THEN p1.name_en
        END AS faculty,
        CASE WHEN o.org_level = 'department' THEN o.name_en END AS department
    FROM fact_usage_event f
    LEFT JOIN dim_org_unit o ON o.org_unit_key = f.org_unit_key
    LEFT JOIN dim_org_unit p1 ON p1.org_unit_key = o.parent_org_unit_key
    LEFT JOIN dim_org_unit p2 ON p2.org_unit_key = p1.parent_org_unit_key
)`;

const modelUsageSource = `(
    SELECT
        f.*,
        u.campus,
        u.faculty,
        u.department
    FROM fact_model_usage_event f
    LEFT JOIN ${usageSource} u ON u.usage_event_key = f.usage_event_key
    WHERE (
        f.source_table = 'workflow_node_executions'
        AND f.status = 'succeeded'
    ) OR (
        f.source_table = 'messages'
        AND f.source_run_id IS NULL
    )
)`;

const noteSource = `(
    SELECT
        n.*,
        CASE
            WHEN o.org_level = 'campus' THEN o.name_en
            WHEN p1.org_level = 'campus' THEN p1.name_en
            WHEN p2.org_level = 'campus' THEN p2.name_en
        END AS campus,
        CASE
            WHEN o.org_level = 'faculty' THEN o.name_en
            WHEN p1.org_level = 'faculty' THEN p1.name_en
        END AS faculty,
        CASE WHEN o.org_level = 'department' THEN o.name_en END AS department
    FROM fact_note n
    LEFT JOIN dim_org_unit o ON o.org_unit_key = n.org_unit_key
    LEFT JOIN dim_org_unit p1 ON p1.org_unit_key = o.parent_org_unit_key
    LEFT JOIN dim_org_unit p2 ON p2.org_unit_key = p1.parent_org_unit_key
)`;

module.exports = {
    usageFilter,
    comparisonFilters,
    percentChange,
    usageSource,
    modelUsageSource,
    noteSource,
};
