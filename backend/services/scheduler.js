const syncService = require('./sync-service');

class SyncScheduler {
    constructor() {
        this.timer = null;
        this.stopped = true;
    }

    async start() {
        this.stopped = false;
        await this.scheduleNext();
    }

    stop() {
        this.stopped = true;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }

    async scheduleNext() {
        if (this.stopped) return;
        if (this.timer) clearTimeout(this.timer);

        const schedule = await syncService.getSchedule();
        const delay = schedule.is_enabled
            ? Math.max(1000, Number(schedule.interval_minutes) * 60 * 1000)
            : 60 * 1000;

        this.timer = setTimeout(async () => {
            try {
                const current = await syncService.getSchedule();
                if (current.is_enabled) await syncService.run('schedule');
            } catch (error) {
                console.error(`[sync] Scheduled run failed: ${error.message}`);
            } finally {
                await this.scheduleNext();
            }
        }, delay);
    }

    async reload() {
        await this.scheduleNext();
    }
}

module.exports = new SyncScheduler();

