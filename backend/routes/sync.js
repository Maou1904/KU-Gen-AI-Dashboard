const express = require('express');
const syncService = require('../services/sync-service');
const scheduler = require('../services/scheduler');

const router = express.Router();

router.get('/status', async (req, res, next) => {
    try {
        res.json({ success: true, data: await syncService.getStatus() });
    } catch (error) {
        next(error);
    }
});

router.get('/preflight', async (req, res, next) => {
    try {
        const status = await syncService.getStatus();
        const ready = status.connections.every(connection =>
            connection.name === 'dashboard'
                ? connection.status === 'connected' && connection.canWrite
                : connection.status === 'connected' && connection.safeReadOnly
        );
        res.status(ready ? 200 : 503).json({
            success: ready,
            data: {
                ready,
                connections: status.connections,
            },
        });
    } catch (error) {
        next(error);
    }
});

router.put('/schedule', async (req, res, next) => {
    try {
        const data = await syncService.updateSchedule(
            req.body,
            req.get('x-admin-user') || 'admin'
        );
        await scheduler.reload();
        res.json({ success: true, data });
    } catch (error) {
        error.status = error.status || 400;
        next(error);
    }
});

router.post('/run', async (req, res, next) => {
    try {
        const data = await syncService.run('manual');
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
