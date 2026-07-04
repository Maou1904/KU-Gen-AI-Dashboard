const crypto = require('crypto');
const {
    dashboardPool,
    kucsgenaiPool,
    difyPool,
    inspectDatabaseConnections,
} = require('../config/database');

const SOURCE_START = new Date('1970-01-01T00:00:00.000Z');

const hash = value => crypto
    .createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');

const asObject = value => {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
};

const asTags = value => {
    const parsed = typeof value === 'string' ? (() => {
        try { return JSON.parse(value); } catch { return []; }
    })() : value;

    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed
        .map(item => typeof item === 'string' ? item : item?.tag || item?.name)
        .filter(Boolean)
        .map(item => String(item).trim())
        .filter(Boolean))];
};

const toUuid = value => {
    const text = String(value || '');
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
        ? text
        : null;
};

const graphModels = graph => {
    const nodes = Array.isArray(graph?.nodes)
        ? graph.nodes.map(node => [node.id, node])
        : Object.entries(graph?.nodes || {});
    return nodes.flatMap(([fallbackId, node]) => {
        const model = node?.data?.model;
        const provider = model?.provider;
        const name = model?.name || model?.model || model?.model_name
            || model?.completion_params?.model_name;
        if (!provider || !name) return [];
        return [{
            nodeId: String(node.id || fallbackId),
            provider: String(provider),
            name: String(name),
        }];
    });
};

class SyncService {
    constructor() {
        this.running = false;
        this.nodeModels = new Map();
        this.appModels = new Map();
    }

    async getSchedule() {
        const { rows } = await dashboardPool.query(
            'SELECT * FROM sync_schedule WHERE schedule_id = 1'
        );
        return rows[0];
    }

    async updateSchedule(input, updatedBy = 'admin') {
        const intervalMinutes = Number(input.intervalMinutes);
        const overlapMinutes = Number(input.overlapMinutes);
        const batchSize = Number(input.batchSize);
        const isEnabled = Boolean(input.isEnabled);

        if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 10080) {
            throw new Error('intervalMinutes must be between 1 and 10080');
        }
        if (!Number.isInteger(overlapMinutes) || overlapMinutes < 0 || overlapMinutes > 1440) {
            throw new Error('overlapMinutes must be between 0 and 1440');
        }
        if (!Number.isInteger(batchSize) || batchSize < 10 || batchSize > 10000) {
            throw new Error('batchSize must be between 10 and 10000');
        }

