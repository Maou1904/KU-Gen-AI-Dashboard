# KU Gen-AI Dashboard

Analytics dashboard workspace split into a static frontend and an Express backend API.

## Project Structure

```text
frontend/
  index.html
  js/
    api-service.js
    app.js
    charts.js
    mock-data.js

backend/
  config/
    database.js
  models/
    index.js
  routes/
    apiManagement.js
    behavior.js
    dashboard.js
    department.js
  .env.example
  package.json
  server.js

package.json
README.md
```

## Quick Start

Install frontend tooling from the project root:

```bash
npm install
```

Install backend dependencies:

```bash
npm --prefix backend install
```

Run the frontend:

```bash
npm run frontend
```

Run the backend in a second terminal:

```bash
npm run backend
```

Default URLs:

- Frontend: `http://localhost:8080`
- Backend API: `http://localhost:5000/api`
- Health check: `http://localhost:5000/api/health`

## Database Setup

The backend is prepared for MySQL through Sequelize.

1. Copy `backend/.env.example` to `backend/.env`.
2. Update these values:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=kucsgenai_dashboard
DB_USER=root
DB_PASSWORD=
DB_DIALECT=mysql
DB_SYNC=true
DB_SYNC_ALTER=false
```

3. Create the database in MySQL:

```sql
CREATE DATABASE kucsgenai_dashboard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

4. Start the backend. If MySQL is unavailable, the API stays online and returns mock data.

## Useful Scripts

```bash
npm start              # same as npm run frontend
npm run frontend       # serve frontend on port 8080
npm run backend        # start backend API
npm run backend:dev    # start backend with nodemon
npm run install:all    # install root and backend dependencies
npm --prefix backend run check
```

## Notes

- The frontend reads API data from `http://localhost:5000/api` by default.
- Override the frontend API URL by setting `window.APP_CONFIG = { API_BASE_URL: '...' }` before `js/api-service.js` loads.
- Backend routes fall back to mock data until real rows exist in the database tables.
