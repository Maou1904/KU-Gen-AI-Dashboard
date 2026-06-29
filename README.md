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

The backend uses three PostgreSQL databases:

- `kucsgenai_dashboard_test`: isolated test target
- `kucsgenai`: read-only source
- `dify`: read-only source

1. Copy `backend/.env.example` to `backend/.env`.
2. Update these values:

```env
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=your-local-postgres-password
DASHBOARD_DB_NAME=kucsgenai_dashboard_test
KUCSGENAI_DB_NAME=kucsgenai
DIFY_DB_NAME=dify
RUN_MIGRATIONS=true
```

3. Apply the reviewed schema:

```bash
npm --prefix backend run migrate
```

4. Start the backend and open the isolated sync console:

- `http://localhost:8080/sync-test.html`

The schedule is disabled by default. Use `Run Now` for the first test.

## Useful Scripts

```bash
npm start              # same as npm run frontend
npm run frontend       # serve frontend on port 8080
npm run backend        # start backend API
npm run backend:dev    # start backend with nodemon
npm run install:all    # install root and backend dependencies
npm --prefix backend run check
npm --prefix backend run migrate
npm --prefix backend run sync:once
```

## Notes

- The frontend reads API data from `http://localhost:5000/api` by default.
- Override the frontend API URL by setting `window.APP_CONFIG = { API_BASE_URL: '...' }` before `js/api-service.js` loads.
- Backend routes fall back to mock data until real rows exist in the database tables.