        const { rows } = await dashboardPool.query(
            `UPDATE sync_schedule
             SET is_enabled = $1::boolean,
                 interval_minutes = $2::int,
                 overlap_minutes = $3::int,
                 batch_size = $4::int,
                 next_run_at = CASE
                    WHEN $1::boolean THEN NOW() + ($2::int * INTERVAL '1 minute')
                    ELSE NULL
                 END,
                 updated_at = NOW(),
                 updated_by = $5
             WHERE schedule_id = 1
             RETURNING *`,
            [isEnabled, intervalMinutes, overlapMinutes, batchSize, updatedBy]
        );
        return rows[0];
    }

    async getStatus() {
        const [schedule, runResult, qualityResult, countsResult, connections] = await Promise.all([
            this.getSchedule(),
            dashboardPool.query(
                `SELECT * FROM etl_run ORDER BY started_at DESC LIMIT 10`
            ),
            dashboardPool.query(
                `SELECT * FROM etl_data_quality ORDER BY checked_at DESC LIMIT 20`
            ),
            dashboardPool.query(
                `SELECT
                    (SELECT COUNT(*) FROM dim_app) AS apps,
                    (SELECT COUNT(*) FROM dim_user) AS users,
                    (SELECT COUNT(*) FROM fact_usage_event) AS usage_events,
                    (SELECT COUNT(*) FROM fact_model_usage_event) AS model_events,
                    (SELECT COUNT(*) FROM fact_note) AS notes`
            ),
            inspectDatabaseConnections(),
        ]);

        return {
            running: this.running,
            schedule,
            recentRuns: runResult.rows,
            quality: qualityResult.rows,
            counts: countsResult.rows[0],
            connections,
        };
    }

    async run(triggeredBy = 'manual') {
        if (this.running) {
            const error = new Error('A sync run is already in progress');
            error.status = 409;
            throw error;
        }

        this.running = true;
        const connections = await inspectDatabaseConnections();
        const dashboard = connections.find(item => item.name === 'dashboard');
        const unsafeSources = connections.filter(item =>
            item.name !== 'dashboard' && !item.safeReadOnly
        );
        if (dashboard?.status !== 'connected' || !dashboard.canWrite || unsafeSources.length) {
            this.running = false;
            const details = unsafeSources.map(item => item.name).join(', ');
            throw new Error(
                unsafeSources.length
                    ? `Source read-only preflight failed: ${details}`
                    : 'Dashboard database write preflight failed'
            );
        }

        const schedule = await this.getSchedule();
        const runResult = await dashboardPool.query(
            `INSERT INTO etl_run (source_name, status)
             VALUES ($1, 'running')
             RETURNING run_id`,
            [`all:${triggeredBy}`]
        );
        const runId = runResult.rows[0].run_id;

        try {
            const counts = {};
            counts.apps = await this.syncApps();
            counts.users = await this.syncUsersAndOrganizations();
            counts.usage = await this.drainBatches(
                batch => this.syncUsage(schedule, runId, batch === 0),
                schedule.batch_size
            );
            counts.notes = await this.drainBatches(
                batch => this.syncNotes(schedule, runId, batch === 0),
                schedule.batch_size
            );
            counts.models = await this.syncModelUsage(schedule, runId);
            await this.refreshAggregates();
            await this.runQualityChecks(runId);

            const processed = Object.values(counts).reduce((sum, value) => sum + value, 0);
            await dashboardPool.query(
                `UPDATE etl_run
                 SET status = 'success',
                     finished_at = NOW(),
                     rows_read = $2,
                     rows_inserted = $2
                 WHERE run_id = $1`,
                [runId, processed]
            );
            await dashboardPool.query(
                `UPDATE sync_schedule
                 SET last_started_at = NOW(),
                     next_run_at = CASE
                         WHEN is_enabled THEN NOW() + (interval_minutes * INTERVAL '1 minute')
                         ELSE NULL
                     END
                 WHERE schedule_id = 1`
            );

            return { runId, counts };
        } catch (error) {
            await dashboardPool.query(
                `UPDATE etl_run
                 SET status = 'failed', finished_at = NOW(), error_message = $2
                 WHERE run_id = $1`,
                [runId, error.message]
            );
            throw error;
        } finally {
            this.running = false;
        }
    }

    async drainBatches(syncBatch, batchSize) {
        let total = 0;
        for (let batch = 0; batch < 1000; batch += 1) {
            const processed = await syncBatch(batch);
            total += processed;
            if (processed < Number(batchSize)) return total;
        }
        throw new Error('Sync stopped after 1000 batches to prevent an infinite loop');
    }

    async syncApps() {
        this.nodeModels.clear();
        this.appModels.clear();
        const [kucsResult, difyResult] = await Promise.all([
            kucsgenaiPool.query(
                `SELECT
                    a.id,
                    a.app_id,
                    a.name,
                    a.mode,
                    a.source,
                    a."isActive" AS is_active,
                    a.model,
                    a.graph,
                    a.updated_at,
                    sc."nameEn" AS sub_category_name,
                    ac."nameEn" AS category_name
                 FROM apps a
                 LEFT JOIN sub_category sc ON sc.id = a.sub_category_id
                 LEFT JOIN app_category ac ON ac.id = sc.app_category_id`
            ),
            difyPool.query(
                `SELECT
                    a.id,
                    a.name,
                    a.mode,
                    a.status,
                    a.updated_at,
                    amc.provider,
                    amc.model_id
                 FROM apps a
                 LEFT JOIN app_model_configs amc ON amc.id = a.app_model_config_id`
            ),
        ]);

        const difyById = new Map(difyResult.rows.map(row => [String(row.id), row]));
        const client = await dashboardPool.connect();
        try {
            await client.query('BEGIN');
            for (const row of kucsResult.rows) {
                const difyId = toUuid(row.app_id);
                const dify = difyId ? difyById.get(difyId) : null;
                const model = asObject(row.model);
                const provider = model.provider || dify?.provider || null;
                const modelName = model.name || dify?.model_id || null;
                const payload = {
                    name: row.name,
                    category: row.category_name,
                    subCategory: row.sub_category_name,
                    mode: row.mode,
                    source: row.source,
                    provider,
                    modelName,
                    active: row.is_active,
                };

                await client.query(
                    `INSERT INTO dim_app (
                        kucs_app_id, dify_app_id, app_name, category_name,
                        sub_category_name, app_mode, app_source, configured_provider,
                        configured_model, is_active, mapping_status, source_updated_at, row_hash
                     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                     ON CONFLICT (kucs_app_id) DO UPDATE SET
                        dify_app_id = EXCLUDED.dify_app_id,
                        app_name = EXCLUDED.app_name,
                        category_name = EXCLUDED.category_name,
                        sub_category_name = EXCLUDED.sub_category_name,
                        app_mode = EXCLUDED.app_mode,
                        app_source = EXCLUDED.app_source,
                        configured_provider = EXCLUDED.configured_provider,
                        configured_model = EXCLUDED.configured_model,
                        is_active = EXCLUDED.is_active,
                        mapping_status = EXCLUDED.mapping_status,
                        source_updated_at = EXCLUDED.source_updated_at,
                        row_hash = EXCLUDED.row_hash,
                        updated_at = NOW()
                     RETURNING app_key`,
                    [
                        row.id,
                        dify?.id || null,
                        row.name,
                        row.category_name,
                        row.sub_category_name,
                        row.mode,
                        row.source,
                        provider,
                        modelName,
                        row.is_active,
                        dify ? 'matched' : 'unmatched',
                        row.updated_at,
                        hash(payload),
                    ]
                );
                if (provider && modelName) {
                    await client.query(
                        `INSERT INTO dim_model (provider, model_name, normalized_name)
                         VALUES ($1::text,$2::text,LOWER($2::text))
                         ON CONFLICT (provider, model_name) DO UPDATE SET
                            normalized_name = EXCLUDED.normalized_name,
                            updated_at = NOW()`,
                        [provider, modelName]
                    );
                }

                const configuredModels = graphModels(asObject(row.graph));
                const configuredModelKeys = new Set();
                for (const configured of configuredModels) {
                    const modelResult = await client.query(
                        `INSERT INTO dim_model (provider, model_name, normalized_name)
                         VALUES ($1::text,$2::text,LOWER($2::text))
                         ON CONFLICT (provider, model_name) DO UPDATE SET
                            normalized_name = EXCLUDED.normalized_name,
                            updated_at = NOW()
                         RETURNING model_key`,
                        [configured.provider, configured.name]
                    );
                    if (difyId) {
                        configuredModelKeys.add(modelResult.rows[0].model_key);
                        this.nodeModels.set(
                            `${difyId}:${configured.nodeId}`,
                            modelResult.rows[0].model_key
                        );
                    }
                }
                if (difyId && configuredModelKeys.size === 1) {
                    this.appModels.set(difyId, [...configuredModelKeys][0]);
                }
            }
            await client.query('COMMIT');
            return kucsResult.rowCount;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async ensureOrgUnit(client, parentKey, level, code, name) {
        const sourceCode = code || `${level}:unknown`;
        const existing = await client.query(
            `SELECT org_unit_key
             FROM dim_org_unit
             WHERE source_system = 'kucsgenai'
               AND source_code = $1
               AND is_current
             LIMIT 1`,
            [sourceCode]
        );
        if (existing.rowCount) return existing.rows[0].org_unit_key;

        const payloadHash = hash({ parentKey, level, sourceCode, name });
        const inserted = await client.query(
            `INSERT INTO dim_org_unit (
                parent_org_unit_key, source_system, source_code, org_level,
                name_en, valid_from, row_hash
             ) VALUES ($1,'kucsgenai',$2,$3,$4,NOW(),$5)
             RETURNING org_unit_key`,
            [parentKey, sourceCode, level, name || 'Unknown', payloadHash]
        );
        return inserted.rows[0].org_unit_key;
    }

    async syncUsersAndOrganizations() {
        const { rows } = await kucsgenaiPool.query(
            `SELECT
                id,
                "isActive" AS is_active,
                "createdAt" AS created_at,
                "lastLogin" AS last_login,
                "updatedAt" AS updated_at,
                "memberType" AS member_type,
                "userInfo" AS user_info
             FROM "user"`
        );

        const client = await dashboardPool.connect();
        try {
            await client.query('BEGIN');
            for (const row of rows) {
                const info = asObject(row.user_info);
                const memberType = typeof row.member_type === 'string'
                    ? row.member_type
                    : JSON.stringify(row.member_type || null);
                const normalizedMemberType = memberType.slice(0, 100);
                const userHash = hash({
                    active: row.is_active,
                    memberType: normalizedMemberType,
                    updatedAt: row.updated_at,
                });
                const userResult = await client.query(
                    `INSERT INTO dim_user (
                        source_user_id, is_active, member_type, first_seen_at,
                        last_login_at, source_updated_at, row_hash
                     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
                     ON CONFLICT (source_user_id) DO UPDATE SET
                        is_active = EXCLUDED.is_active,
                        member_type = EXCLUDED.member_type,
                        last_login_at = EXCLUDED.last_login_at,
                        source_updated_at = EXCLUDED.source_updated_at,
                        row_hash = EXCLUDED.row_hash,
                        updated_at = NOW()
                     RETURNING user_key`,
                    [
                        String(row.id),
                        row.is_active,
                        normalizedMemberType,
                        row.created_at,
                        row.last_login,
                        row.updated_at,
                        userHash,
                    ]
                );
                const userKey = userResult.rows[0].user_key;

                let orgKey = null;
                const campus = info.campus;
                const faculty = info['faculty-id'] || info.faculty || info['ku-faculty-en'];
                const department = info['department-id'] || info.department || info['ku-department-en'];

                if (campus || faculty || department) {
                    const campusKey = campus
                        ? await this.ensureOrgUnit(client, null, 'campus', `campus:${campus}`, campus)
                        : null;
                    const facultyKey = faculty
                        ? await this.ensureOrgUnit(client, campusKey, 'faculty', `faculty:${faculty}`, info['ku-faculty-en'] || info.faculty || faculty)
                        : campusKey;
                    orgKey = department
                        ? await this.ensureOrgUnit(client, facultyKey, 'department', `department:${department}`, info['ku-department-en'] || info.department || department)
                        : facultyKey || campusKey || null;
                }

                const current = await client.query(
                    `SELECT user_org_key, org_unit_key
                     FROM user_org_history
                     WHERE user_key = $1 AND is_current
                     LIMIT 1`,
                    [userKey]
                );
                const changed = !current.rowCount
                    ? Boolean(orgKey)
                    : Number(current.rows[0].org_unit_key) !== Number(orgKey);
                if (changed) {
                    await client.query(
                        `UPDATE user_org_history
                         SET is_current = FALSE, valid_to = NOW()
                         WHERE user_key = $1 AND is_current`,
                        [userKey]
                    );
                    if (orgKey) {
                        await client.query(
                            `INSERT INTO user_org_history (
                                user_key, org_unit_key, valid_from, row_hash
                             ) VALUES ($1,$2,NOW(),$3)`,
                            [userKey, orgKey, hash({ userKey, orgKey })]
                        );
                    }
                }
            }
            await client.query('COMMIT');
            return rows.length;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async getWatermark(sourceName, sourceTable) {
        const { rows } = await dashboardPool.query(
            `SELECT cursor_timestamp, cursor_id
             FROM etl_watermark
             WHERE source_name = $1 AND source_table = $2`,
            [sourceName, sourceTable]
        );
        return rows[0] || { cursor_timestamp: SOURCE_START, cursor_id: '' };
    }

    async saveWatermark(client, sourceName, sourceTable, timestamp, id, runId) {
        await client.query(
            `INSERT INTO etl_watermark (
                source_name, source_table, cursor_timestamp, cursor_id, last_success_run_id
             ) VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (source_name, source_table) DO UPDATE SET
                cursor_timestamp = EXCLUDED.cursor_timestamp,
                cursor_id = EXCLUDED.cursor_id,
                last_success_run_id = EXCLUDED.last_success_run_id,
                updated_at = NOW()`,
            [sourceName, sourceTable, timestamp, String(id), runId]
        );
    }

    async syncUsage(schedule, runId, includeOverlap = false) {
        const watermark = await this.getWatermark('kucsgenai', 'user_app_usage');
        const since = new Date(watermark.cursor_timestamp || SOURCE_START);
        const cursorId = includeOverlap ? '' : String(watermark.cursor_id || '');
        if (includeOverlap) {
            since.setMinutes(since.getMinutes() - Number(schedule.overlap_minutes || 10));
        }
        const { rows } = await kucsgenaiPool.query(
            `SELECT *
             FROM user_app_usage
             WHERE updated_at > $1
                OR (updated_at = $1 AND id::text > $2)
             ORDER BY updated_at, id
             LIMIT $3`,
            [since, cursorId, schedule.batch_size]
        );
        if (!rows.length) return 0;

        const client = await dashboardPool.connect();
        try {
            await client.query('BEGIN');
            for (const row of rows) {
                const mapped = await client.query(
                    `SELECT
                        u.user_key,
                        a.app_key,
                        uoh.org_unit_key
                     FROM dim_user u
                     JOIN dim_app a ON a.kucs_app_id = $2
                     LEFT JOIN user_org_history uoh ON uoh.user_key = u.user_key AND uoh.is_current
                     WHERE u.source_user_id = $1`,
                    [String(row.user_id), row.app_id]
                );
                const keys = mapped.rows[0] || {};
                const payloadHash = hash(row);
                const qualityFlags = [];
                if (!keys.user_key) qualityFlags.push('user_unmapped');
                if (!keys.app_key) qualityFlags.push('app_unmapped');
                if (!keys.org_unit_key) qualityFlags.push('org_unmapped');
                if (row.total_coins == null) qualityFlags.push('total_coins_missing');

                await client.query(
                    `INSERT INTO fact_usage_event (
                        source_usage_id, user_key, app_key, org_unit_key,
                        source_conversation_id, event_at, input_tokens, output_tokens,
                        total_tokens, original_price, original_currency, exchange_rate,
                        vat_rate, cost_thb, total_coins, calculate_method,
                        source_created_at, source_updated_at, source_row_hash, quality_flags
                     ) VALUES (
                        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
                     )
                     ON CONFLICT (source_usage_id) DO UPDATE SET
                        user_key = EXCLUDED.user_key,
                        app_key = EXCLUDED.app_key,
                        org_unit_key = EXCLUDED.org_unit_key,
                        source_conversation_id = EXCLUDED.source_conversation_id,
                        event_at = EXCLUDED.event_at,
                        input_tokens = EXCLUDED.input_tokens,
                        output_tokens = EXCLUDED.output_tokens,
                        total_tokens = EXCLUDED.total_tokens,
                        original_price = EXCLUDED.original_price,
                        original_currency = EXCLUDED.original_currency,
                        exchange_rate = EXCLUDED.exchange_rate,
                        vat_rate = EXCLUDED.vat_rate,
                        cost_thb = EXCLUDED.cost_thb,
                        total_coins = EXCLUDED.total_coins,
                        calculate_method = EXCLUDED.calculate_method,
                        source_updated_at = EXCLUDED.source_updated_at,
                        source_row_hash = EXCLUDED.source_row_hash,
                        quality_flags = EXCLUDED.quality_flags,
                        loaded_at = NOW()`,
                    [
                        row.id,
                        keys.user_key || null,
                        keys.app_key || null,
                        keys.org_unit_key || null,
                        row.conversation_id,
                        row.created_at,
                        row.input_tokens,
                        row.output_tokens,
                        row.total_tokens || 0,
                        row.total_price,
                        row.currency,
                        row.exchange_rate,
                        row.vat_rate,
                        row.total_thb,
                        row.total_coins,
                        row.calculate_method,
                        row.created_at,
                        row.updated_at,
                        payloadHash,
                        JSON.stringify(qualityFlags),
                    ]
                );
            }
            const last = rows[rows.length - 1];
            await this.saveWatermark(
                client, 'kucsgenai', 'user_app_usage', last.updated_at, last.id, runId
            );
            await client.query('COMMIT');
            return rows.length;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async syncNotes(schedule, runId, includeOverlap = false) {
        const watermark = await this.getWatermark('kucsgenai', 'ai_notes');
        const since = new Date(watermark.cursor_timestamp || SOURCE_START);
        const cursorId = includeOverlap ? '' : String(watermark.cursor_id || '');
        if (includeOverlap) {
            since.setMinutes(since.getMinutes() - Number(schedule.overlap_minutes || 10));
        }
        const { rows } = await kucsgenaiPool.query(
            `SELECT
                id,
                owner_id,
                "isActive" AS is_active,
                tags,
                "createdAt" AS created_at,
                "updatedAt" AS updated_at
             FROM ai_notes
             WHERE "updatedAt" > $1
                OR ("updatedAt" = $1 AND id::text > $2)
             ORDER BY "updatedAt", id
             LIMIT $3`,
            [since, cursorId, schedule.batch_size]
        );
        if (!rows.length) return 0;

        const client = await dashboardPool.connect();
        try {
            await client.query('BEGIN');
            for (const row of rows) {
                const user = await client.query(
                    `SELECT
                        u.user_key,
                        uoh.org_unit_key
                     FROM dim_user u
                     LEFT JOIN user_org_history uoh ON uoh.user_key = u.user_key AND uoh.is_current
                     WHERE u.source_user_id = $1`,
                    [String(row.owner_id)]
                );
                const noteResult = await client.query(
                    `INSERT INTO fact_note (
                        source_note_id, user_key, org_unit_key, is_active,
                        created_at, source_updated_at, source_row_hash
                     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
                     ON CONFLICT (source_note_id) DO UPDATE SET
                        user_key = EXCLUDED.user_key,
                        org_unit_key = EXCLUDED.org_unit_key,
                        is_active = EXCLUDED.is_active,
                        source_updated_at = EXCLUDED.source_updated_at,
                        source_row_hash = EXCLUDED.source_row_hash,
                        loaded_at = NOW()
                     RETURNING note_key`,
                    [
                        row.id,
                        user.rows[0]?.user_key || null,
                        user.rows[0]?.org_unit_key || null,
                        row.is_active,
                        row.created_at,
                        row.updated_at,
                        hash(row),
                    ]
                );
                const noteKey = noteResult.rows[0].note_key;
                await client.query('DELETE FROM bridge_note_tag WHERE note_key = $1', [noteKey]);
                for (const tag of asTags(row.tags)) {
                    const tagResult = await client.query(
                        `INSERT INTO dim_tag (normalized_tag, display_tag)
                         VALUES (LOWER($1),$1)
                         ON CONFLICT (normalized_tag) DO UPDATE SET display_tag = EXCLUDED.display_tag
                         RETURNING tag_key`,
                        [tag]
                    );
                    await client.query(
                        `INSERT INTO bridge_note_tag (note_key, tag_key)
                         VALUES ($1,$2)
                         ON CONFLICT DO NOTHING`,
                        [noteKey, tagResult.rows[0].tag_key]
                    );
                }
            }
            const last = rows[rows.length - 1];
            await this.saveWatermark(
                client, 'kucsgenai', 'ai_notes', last.updated_at, last.id, runId
            );
            await client.query('COMMIT');
            return rows.length;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async syncModelUsage(schedule, runId) {
        const messageCount = await this.drainBatches(
            batch => this.syncMessages(schedule, runId, batch === 0),
            schedule.batch_size
        );
        const workflowCount = await this.drainBatches(
            batch => this.syncWorkflowNodes(schedule, runId, batch === 0),
            schedule.batch_size
        );
        return messageCount + workflowCount;
    }

    async syncMessages(schedule, runId, includeOverlap = false) {
        const watermark = await this.getWatermark('dify', 'messages');
        const since = new Date(watermark.cursor_timestamp || SOURCE_START);
        const cursorId = includeOverlap ? '' : String(watermark.cursor_id || '');
        if (includeOverlap) {
            since.setMinutes(since.getMinutes() - Number(schedule.overlap_minutes || 10));
        }
        const { rows } = await difyPool.query(
             `SELECT
                 id, app_id, conversation_id, model_provider, model_id,
                 message_tokens, answer_tokens, total_price, currency,
                 provider_response_latency, workflow_run_id, status,
                 created_at, updated_at
              FROM messages
             WHERE updated_at > $1
                OR (updated_at = $1 AND id::text > $2)
             ORDER BY updated_at, id
             LIMIT $3`,
            [since, cursorId, schedule.batch_size]
        );
        if (!rows.length) return 0;

        const client = await dashboardPool.connect();
        try {
            await client.query('BEGIN');
            for (const row of rows) {
                const app = await client.query(
                    `SELECT app_key, configured_provider, configured_model
                     FROM dim_app WHERE dify_app_id = $1`,
                    [row.app_id]
                );
                const appRow = app.rows[0];
                const provider = row.model_provider || appRow?.configured_provider;
                const modelName = row.model_id || appRow?.configured_model;
                let modelKey = this.appModels.get(String(row.app_id));
                if (provider && modelName) {
                    const model = await client.query(
                        `INSERT INTO dim_model (provider, model_name, normalized_name)
                         VALUES ($1::text,$2::text,LOWER($2::text))
                         ON CONFLICT (provider, model_name) DO UPDATE SET updated_at = NOW()
                         RETURNING model_key`,
                        [provider, modelName]
                    );
                    modelKey = model.rows[0].model_key;
                }
                if (!modelKey) {
                    const model = await client.query(
                        `INSERT INTO dim_model (provider, model_name, normalized_name)
                         VALUES ('unknown','unknown','unknown')
                         ON CONFLICT (provider, model_name) DO UPDATE SET updated_at = NOW()
                         RETURNING model_key`
                    );
                    modelKey = model.rows[0].model_key;
                }
                const usage = await client.query(
                    `SELECT usage_event_key
                     FROM fact_usage_event
                     WHERE source_conversation_id = $1
                     ORDER BY event_at DESC
                     LIMIT 1`,
                    [String(row.conversation_id)]
                );

                await client.query(
                    `INSERT INTO fact_model_usage_event (
                        usage_event_key, app_key, model_key, source_table,
                        source_event_id, source_run_id, event_at, node_type,
                        status, total_tokens, total_price, currency,
                        latency_seconds, attribution_method
                     ) VALUES (
                        $1,$2,$3,'messages',$4,$5,$6,'chat',$7,$8,$9,$10,$11,$12
                     )
                     ON CONFLICT (source_table, source_event_id) DO UPDATE SET
                        usage_event_key = EXCLUDED.usage_event_key,
                        app_key = EXCLUDED.app_key,
                        model_key = EXCLUDED.model_key,
                        source_run_id = EXCLUDED.source_run_id,
                        status = EXCLUDED.status,
                        total_tokens = EXCLUDED.total_tokens,
                        total_price = EXCLUDED.total_price,
                        currency = EXCLUDED.currency,
                        latency_seconds = EXCLUDED.latency_seconds,
                        attribution_method = EXCLUDED.attribution_method,
                        loaded_at = NOW()`,
                    [
                        usage.rows[0]?.usage_event_key || null,
                        appRow?.app_key || null,
                        modelKey,
                        row.id,
                        row.workflow_run_id,
                        row.created_at,
                        row.status,
                        Number(row.message_tokens || 0) + Number(row.answer_tokens || 0),
                        row.total_price,
                        row.currency,
                        row.provider_response_latency,
                        row.model_id
                            ? 'runtime'
                            : this.appModels.has(String(row.app_id))
                                ? 'single_graph_model'
                                : 'unmapped_message',
                    ]
                );
            }
            const last = rows[rows.length - 1];
            await this.saveWatermark(client, 'dify', 'messages', last.updated_at, last.id, runId);
            await client.query('COMMIT');
            return rows.length;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async syncWorkflowNodes(schedule, runId, includeOverlap = false) {
        const watermark = await this.getWatermark('dify', 'workflow_node_executions');
        const since = new Date(watermark.cursor_timestamp || SOURCE_START);
        const cursorId = includeOverlap ? '' : String(watermark.cursor_id || '');
        if (includeOverlap) {
            since.setMinutes(since.getMinutes() - Number(schedule.overlap_minutes || 10));
        }
        const { rows } = await difyPool.query(
             `SELECT
                 w.id, w.app_id, w.workflow_run_id, w.node_id, w.node_type,
                 w.status, w.elapsed_time, w.process_data, w.execution_metadata,
                 w.created_at, linked_message.conversation_id
              FROM workflow_node_executions w
              LEFT JOIN LATERAL (
                 SELECT m.conversation_id
                 FROM messages m
                 WHERE m.workflow_run_id = w.workflow_run_id
                   AND m.conversation_id IS NOT NULL
                 ORDER BY m.created_at DESC
                 LIMIT 1
              ) linked_message ON TRUE
              WHERE (w.created_at > $1
                 OR (w.created_at = $1 AND w.id::text > $2))
                AND w.node_type = 'llm'
              ORDER BY w.created_at, w.id
              LIMIT $3`,
            [since, cursorId, schedule.batch_size]
        );
        if (!rows.length) return 0;

        const client = await dashboardPool.connect();
        try {
            await client.query('BEGIN');
            for (const row of rows) {
                const metadata = asObject(row.execution_metadata);
                const processData = asObject(row.process_data);
                const usage = row.conversation_id
                    ? await client.query(
                        `SELECT usage_event_key
                         FROM fact_usage_event
                         WHERE source_conversation_id = $1
                         ORDER BY event_at DESC
                         LIMIT 1`,
                        [String(row.conversation_id)]
                    )
                    : { rows: [] };
                const app = await client.query(
                    `SELECT app_key FROM dim_app WHERE dify_app_id = $1`,
                    [row.app_id]
                );
                const appRow = app.rows[0];
                let modelKey;
                let attributionMethod;
                if (processData.model_provider && processData.model_name) {
                    const model = await client.query(
                        `INSERT INTO dim_model (provider, model_name, normalized_name)
                         VALUES ($1::text,$2::text,LOWER($2::text))
                         ON CONFLICT (provider, model_name) DO UPDATE SET
                            normalized_name = EXCLUDED.normalized_name,
                            updated_at = NOW()
                         RETURNING model_key`,
                        [processData.model_provider, processData.model_name]
                    );
                    modelKey = model.rows[0].model_key;
                    attributionMethod = 'workflow_runtime';
                } else {
                    modelKey = this.nodeModels.get(`${row.app_id}:${row.node_id}`);
                    attributionMethod = modelKey ? 'kucs_graph_node' : 'unmapped_node';
                }
                if (!modelKey) {
                    const model = await client.query(
                        `INSERT INTO dim_model (provider, model_name, normalized_name)
                         VALUES ('unknown','unknown','unknown')
                         ON CONFLICT (provider, model_name) DO UPDATE SET updated_at = NOW()
                         RETURNING model_key`
                    );
                    modelKey = model.rows[0].model_key;
                }
                await client.query(
                    `INSERT INTO fact_model_usage_event (
                        usage_event_key, app_key, model_key, source_table,
                        source_event_id, source_run_id, event_at, node_type,
                        status, total_tokens, total_price, currency,
                        latency_seconds, attribution_method
                     ) VALUES (
                        $1,$2,$3,'workflow_node_executions',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
                     )
                     ON CONFLICT (source_table, source_event_id) DO UPDATE SET
                        usage_event_key = EXCLUDED.usage_event_key,
                        app_key = EXCLUDED.app_key,
                        model_key = EXCLUDED.model_key,
                        source_run_id = EXCLUDED.source_run_id,
                        status = EXCLUDED.status,
                        total_tokens = EXCLUDED.total_tokens,
                        total_price = EXCLUDED.total_price,
                        currency = EXCLUDED.currency,
                        latency_seconds = EXCLUDED.latency_seconds,
                        attribution_method = EXCLUDED.attribution_method,
                        loaded_at = NOW()`,
                    [
                        usage.rows[0]?.usage_event_key || null,
                        appRow?.app_key || null,
                        modelKey,
                        row.id,
                        row.workflow_run_id,
                        row.created_at,
                        row.node_type,
                        row.status,
                        Number(metadata.total_tokens || 0),
                        metadata.total_price || null,
                        metadata.currency || null,
                        row.elapsed_time,
                        attributionMethod,
                    ]
                );
            }
            const last = rows[rows.length - 1];
            await this.saveWatermark(
                client, 'dify', 'workflow_node_executions', last.created_at, last.id, runId
            );
            await client.query('COMMIT');
            return rows.length;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async refreshAggregates() {
        const client = await dashboardPool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE fact_user_activity_daily, agg_usage_daily, agg_usage_hourly, agg_topic_daily');

            await client.query(
                `INSERT INTO fact_user_activity_daily (
                    activity_date, user_key, app_key, org_unit_key,
                    transaction_count, total_tokens, cost_thb, total_coins
                 )
                 SELECT
                    event_at::date,
                    user_key,
                    app_key,
                    org_unit_key,
                    COUNT(*),
                    SUM(total_tokens),
                    SUM(COALESCE(cost_thb, 0)),
                    SUM(COALESCE(total_coins, 0))
                 FROM fact_usage_event
                 WHERE user_key IS NOT NULL AND app_key IS NOT NULL
                 GROUP BY event_at::date, user_key, app_key, org_unit_key`
            );

            await client.query(
                `INSERT INTO agg_usage_daily (
                    usage_date, org_unit_key, app_key, model_key,
                    transaction_count, active_user_count, input_tokens,
                    output_tokens, total_tokens, cost_thb, total_coins
                 )
                 SELECT
                    f.event_at::date,
                    f.org_unit_key,
                    f.app_key,
                    COALESCE(m.model_key, unknown_model.model_key),
                    COUNT(*),
                    COUNT(DISTINCT f.user_key),
                    SUM(COALESCE(f.input_tokens, 0)),
                    SUM(COALESCE(f.output_tokens, 0)),
                    SUM(f.total_tokens),
                    SUM(COALESCE(f.cost_thb, 0)),
                    SUM(COALESCE(f.total_coins, 0))
                 FROM fact_usage_event f
                 LEFT JOIN dim_app a ON a.app_key = f.app_key
                 LEFT JOIN dim_model m
                    ON m.provider = a.configured_provider
                   AND m.model_name = a.configured_model
                 CROSS JOIN LATERAL (
                    SELECT model_key FROM dim_model
                    WHERE provider = 'unknown' AND model_name = 'unknown'
                    LIMIT 1
                 ) unknown_model
                 WHERE f.app_key IS NOT NULL AND f.org_unit_key IS NOT NULL
                 GROUP BY f.event_at::date, f.org_unit_key, f.app_key,
                          COALESCE(m.model_key, unknown_model.model_key)`
            );

            await client.query(
                `INSERT INTO agg_usage_hourly (
                    usage_date, hour_bucket, org_unit_key, app_key,
                    transaction_count, active_user_count, total_tokens, cost_thb, total_coins
                 )
                 SELECT
                    event_at::date,
                    FLOOR(EXTRACT(HOUR FROM event_at) / 3)::int * 3,
                    org_unit_key,
                    app_key,
                    COUNT(*),
                    COUNT(DISTINCT user_key),
                    SUM(total_tokens),
                    SUM(COALESCE(cost_thb, 0)),
                    SUM(COALESCE(total_coins, 0))
                 FROM fact_usage_event
                 WHERE app_key IS NOT NULL AND org_unit_key IS NOT NULL
                 GROUP BY event_at::date,
                          FLOOR(EXTRACT(HOUR FROM event_at) / 3)::int * 3,
                          org_unit_key, app_key`
            );

            await client.query(
                `INSERT INTO agg_topic_daily (
                    topic_date, tag_key, org_unit_key, note_count
                 )
                 SELECT
                    n.created_at::date,
                    b.tag_key,
                    n.org_unit_key,
                    COUNT(*)
                 FROM fact_note n
                 JOIN bridge_note_tag b ON b.note_key = n.note_key
                 WHERE n.is_active AND n.org_unit_key IS NOT NULL
                 GROUP BY n.created_at::date, b.tag_key, n.org_unit_key`
            );
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async runQualityChecks(runId) {
        const checks = await dashboardPool.query(
             `SELECT
                 COUNT(*) FILTER (WHERE mapping_status = 'unmatched') AS unmatched_apps,
                 (SELECT COUNT(*) FROM fact_usage_event WHERE user_key IS NULL OR app_key IS NULL) AS orphan_usage,
                 (SELECT COUNT(*) FROM fact_usage_event WHERE total_coins IS NULL) AS missing_coins,
                 (
                    SELECT COUNT(*)
                    FROM fact_model_usage_event f
                    JOIN dim_model m ON m.model_key = f.model_key
                    WHERE (m.provider = 'unknown' OR m.model_name = 'unknown')
                      AND (
                        (f.source_table = 'workflow_node_executions' AND f.status = 'succeeded')
                        OR (f.source_table = 'messages' AND f.source_run_id IS NULL)
                      )
                 ) AS unattributed_model_events
              FROM dim_app`
        );
        const values = checks.rows[0];
        const items = [
            ['unmatched_apps', values.unmatched_apps],
            ['orphan_usage', values.orphan_usage],
            ['missing_coins', values.missing_coins],
            ['unattributed_model_events', values.unattributed_model_events],
        ];
        for (const [name, count] of items) {
            await dashboardPool.query(
                `INSERT INTO etl_data_quality (
                    run_id, check_name, severity, affected_rows
                 ) VALUES ($1,$2,$3,$4)`,
                [runId, name, Number(count) ? 'warning' : 'info', Number(count)]
            );
        }
    }
}

module.exports = new SyncService();
