const csv = value => String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

const usageFilter = (req, alias = 'u', timestampColumn = 'event_at') => {
    const start = req.query.start || null;
    const end = req.query.end || null;
    const campuses = csv(req.query.campuses);
    const faculties = csv(req.query.faculties);
    const departments = csv(req.query.departments);
    return {
        sql: `($1::date IS NULL OR ${alias}.${timestampColumn} >= $1::date)
            AND ($2::date IS NULL OR ${alias}.${timestampColumn} < $2::date + INTERVAL '1 day')
            AND (CARDINALITY($3::text[]) = 0 OR ${alias}.campus = ANY($3::text[]))
            AND (CARDINALITY($4::text[]) = 0 OR ${alias}.faculty = ANY($4::text[]))
            AND (CARDINALITY($5::text[]) = 0 OR ${alias}.department = ANY($5::text[]))`,
        params: [start, end, campuses, faculties, departments],
    };
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
    usageSource,
    modelUsageSource,
    noteSource,
};
