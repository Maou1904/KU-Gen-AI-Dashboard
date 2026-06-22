/**
 * API Service Module
 * Handles all API calls to the backend server
 * Falls back to mock data if backend is unavailable
 */

const API = {
    BASE_URL: process.env.API_URL || 'http://localhost:5000/api',
    TIMEOUT: 5000,

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
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.warn(`API request failed for ${endpoint}:`, error.message);
            return null;
        }
    },

    // Dashboard endpoints
    async getDashboardMetrics() {
        return this.request('/dashboard/metrics');
    },

    async getMonthlyUsage() {
        return this.request('/dashboard/monthly-usage');
    },

    async getTrendingTopics() {
        return this.request('/dashboard/trending-topics');
    },

    // API Management endpoints
    async getModelConsumption() {
        return this.request('/api-management/model-consumption');
    },

    async getHierarchyData() {
        return this.request('/api-management/hierarchy');
    },

    async getCosts() {
        return this.request('/api-management/costs');
    },

    // Department endpoints
    async getDepartmentSummary() {
        return this.request('/department/summary');
    },

    async getDepartmentKPIs() {
        return this.request('/department/kpis');
    },

    async getGrowthData() {
        return this.request('/department/growth');
    },

    async getHeatmapData() {
        return this.request('/department/heatmap');
    },

    // Behavior endpoints
    async getDailyUsers() {
        return this.request('/behavior/daily-users');
    },

    async getTrendingTags() {
        return this.request('/behavior/trending-tags');
    },

    async getAppDistribution() {
        return this.request('/behavior/app-distribution');
    },

    async getBehaviorKPI() {
        return this.request('/behavior/kpi');
    },

    // Health check
    async healthCheck() {
        return this.request('/health');
    }
};

// Make API available globally
window.API = API;
