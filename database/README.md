# 数据库初始化

`init/01-init.sql` 用于新的 PostgreSQL/PostGIS Docker 数据卷：启用 PostGIS，并创建 `events_test` 测试数据库。业务表由 `backend/alembic` 迁移维护。

项目根目录的 `compose.yml` 已挂载此初始化目录。该脚本只在首次创建空数据卷时运行，不会修改已有数据卷，也不包含本地数据库数据或密码。

临时的 200 条活动仍由 `backend/scripts/run_demo.py` 提供，无需启动 PostgreSQL。
