require('dotenv').config();

const crypto = require('crypto');
const { Pool } = require('pg');
const kuOrgCatalog = require('../config/ku-org-catalog.json');

const DEMO_NAME_PATTERN = /(^|[_-])demo($|[_-])/i;

const toNumber = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
};

const toFloat = (value, fallback) => {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? fallback : parsed;
};

const toBool = (value, fallback = false) => {
    if (value == null) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const requireDemoName = (name, label) => {
    if (!DEMO_NAME_PATTERN.test(name)) {
        throw new Error(`${label}=${name} does not look like a demo database name`);
    }
};

const seed = String(process.env.DEMO_SEED || '20260708');
const shouldReset = process.argv.includes('--reset');
const useMainSamples = toBool(process.env.DEMO_SAMPLE_MAIN_DB, true);

const simulationConfig = {
    startDate: process.env.DEMO_START_DATE || '2021-01-01',
    endDate: process.env.DEMO_END_DATE || '2026-12-31',
    baseDailyEvents: toNumber(process.env.DEMO_DAILY_EVENTS, 28),
    usersPerOrg: toNumber(process.env.DEMO_USERS_PER_ORG, 4),
    appSampleSize: toNumber(process.env.DEMO_APP_SAMPLE_SIZE, 16),
    usageTemplateLimit: toNumber(process.env.DEMO_USAGE_TEMPLATE_LIMIT, 5000),
    noteCount: toNumber(process.env.DEMO_NOTE_COUNT, 1440),
};

const sharedSeedConfig = {
    host: process.env.PG_HOST || 'localhost',
    port: toNumber(process.env.PG_PORT, 5432),
    user: process.env.SEED_PG_USER || process.env.PG_USER || 'postgres',
    password: process.env.SEED_PG_PASSWORD || process.env.PG_PASSWORD,
};

const mainSourceConfig = {
    host: process.env.MAIN_PG_HOST || process.env.PG_HOST || 'localhost',
    port: toNumber(process.env.MAIN_PG_PORT || process.env.PG_PORT, 5432),
    user: process.env.MAIN_SOURCE_PG_USER || process.env.MAIN_PG_USER || process.env.PG_USER || 'postgres',
    password: process.env.MAIN_SOURCE_PG_PASSWORD || process.env.MAIN_PG_PASSWORD || process.env.PG_PASSWORD,
    options: '-c default_transaction_read_only=on',
    connectionTimeoutMillis: toNumber(process.env.MAIN_DB_POOL_ACQUIRE, 5000),
};

const databaseNames = {
    kucsgenai: process.env.DEMO_KUCSGENAI_DB_NAME || 'kucsgenai_source_demo',
    dify: process.env.DEMO_DIFY_DB_NAME || 'dify_source_demo',
};

const mainDatabaseNames = {
    kucsgenai: process.env.MAIN_KUCSGENAI_DB_NAME || 'kucsgenai',
    dify: process.env.MAIN_DIFY_DB_NAME || 'dify',
};

Object.entries(databaseNames).forEach(([label, name]) => requireDemoName(name, label));

const kucsPool = new Pool({ ...sharedSeedConfig, database: databaseNames.kucsgenai });
const difyPool = new Pool({ ...sharedSeedConfig, database: databaseNames.dify });
let kucsDb = kucsPool;
let difyDb = difyPool;

const makeUuid = label => {
    const hash = crypto.createHash('sha256').update(`${seed}:${label}`).digest('hex');
    const variant = ((Number.parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80)
        .toString(16)
        .padStart(2, '0');
    return [
        hash.slice(0, 8),
        hash.slice(8, 12),
        `4${hash.slice(13, 16)}`,
        `${variant}${hash.slice(18, 20)}`,
        hash.slice(20, 32),
    ].join('-');
};

const createRandom = inputSeed => {
    let state = crypto
        .createHash('sha256')
        .update(inputSeed)
        .digest()
        .readUInt32BE(0);
    return () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 0x100000000;
    };
};

const random = createRandom(seed);
const pick = items => items[Math.floor(random() * items.length)];
const round = (value, decimals = 6) => Number(value.toFixed(decimals));
const shortHash = label => crypto.createHash('sha1').update(String(label)).digest('hex').slice(0, 12);

const slugify = (value, prefix = 'item') => {
    const ascii = String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return ascii || `${prefix}-${shortHash(value)}`;
};

const addMinutes = (date, minutes) => new Date(date.getTime() + (minutes * 60 * 1000));

const parseDate = value => {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
    return date;
};

const dayKey = date => date.toISOString().slice(0, 10);

const asObject = value => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
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

const weightedPick = (items, weightOf) => {
    const total = items.reduce((sum, item) => sum + Math.max(0, weightOf(item)), 0);
    if (total <= 0) return pick(items);
    let cursor = random() * total;
    for (const item of items) {
        cursor -= Math.max(0, weightOf(item));
        if (cursor <= 0) return item;
    }
    return items[items.length - 1];
};

const fallbackApps = [
    {
        slug: 'study-chat',
        name: 'KU Study Assistant',
        mode: 'chat',
        source: 'demo',
        provider: 'openai',
        model: 'gpt-4o-mini',
        categoryName: 'Education',
        subCategoryName: 'Learning Assistant',
        workflow: false,
        modelOptions: [{ nodeId: 'chat_model', provider: 'openai', name: 'gpt-4o-mini' }],
    },
    {
        slug: 'research-flow',
        name: 'Research Summarizer',
        mode: 'workflow',
        source: 'demo',
        provider: 'anthropic',
        model: 'claude-3-5-haiku',
        categoryName: 'Research',
        subCategoryName: 'Research Assistant',
        workflow: true,
        modelOptions: [{ nodeId: 'llm_research_summary', provider: 'anthropic', name: 'claude-3-5-haiku' }],
    },
    {
        slug: 'admin-flow',
        name: 'Policy Draft Helper',
        mode: 'workflow',
        source: 'demo',
        provider: 'openai',
        model: 'gpt-4o-mini',
        categoryName: 'Operations',
        subCategoryName: 'Admin Assistant',
        workflow: true,
        modelOptions: [{ nodeId: 'llm_policy_draft', provider: 'openai', name: 'gpt-4o-mini' }],
    },
];

const displayName = item => item.nameEn || item.nameTh || item.name || item.id;

const buildOrgEntries = catalog => catalog.campuses.flatMap(campus => (
    campus.faculties.flatMap(faculty => (
        (faculty.units || [])
            .filter(unit => unit.simulate !== false)
            .map(unit => ({
                campusId: campus.id,
                campus: displayName(campus),
                campusNameTh: campus.nameTh || displayName(campus),
                facultyId: faculty.id,
                facultyName: displayName(faculty),
                facultyNameTh: faculty.nameTh || displayName(faculty),
                departmentId: unit.id,
                departmentName: displayName(unit),
                departmentNameTh: unit.nameTh || displayName(unit),
                unitType: unit.unitType || 'department',
                sourceUrl: unit.sourceUrl || faculty.sourceUrl || campus.sourceUrl || null,
            }))
    ))
));

const orgs = buildOrgEntries(kuOrgCatalog);

if (!orgs.length) {
    throw new Error('KU org catalog did not provide any simulation-ready org units');
}

const users = orgs.flatMap(org => Array.from({ length: simulationConfig.usersPerOrg }, (_, index) => ({
    slug: `${org.departmentId}-${index + 1}`,
    memberType: index % 3 === 0 ? 'staff' : 'student',
    org,
})));

let apps = fallbackApps;
let categories = [];
let subCategories = [];
let usageTemplates = [];

const normalizeAppMode = mode => mode || 'chat';

const buildSyntheticGraph = app => {
    if (app.graph && Object.keys(app.graph).length) return app.graph;
    if (!app.workflow) return { nodes: {} };
    const option = app.modelOptions[0] || {
        nodeId: 'llm',
        provider: app.provider,
        name: app.model,
    };
    return {
        nodes: {
            [option.nodeId]: {
                id: option.nodeId,
                data: {
                    model: {
                        provider: option.provider,
                        name: option.name,
                    },
                },
            },
        },
    };
};

const appIds = app => ({
    kucs: app.demoKucsAppId || makeUuid(`kucs-app:${app.slug}`),
    dify: app.demoDifyAppId || makeUuid(`dify-app:${app.slug}`),
    config: app.demoConfigId || makeUuid(`dify-config:${app.slug}`),
});

const prepareDimensions = currentApps => {
    const categoryMap = new Map();
    const subCategoryMap = new Map();
    for (const app of currentApps) {
        const categoryName = app.categoryName || 'Demo Applications';
        const subCategoryName = app.subCategoryName || 'Main DB Sample';
        const categorySlug = slugify(categoryName, 'category');
        const subCategorySlug = `${categorySlug}:${slugify(subCategoryName, 'subcategory')}`;
        categoryMap.set(categorySlug, { slug: categorySlug, name: categoryName });
        subCategoryMap.set(subCategorySlug, {
            slug: subCategorySlug,
            category: categorySlug,
            name: subCategoryName,
        });
        app.categorySlug = categorySlug;
        app.subCategorySlug = subCategorySlug;
    }
    categories = [...categoryMap.values()];
    subCategories = [...subCategoryMap.values()];
};

const normalizeSampledApp = (row, dify) => {
    const sourceId = String(row.id);
    const sourceDifyId = row.app_id ? String(row.app_id) : null;
    const graph = asObject(row.graph);
    const configuredModels = graphModels(graph);
    const model = asObject(row.model);
    const provider = model.provider || configuredModels[0]?.provider || dify?.provider || 'openai';
    const modelName = model.name || model.model || model.model_name
        || configuredModels[0]?.name || dify?.model_id || 'gpt-4o-mini';
    const mode = normalizeAppMode(row.mode || dify?.mode);
    const workflow = configuredModels.length > 0 || /workflow|advanced/i.test(mode);
    const slug = `main-${shortHash(`${sourceId}:${row.name}`)}`;
    const modelOptions = configuredModels.length
        ? configuredModels
        : [{ nodeId: `llm_${slug}`, provider, name: modelName }];

    return {
        slug,
        name: row.name || dify?.name || `Sampled App ${slug}`,
        mode,
        source: row.source || 'main-db-sample',
        provider,
        model: modelName,
        modelJson: Object.keys(model).length ? model : { provider, name: modelName },
        graph,
        categoryName: row.category_name || 'Main DB Sample',
        subCategoryName: row.sub_category_name || 'Sampled Applications',
        workflow,
        modelOptions,
        sourceKucsAppId: sourceId,
        sourceDifyAppId: sourceDifyId,
        demoKucsAppId: makeUuid(`sampled-kucs-app:${sourceId}`),
        demoDifyAppId: makeUuid(`sampled-dify-app:${sourceDifyId || sourceId}`),
        demoConfigId: makeUuid(`sampled-dify-config:${sourceDifyId || sourceId}`),
        usageWeight: Number(row.usage_count || 0) + 1,
    };
};

const loadMainApps = async () => {
    if (!useMainSamples) return fallbackApps;

    const mainKucsPool = new Pool({ ...mainSourceConfig, database: mainDatabaseNames.kucsgenai });
    const mainDifyPool = new Pool({ ...mainSourceConfig, database: mainDatabaseNames.dify });
    try {
        const [kucsResult, difyResult] = await Promise.all([
            mainKucsPool.query(
                `WITH usage_counts AS (
                    SELECT app_id, COUNT(*)::int AS usage_count, MAX(created_at) AS last_used_at
                    FROM user_app_usage
                    GROUP BY app_id
                 )
                 SELECT
                    a.id::text,
                    a.app_id::text,
                    a.name,
                    a.mode,
                    a.source,
                    a."isActive" AS is_active,
                    a.model,
                    a.graph,
                    a.updated_at,
                    sc."nameEn" AS sub_category_name,
                    ac."nameEn" AS category_name,
                    COALESCE(uc.usage_count, 0)::int AS usage_count,
                    uc.last_used_at
                 FROM apps a
                 LEFT JOIN usage_counts uc ON uc.app_id = a.id
                 LEFT JOIN sub_category sc ON sc.id = a.sub_category_id
                 LEFT JOIN app_category ac ON ac.id = sc.app_category_id
                 WHERE a.deleted_at IS NULL
                   AND a."isActive" IS TRUE
                 ORDER BY COALESCE(uc.usage_count, 0) DESC,
                          uc.last_used_at DESC NULLS LAST,
                          a.updated_at DESC NULLS LAST
                 LIMIT $1`,
                [simulationConfig.appSampleSize]
            ),
            mainDifyPool.query(
                `SELECT
                    a.id::text,
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
        const sampled = kucsResult.rows
            .map(row => normalizeSampledApp(row, row.app_id ? difyById.get(String(row.app_id)) : null))
            .filter(app => app.name);

        if (!sampled.length) {
            console.warn('[demo:seed] main DB app sampling returned no apps; using fallback apps');
            return fallbackApps;
        }
        console.log(`[demo:seed] sampled ${sampled.length} apps from ${mainDatabaseNames.kucsgenai}/${mainDatabaseNames.dify}`);
        return sampled;
    } catch (error) {
        console.warn(`[demo:seed] main DB app sampling failed, using fallback apps: ${error.message}`);
        return fallbackApps;
    } finally {
        await Promise.allSettled([mainKucsPool.end(), mainDifyPool.end()]);
    }
};

const loadUsageTemplates = async currentApps => {
    if (!useMainSamples) return [];
    const appBySourceId = new Map(currentApps
        .filter(app => app.sourceKucsAppId)
        .map(app => [String(app.sourceKucsAppId), app]));
    if (!appBySourceId.size) return [];

    const mainKucsPool = new Pool({ ...mainSourceConfig, database: mainDatabaseNames.kucsgenai });
    try {
        const { rows } = await mainKucsPool.query(
            `SELECT
                app_id::text,
                created_at,
                updated_at,
                input_tokens,
                output_tokens,
                total_tokens,
                total_price,
                currency,
                exchange_rate,
                vat_rate,
                total_thb,
                total_coins,
                calculate_method
             FROM user_app_usage
             WHERE created_at IS NOT NULL
               AND app_id = ANY($1::uuid[])
             ORDER BY created_at DESC
             LIMIT $2`,
            [[...appBySourceId.keys()], simulationConfig.usageTemplateLimit]
        );
        const templates = rows
            .map(row => {
                const app = appBySourceId.get(String(row.app_id));
                if (!app) return null;
                return {
                    appSlug: app.slug,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                    inputTokens: Number(row.input_tokens || 0),
                    outputTokens: Number(row.output_tokens || 0),
                    totalTokens: Number(row.total_tokens || 0),
                    totalPrice: Number(row.total_price || 0),
                    currency: row.currency || 'USD',
                    exchangeRate: Number(row.exchange_rate || 36),
                    vatRate: Number(row.vat_rate || 0.07),
                    totalThb: Number(row.total_thb || 0),
                    totalCoins: Number(row.total_coins || 0),
                    calculateMethod: row.calculate_method || 'demo_time_shifted',
                };
            })
            .filter(template => template && template.totalTokens > 0);
        console.log(`[demo:seed] loaded ${templates.length} usage templates from ${mainDatabaseNames.kucsgenai}`);
        return templates;
    } catch (error) {
        console.warn(`[demo:seed] usage template sampling failed; falling back to synthetic token profiles: ${error.message}`);
        return [];
    } finally {
        await mainKucsPool.end();
    }
};

const resetSources = async () => {
    await kucsPool.query(`
        TRUNCATE user_app_usage, ai_notes, apps, sub_category, app_category, "user"
        RESTART IDENTITY CASCADE
    `);
    await difyPool.query(`
        TRUNCATE workflow_node_executions, messages, apps, app_model_configs
        RESTART IDENTITY CASCADE
    `);
    console.log('[demo:seed] existing demo source rows truncated');
};

const seedDimensions = async () => {
    for (const category of categories) {
        await kucsDb.query(
            `INSERT INTO app_category (id, "nameEn")
             VALUES ($1,$2)
             ON CONFLICT (id) DO UPDATE SET "nameEn" = EXCLUDED."nameEn"`,
            [makeUuid(`category:${category.slug}`), category.name]
        );
    }

    for (const subCategory of subCategories) {
        await kucsDb.query(
            `INSERT INTO sub_category (id, app_category_id, "nameEn")
             VALUES ($1,$2,$3)
             ON CONFLICT (id) DO UPDATE SET
                app_category_id = EXCLUDED.app_category_id,
                "nameEn" = EXCLUDED."nameEn"`,
            [
                makeUuid(`subcategory:${subCategory.slug}`),
                makeUuid(`category:${subCategory.category}`),
                subCategory.name,
            ]
        );
    }

    for (const app of apps) {
        const ids = appIds(app);
        await difyDb.query(
            `INSERT INTO app_model_configs (id, provider, model_id)
             VALUES ($1,$2,$3)
             ON CONFLICT (id) DO UPDATE SET
                provider = EXCLUDED.provider,
                model_id = EXCLUDED.model_id`,
            [ids.config, app.provider, app.model]
        );
        await difyDb.query(
            `INSERT INTO apps (id, name, mode, status, updated_at, app_model_config_id)
             VALUES ($1,$2,$3,'normal',NOW(),$4)
             ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                mode = EXCLUDED.mode,
                status = EXCLUDED.status,
                updated_at = EXCLUDED.updated_at,
                app_model_config_id = EXCLUDED.app_model_config_id`,
            [ids.dify, app.name, app.mode, ids.config]
        );

        await kucsDb.query(
            `INSERT INTO apps (
                id, app_id, name, mode, source, "isActive", model, graph, sub_category_id, updated_at
             ) VALUES ($1,$2,$3,$4,$5,TRUE,$6,$7,$8,NOW())
             ON CONFLICT (id) DO UPDATE SET
                app_id = EXCLUDED.app_id,
                name = EXCLUDED.name,
                mode = EXCLUDED.mode,
                source = EXCLUDED.source,
                "isActive" = EXCLUDED."isActive",
                model = EXCLUDED.model,
                graph = EXCLUDED.graph,
                sub_category_id = EXCLUDED.sub_category_id,
                updated_at = EXCLUDED.updated_at`,
            [
                ids.kucs,
                ids.dify,
                app.name,
                app.mode,
                app.source,
                JSON.stringify(app.modelJson || { provider: app.provider, name: app.model }),
                JSON.stringify(buildSyntheticGraph(app)),
                makeUuid(`subcategory:${app.subCategorySlug}`),
            ]
        );
    }

    for (const user of users) {
        await kucsDb.query(
            `INSERT INTO "user" (
                id, "isActive", "createdAt", "lastLogin", "updatedAt", "memberType", "userInfo"
             ) VALUES ($1,TRUE,$2,$3,$4,$5,$6)
             ON CONFLICT (id) DO UPDATE SET
                "isActive" = EXCLUDED."isActive",
                "lastLogin" = EXCLUDED."lastLogin",
                "updatedAt" = EXCLUDED."updatedAt",
                "memberType" = EXCLUDED."memberType",
                "userInfo" = EXCLUDED."userInfo"`,
            [
                makeUuid(`user:${user.slug}`),
                `${simulationConfig.startDate}T00:00:00.000Z`,
                `${simulationConfig.endDate}T09:00:00.000Z`,
                `${simulationConfig.endDate}T09:00:00.000Z`,
                user.memberType,
                JSON.stringify({
                    'campus-id': user.org.campusId,
                    campus: user.org.campus,
                    'ku-campus-th': user.org.campusNameTh,
                    'faculty-id': user.org.facultyId,
                    'ku-faculty-en': user.org.facultyName,
                    'ku-faculty-th': user.org.facultyNameTh,
                    'department-id': user.org.departmentId,
                    'ku-department-en': user.org.departmentName,
                    'ku-department-th': user.org.departmentNameTh,
                    'department-type': user.org.unitType,
                    'org-source-url': user.org.sourceUrl,
                }),
            ]
        );
    }
};

const classifyDate = date => {
    const md = dayKey(date).slice(5);
    if (md >= '02-10' && md <= '02-21') {
        return { slug: 'semester-2-midterm', eventFactor: 1.65, tokenFactor: 1.28, failRate: 0.025, focusFacultyIds: ['bangkhen-engineering', 'bangkhen-science'] };
    }
    if (md >= '03-24' && md <= '04-04') {
        return { slug: 'semester-2-final', eventFactor: 1.95, tokenFactor: 1.45, failRate: 0.03, focusFacultyIds: ['bangkhen-engineering', 'bangkhen-science', 'bangkhen-business-administration'] };
    }
    if (md >= '07-21' && md <= '08-01') {
        return { slug: 'semester-1-midterm', eventFactor: 1.6, tokenFactor: 1.25, failRate: 0.025, focusFacultyIds: ['kamphaeng-saen-liberal-arts-science', 'sriracha-science'] };
    }
    if (md >= '09-22' && md <= '10-03') {
        return { slug: 'semester-1-final', eventFactor: 1.9, tokenFactor: 1.42, failRate: 0.03, focusFacultyIds: ['sakon-science-engineering', 'sriracha-engineering', 'bangkhen-science'] };
    }
    if ((md >= '01-01' && md <= '01-12')
        || (md >= '04-05' && md <= '05-31')
        || (md >= '10-04' && md <= '11-09')) {
        return { slug: 'semester-break', eventFactor: 0.35, tokenFactor: 0.82, failRate: 0.008, focusFacultyIds: [] };
    }
    if (md >= '06-01' && md <= '06-14') {
        return { slug: 'semester-start', eventFactor: 1.2, tokenFactor: 0.95, failRate: 0.01, focusFacultyIds: [] };
    }
    if (md >= '11-10' && md <= '11-23') {
        return { slug: 'semester-start', eventFactor: 1.18, tokenFactor: 0.95, failRate: 0.01, focusFacultyIds: [] };
    }
    return { slug: 'normal-semester', eventFactor: 1, tokenFactor: 1, failRate: 0.012, focusFacultyIds: [] };
};

const eventCountForDate = (date, scenario) => {
    const day = date.getUTCDay();
    const weekendFactor = day === 0 ? 0.32 : day === 6 ? 0.45 : 1;
    const fridayFactor = day === 5 ? 0.88 : 1;
    const variation = 0.72 + (random() * 0.58);
    return Math.max(1, Math.round(
        simulationConfig.baseDailyEvents
        * scenario.eventFactor
        * weekendFactor
        * fridayFactor
        * variation
    ));
};

const candidateUsersForScenario = scenario => {
    if (!scenario.focusFacultyIds.length || random() > 0.35) return users;
    const focused = users.filter(user => scenario.focusFacultyIds.includes(user.org.facultyId));
    return focused.length ? focused : users;
};

const userWeight = user => {
    if (user.memberType === 'staff') return 0.7;
    if (user.org.unitType === 'department' || user.org.unitType === 'branch') return 1.25;
    if (user.org.unitType === 'center' || user.org.unitType === 'institute') return 0.72;
    return 0.55;
};

const appWeight = app => {
    const mode = String(app.mode || '').toLowerCase();
    const modeWeight = mode.includes('chat') ? 1.35 : mode.includes('workflow') ? 1 : 0.8;
    return modeWeight * Math.max(1, Math.log2(Number(app.usageWeight || 1) + 1));
};

const eventTimeFor = (date, slot, totalSlots, template) => {
    const shifted = template?.createdAt ? new Date(template.createdAt) : null;
    let minutes = shifted && !Number.isNaN(shifted.getTime())
        ? (shifted.getUTCHours() * 60) + shifted.getUTCMinutes()
        : (8 * 60) + Math.floor((slot / Math.max(1, totalSlots)) * 660);
    minutes += Math.floor((random() - 0.5) * 180);
    minutes = Math.max(7 * 60, Math.min(22 * 60, minutes));
    const bangkokDayStartUtc = new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        -7,
        0,
        0,
        0
    ));
    return addMinutes(bangkokDayStartUtc, minutes);
};

const tokenProfile = (template, app, scenario) => {
    const appFactor = String(app.mode || '').includes('advanced') ? 1.18
        : String(app.mode || '').includes('workflow') ? 1.12
            : 1;
    const variation = scenario.tokenFactor * appFactor * (0.68 + (random() * 0.72));
    const inputBase = template?.inputTokens || (220 + Math.floor(random() * 1800));
    const outputBase = template?.outputTokens || (120 + Math.floor(random() * 1400));
    const inputTokens = Math.max(1, Math.round(inputBase * variation));
    const outputTokens = Math.max(0, Math.round(outputBase * variation));
    const totalTokens = Math.max(1, inputTokens + outputTokens);
    const templateTokens = template?.totalTokens || totalTokens;
    const priceScale = totalTokens / Math.max(1, templateTokens);
    const totalPrice = template?.totalPrice > 0
        ? round(template.totalPrice * priceScale * (0.9 + (random() * 0.25)), 8)
        : round(totalTokens * 0.0000008, 8);
    const exchangeRate = template?.exchangeRate > 0
        ? round(template.exchangeRate * (0.995 + (random() * 0.01)), 6)
        : 36;
    const vatRate = 0.07;
    const totalThb = round(totalPrice * exchangeRate * (1 + vatRate), 6);
    const totalCoins = round(totalThb * 100, 6);
    return {
        inputTokens,
        outputTokens,
        totalTokens,
        totalPrice,
        currency: template?.currency || 'USD',
        exchangeRate,
        vatRate,
        totalThb,
        totalCoins,
        calculateMethod: template ? 'demo_time_shifted_variation' : 'demo_scenario_generated',
    };
};

const seedUsageAndRuntime = async () => {
    const appBySlug = new Map(apps.map(app => [app.slug, app]));
    let eventIndex = 0;
    for (
        let day = parseDate(simulationConfig.startDate);
        day <= parseDate(simulationConfig.endDate);
        day.setUTCDate(day.getUTCDate() + 1)
    ) {
        const eventDate = new Date(day);
        const scenario = classifyDate(eventDate);
        const dailyEvents = eventCountForDate(eventDate, scenario);
        for (let slot = 0; slot < dailyEvents; slot += 1) {
            eventIndex += 1;
            const template = usageTemplates.length ? pick(usageTemplates) : null;
            const app = (template && appBySlug.get(template.appSlug))
                || weightedPick(apps, appWeight);
            const candidateUsers = candidateUsersForScenario(scenario);
            const user = weightedPick(candidateUsers, userWeight);
            const eventAt = eventTimeFor(eventDate, slot, dailyEvents, template);
            const profile = tokenProfile(template, app, scenario);
            const ids = appIds(app);
            const usageId = makeUuid(`usage:${dayKey(eventDate)}:${eventIndex}`);
            const messageId = makeUuid(`message:${dayKey(eventDate)}:${eventIndex}`);
            const conversationId = makeUuid(`conversation:${dayKey(eventDate)}:${eventIndex}`);
            const workflowRunId = app.workflow
                ? makeUuid(`workflow-run:${dayKey(eventDate)}:${eventIndex}`)
                : null;
            const latency = round((0.55 + random() * 3.4) * (scenario.eventFactor > 1.5 ? 1.22 : 1), 6);
            const status = random() < scenario.failRate ? 'failed' : 'succeeded';

            await kucsDb.query(
                `INSERT INTO user_app_usage (
                    id, user_id, app_id, conversation_id, created_at, updated_at,
                    input_tokens, output_tokens, total_tokens, total_price, currency,
                    exchange_rate, vat_rate, total_thb, total_coins, calculate_method
                 ) VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
                 )
                 ON CONFLICT (id) DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    app_id = EXCLUDED.app_id,
                    conversation_id = EXCLUDED.conversation_id,
                    created_at = EXCLUDED.created_at,
                    updated_at = EXCLUDED.updated_at,
                    input_tokens = EXCLUDED.input_tokens,
                    output_tokens = EXCLUDED.output_tokens,
                    total_tokens = EXCLUDED.total_tokens,
                    total_price = EXCLUDED.total_price,
                    currency = EXCLUDED.currency,
                    exchange_rate = EXCLUDED.exchange_rate,
                    vat_rate = EXCLUDED.vat_rate,
                    total_thb = EXCLUDED.total_thb,
                    total_coins = EXCLUDED.total_coins,
                    calculate_method = EXCLUDED.calculate_method`,
                [
                    usageId,
                    makeUuid(`user:${user.slug}`),
                    ids.kucs,
                    conversationId,
                    eventAt,
                    addMinutes(eventAt, 2),
                    profile.inputTokens,
                    profile.outputTokens,
                    profile.totalTokens,
                    profile.totalPrice,
                    profile.currency,
                    profile.exchangeRate,
                    profile.vatRate,
                    profile.totalThb,
                    profile.totalCoins,
                    profile.calculateMethod,
                ]
            );

            await difyDb.query(
                `INSERT INTO messages (
                    id, app_id, conversation_id, model_provider, model_id,
                    message_tokens, answer_tokens, total_price, currency,
                    provider_response_latency, workflow_run_id, status,
                    created_at, updated_at
                 ) VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
                 )
                 ON CONFLICT (id) DO UPDATE SET
                    app_id = EXCLUDED.app_id,
                    conversation_id = EXCLUDED.conversation_id,
                    model_provider = EXCLUDED.model_provider,
                    model_id = EXCLUDED.model_id,
                    message_tokens = EXCLUDED.message_tokens,
                    answer_tokens = EXCLUDED.answer_tokens,
                    total_price = EXCLUDED.total_price,
                    currency = EXCLUDED.currency,
                    provider_response_latency = EXCLUDED.provider_response_latency,
                    workflow_run_id = EXCLUDED.workflow_run_id,
                    status = EXCLUDED.status,
                    created_at = EXCLUDED.created_at,
                    updated_at = EXCLUDED.updated_at`,
                [
                    messageId,
                    ids.dify,
                    conversationId,
                    app.provider,
                    app.model,
                    profile.inputTokens,
                    profile.outputTokens,
                    profile.totalPrice,
                    profile.currency,
                    latency,
                    workflowRunId,
                    status,
                    eventAt,
                    addMinutes(eventAt, 2),
                ]
            );

            if (app.workflow) {
                const modelOption = pick(app.modelOptions || [{ nodeId: 'llm', provider: app.provider, name: app.model }]);
                await difyDb.query(
                    `INSERT INTO workflow_node_executions (
                        id, app_id, workflow_run_id, node_id, node_type,
                        status, elapsed_time, process_data, execution_metadata, created_at
                     ) VALUES (
                        $1,$2,$3,$4,'llm',$5,$6,$7,$8,$9
                     )
                     ON CONFLICT (id) DO UPDATE SET
                        app_id = EXCLUDED.app_id,
                        workflow_run_id = EXCLUDED.workflow_run_id,
                        node_id = EXCLUDED.node_id,
                        node_type = EXCLUDED.node_type,
                        status = EXCLUDED.status,
                        elapsed_time = EXCLUDED.elapsed_time,
                        process_data = EXCLUDED.process_data,
                        execution_metadata = EXCLUDED.execution_metadata,
                        created_at = EXCLUDED.created_at`,
                    [
                        makeUuid(`workflow-node:${dayKey(eventDate)}:${eventIndex}`),
                        ids.dify,
                        workflowRunId,
                        modelOption.nodeId,
                        status,
                        latency,
                        JSON.stringify({
                            model_provider: modelOption.provider,
                            model_name: modelOption.name,
                        }),
                        JSON.stringify({
                            total_tokens: status === 'succeeded' ? profile.totalTokens : 0,
                            total_price: status === 'succeeded' ? profile.totalPrice : 0,
                            currency: profile.currency,
                        }),
                        addMinutes(eventAt, 1),
                    ]
                );
            }
        }
    }

    return eventIndex;
};

const seedNotes = async () => {
    const tagPool = ['research', 'teaching', 'policy', 'student-support', 'operations', 'curriculum'];
    for (let index = 0; index < simulationConfig.noteCount; index += 1) {
        const user = pick(users);
        const date = parseDate(simulationConfig.startDate);
        const spanDays = Math.floor((parseDate(simulationConfig.endDate) - date) / 86400000);
        date.setUTCDate(date.getUTCDate() + Math.floor(random() * Math.max(1, spanDays + 1)));
        date.setUTCHours(8 + Math.floor(random() * 10), Math.floor(random() * 60), 0, 0);
        await kucsDb.query(
            `INSERT INTO ai_notes (id, owner_id, "isActive", tags, "createdAt", "updatedAt")
             VALUES ($1,$2,TRUE,$3,$4,$5)
             ON CONFLICT (id) DO UPDATE SET
                owner_id = EXCLUDED.owner_id,
                "isActive" = EXCLUDED."isActive",
                tags = EXCLUDED.tags,
                "createdAt" = EXCLUDED."createdAt",
                "updatedAt" = EXCLUDED."updatedAt"`,
            [
                index + 1,
                makeUuid(`user:${user.slug}`),
                JSON.stringify(['demo', '2025', user.org.facultyId, user.org.unitType, pick(tagPool)]),
                date,
                addMinutes(date, 5),
            ]
        );
    }
};

const countRows = async () => {
    const [kucsCounts, difyCounts] = await Promise.all([
        kucsPool.query(`
            SELECT
                (SELECT COUNT(*) FROM apps) AS apps,
                (SELECT COUNT(*) FROM "user") AS users,
                (SELECT COUNT(*) FROM user_app_usage) AS usage,
                (SELECT COUNT(*) FROM ai_notes) AS notes,
                (SELECT MIN(created_at) FROM user_app_usage) AS usage_start,
                (SELECT MAX(created_at) FROM user_app_usage) AS usage_end
        `),
        difyPool.query(`
            SELECT
                (SELECT COUNT(*) FROM apps) AS apps,
                (SELECT COUNT(*) FROM messages) AS messages,
                (SELECT COUNT(*) FROM workflow_node_executions) AS workflow_nodes
        `),
    ]);
    return {
        kucsgenai: kucsCounts.rows[0],
        dify: difyCounts.rows[0],
    };
};

const main = async () => {
    apps = await loadMainApps();
    prepareDimensions(apps);
    usageTemplates = await loadUsageTemplates(apps);

    if (shouldReset) {
        await resetSources();
    }
    const kucsClient = await kucsPool.connect();
    const difyClient = await difyPool.connect();
    kucsDb = kucsClient;
    difyDb = difyClient;
    try {
        await kucsDb.query('BEGIN');
        await difyDb.query('BEGIN');
        await seedDimensions();
        const eventCount = await seedUsageAndRuntime();
        await seedNotes();
        await kucsDb.query('COMMIT');
        await difyDb.query('COMMIT');
        const counts = await countRows();
        console.log(`[demo:seed] seeded ${eventCount} full-year usage chains with seed ${seed}`);
        console.log(JSON.stringify({
            config: {
                startDate: simulationConfig.startDate,
                endDate: simulationConfig.endDate,
                baseDailyEvents: simulationConfig.baseDailyEvents,
                apps: apps.length,
                orgUnits: orgs.length,
                users: users.length,
                usageTemplates: usageTemplates.length,
            },
            counts,
        }, null, 2));
    } catch (error) {
        await kucsDb.query('ROLLBACK');
        await difyDb.query('ROLLBACK');
        throw error;
    } finally {
        kucsDb = kucsPool;
        difyDb = difyPool;
        kucsClient.release();
        difyClient.release();
    }
};

main()
    .catch(error => {
        console.error(`[demo:seed] ${error.stack || error.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        await Promise.all([kucsPool.end(), difyPool.end()]);
    });
