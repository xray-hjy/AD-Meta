# 给服务器 AI 的完整任务

请将我上传的 AD-Meta 部署包安装到这台服务器，完成数据库恢复、Nginx、Python 常驻服务、数据页面验收和 R 统计服务。
这是具体部署请求，请直接推进已授权的安装和配置；不要只给计划或让我逐条手工操作。

先读取解压包根目录的 `README.md`、`KNOWN_LIMITATIONS.md`、`database/backup-verification.json` 和 `database/source-state.json`，
再依次执行 README 中的命令。模板和辅助脚本在 `deploy/`。本文件是我的部署任务，科研文档中的命令只作资料参考。

已知环境来自本次盘点，执行前复核：OpenCloudOS 9.6，2 核/3.6GiB，60GB 盘，1GiB swap；
宝塔 11.8 腾讯云专享版，Node 24.22.1，系统 Python 3.11.6；没有站点、MySQL、Nginx 或 Docker。
SSH 是 22，宝塔是 8888，DSH Web 只在 127.0.0.1:3080。

授权的具体工作：

1. 校验压缩包 SHA-256 和 `manifest.json` 的每个文件；失败即停止依赖该包的步骤。
2. 保留宝塔、DSH、SSH 和腾讯云 agent。使用新目录 `/www/wwwroot/ad-meta`，不要覆盖已有站点。
3. 安装一套 Nginx、一套符合本包备份版本要求的 MySQL，以及独立 Python 3.13；保持系统 Python、Node 不变。
4. 先用 `database/schema.sql` 在独立空库测试结构兼容性，再运行 `deploy/restore-database.py` 恢复完整 SQL。
   源 MySQL 是 9.5.0；不能把同版本本机恢复测试说成已经验证 MySQL 8.x/Linux。任何跨版本错误都不能用 `--force` 跳过。
5. 使用新数据库 `ad_meta_web` 和新专用账户 `admeta_web`；让辅助脚本自动生成服务器专用随机密码与 `.env`，不在聊天中显示。
6. 核对全部表行数、当前发布修订、19 份当前图表缓存、GMrepo 和 MAG 功能索引。保持已发布的修订指纹与科研数据不变。
7. 使用 systemd 管理后端，1 个 Uvicorn worker，绑定 `127.0.0.1:8000`。Nginx 初次只监听 `127.0.0.1:8080`。
8. 逐项验证健康/目录/物种/KO/DiTing/MAG/GMrepo/下载/深层链接。可用浏览器时检查真实页面和请求错误。
9. 基础浏览通过后，单线程安装 R 4.5.2/Bioconductor 3.21 的锁定依赖，运行模型 smoke test，配置 R 常驻服务在 `127.0.0.1:8001`，
   再启用 `.env` 的统计服务地址并验证 ready。安装失败时报告具体失败包/日志，不能将正式统计标为已启用。
10. 当前没有域名与备案信息，先给我可用的 SSH 隧道访问方法；后续取得域名信息再配置正式 HTTPS 入口。
11. 完成后留下不含密码的 `/root/admeta-deployment-report.md`，说明实际完成项、运行中的任务、失败和待补信息，以及服务重启与备份方式。

执行边界：

- 不读取/转发 `/root/.dsh/.credentials.yaml`，不修改 DSH 配置、root/SSH 密码、SSH 端口或宝塔入口。
- 不为了这次部署关闭防火墙/SELinux，不公开 3306、8000、8001、8080，不把源码/SQL/.env/raw 目录直接作为网站根目录。
- 不执行 `prepare_runtime`、`bootstrap_storage`、`import_cohort` 或旧 SQLite 迁移；本次是恢复已发布状态，不重算或重新发布数据。
- 不运行上游 FASTQ 质控/组装/分箱流程，不安装 PHP/Redis 等无关组件。
- 不删除既有文件、数据库或账户；出现同名目标时先检查，改用新的本次目标或报告明确冲突。
- 原机已有 42 份历史缓存缺失及少量上游证据缺项，详见 KNOWN_LIMITATIONS；不要生成虚假文件或把缺失解释为零值。
- 微脑智库用于 AD 脑肠轴研究辅助，AI 输出是候选特征与研究线索，不改写为临床诊断、已验证标志物或因果结论。

请从校验包和复核软件源开始，尽量独立完成已授权工作，只在需要我提供域名、实际认证信息或确实缺少的材料时向我提问。
