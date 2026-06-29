const SyncTest = {
    baseUrl: window.APP_CONFIG?.API_BASE_URL || 'http://localhost:5000/api',

    async request(path, options = {}) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            headers: { 'Content-Type': 'application/json' },
            ...options,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
        return body.data;
    },

    setBusy(busy) {
        document.querySelectorAll('button').forEach(button => {
            button.disabled = busy;
        });
    },

    showMessage(text, isError = false) {
        const element = document.getElementById('message');
        element.textContent = text;
        element.style.color = isError ? '#b3261e' : '#617066';
    },

    async load() {
        try {
            const data = await this.request('/sync/status');
            this.render(data);
        } catch (error) {
            document.getElementById('status-dot').className = 'dot error';
            document.getElementById('status-text').textContent = 'เชื่อมต่อ Backend ไม่สำเร็จ';
            this.showMessage(error.message, true);
        }
    },

    render(data) {
        const schedule = data.schedule;
        document.getElementById('sync-enabled').checked = schedule.is_enabled;
        document.getElementById('interval-minutes').value = String(schedule.interval_minutes);
        document.getElementById('overlap-minutes').value = schedule.overlap_minutes;
        document.getElementById('batch-size').value = schedule.batch_size;

        document.getElementById('status-dot').className = `dot ${data.running ? '' : 'ok'}`;
        document.getElementById('status-text').textContent = data.running
            ? 'กำลังดึงข้อมูล'
            : schedule.is_enabled ? 'พร้อมทำงานอัตโนมัติ' : 'พร้อมทดสอบแบบ Manual';
        document.getElementById('schedule-text').textContent = schedule.is_enabled
            ? `รอบถัดไป ${schedule.next_run_at ? new Date(schedule.next_run_at).toLocaleString('th-TH') : '-'}`
            : 'Schedule ยังปิดอยู่';

        const counts = data.counts;
        document.getElementById('count-apps').textContent = Number(counts.apps).toLocaleString();
        document.getElementById('count-users').textContent = Number(counts.users).toLocaleString();
        document.getElementById('count-usage').textContent = Number(counts.usage_events).toLocaleString();
        document.getElementById('count-models').textContent = Number(counts.model_events).toLocaleString();
        document.getElementById('count-notes').textContent = Number(counts.notes).toLocaleString();

        document.getElementById('runs-body').innerHTML = data.recentRuns.length
            ? data.recentRuns.map(run => `
                <tr>
                    <td>#${run.run_id}</td>
                    <td>${new Date(run.started_at).toLocaleString('th-TH')}</td>
                    <td><span class="badge ${run.status === 'failed' ? 'failed' : ''}">${run.status}</span></td>
                    <td>${Number(run.rows_read).toLocaleString()}</td>
                    <td>${run.error_message || '-'}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="5">ยังไม่มีประวัติการ Sync</td></tr>';
    },

    async save() {
        this.setBusy(true);
        this.showMessage('กำลังบันทึก...');
        try {
            await this.request('/sync/schedule', {
                method: 'PUT',
                body: JSON.stringify({
                    isEnabled: document.getElementById('sync-enabled').checked,
                    intervalMinutes: Number(document.getElementById('interval-minutes').value),
                    overlapMinutes: Number(document.getElementById('overlap-minutes').value),
                    batchSize: Number(document.getElementById('batch-size').value),
                }),
            });
            this.showMessage('บันทึก Schedule แล้ว');
            await this.load();
        } catch (error) {
            this.showMessage(error.message, true);
        } finally {
            this.setBusy(false);
        }
    },

    async run() {
        this.setBusy(true);
        this.showMessage('กำลังดึงข้อมูล อาจใช้เวลาสักครู่...');
        try {
            const result = await this.request('/sync/run', { method: 'POST' });
            this.showMessage(`Sync สำเร็จ Run #${result.runId}`);
            await this.load();
        } catch (error) {
            this.showMessage(error.message, true);
            await this.load();
        } finally {
            this.setBusy(false);
        }
    },

    init() {
        document.getElementById('refresh-button').addEventListener('click', () => this.load());
        document.getElementById('save-button').addEventListener('click', () => this.save());
        document.getElementById('run-button').addEventListener('click', () => this.run());
        this.load();
    },
};

document.addEventListener('DOMContentLoaded', () => SyncTest.init());

