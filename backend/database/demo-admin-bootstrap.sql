-- Run this once with a PostgreSQL admin/superuser account.
-- It only creates the three isolated demo databases and a SELECT-only reader role.
-- Do not run this against a production server unless these demo databases are intended there.

-- If the application owner role already exists, keep the existing role and skip this line.
-- CREATE ROLE kucsgenai_dashboard_app LOGIN PASSWORD '<app-password>';

-- Use a real password, then put the same value in SOURCE_PG_PASSWORD or
-- DEMO_SOURCE_READER_PASSWORD when running the demo sync.
CREATE ROLE kucsgenai_demo_reader LOGIN PASSWORD '<reader-password>';

CREATE DATABASE kucsgenai_source_demo OWNER kucsgenai_dashboard_app;
CREATE DATABASE dify_source_demo OWNER kucsgenai_dashboard_app;
CREATE DATABASE kucsgenai_dashboard_demo OWNER kucsgenai_dashboard_app;

