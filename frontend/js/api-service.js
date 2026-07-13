/**
 * API Service Module
 * Handles all API calls to the backend server
 */

const API = {
    BASE_URL: window.APP_CONFIG?.API_BASE_URL
        || `${window.location.protocol}//${window.location.hostname}:5000/api`,
    TIMEOUT: 5000,
    lastError: null,

    /**
     * Generic fetch wrapper with error handling
     */
    async request(endpoint, options = {}) {
        try {
            const url = `${this.BASE_URL}${endpoint}`;
            const response = await Promise.race([
                fetch(url, {
                    method: options.method || 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers
                    },
                    ...options
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Request timeout')), this.TIMEOUT)
                )
            ]);

            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.lastError = null;
            return data;
        } catch (error) {
            this.lastError = error.message;
            console.warn(`API request failed for ${endpoint}:`, error.message);
            return null;
        }
    },

    // Dashboard endpoints
    async getDashboardMetrics(query = '') {
        return this.request(`/dashboard/metrics${query}`);
    },

    async getMonthlyUsage(query = '') {
        return this.request(`/dashboard/monthly-usage${query}`);
    },

    async getAvailableYears() {
        return this.request('/dashboard/available-years');
    },

    async getTrendingTopics(query = '') {
        return this.request(`/dashboard/trending-topics${query}`);
    },

    // API Management endpoints
    async getProviderConsumption(query = '') {
        return this.request(`/api-management/provider-consumption${query}`);
    },

    async getModelConsumption(query = '') {
        return this.request(`/api-management/model-consumption${query}`);
    },

    async getHierarchyData(query = '') {
        return this.request(`/api-management/hierarchy${query}`);
    },

    async getCosts(query = '') {
        return this.request(`/api-management/costs${query}`);
    },

    async getModelLatency(query = '') {
        return this.request(`/api-management/model-latency${query}`);
    },

    // Department endpoints
    async getDepartmentSummary(query = '') {
        return this.request(`/department/summary${query}`);
    },

    async getDepartmentKPIs(query = '') {
        return this.request(`/department/kpis${query}`);
    },

    async getGrowthData() {
        return this.request('/department/growth');
    },

    async getHeatmapData(query = '') {
        return this.request(`/department/heatmap${query}`);
    },

    // Behavior endpoints
    async getDailyUsers(query = '') {
        return this.request(`/behavior/daily-users${query}`);
    },

    async getTrendingTags(query = '') {
        return this.request(`/behavior/trending-tags${query}`);
    },

    async getAppDistribution(query = '') {
        return this.request(`/behavior/app-distribution${query}`);
    },

    async getBehaviorKPI(query = '') {
        return this.request(`/behavior/kpi${query}`);
    },

    async getSyncStatus() {
        return this.request('/sync/status');
    },

    async getSyncPreflight() {
        return this.request('/sync/preflight');
    },

    async updateSyncSchedule(payload) {
        return this.request('/sync/schedule', {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
    },

    async runSync() {
        return this.request('/sync/run', { method: 'POST' });
    },

    // Health check
    async healthCheck() {
        return this.request('/health');
    }
};

// Make API available globally
window.API = API;
