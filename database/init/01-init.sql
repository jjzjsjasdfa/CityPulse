-- 该脚本只在 Docker 数据卷第一次创建时运行。
-- 正式的业务表结构后续由 Alembic 迁移管理。

CREATE EXTENSION IF NOT EXISTS postgis;

SELECT format('CREATE DATABASE events_test OWNER %I', current_user)
WHERE NOT EXISTS (
    SELECT 1 FROM pg_database WHERE datname = 'events_test'
)
\gexec

\connect events_test

CREATE EXTENSION IF NOT EXISTS postgis;
