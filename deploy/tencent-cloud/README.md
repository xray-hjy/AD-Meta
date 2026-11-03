# AD-Meta 腾讯云部署交付包

本包用于把当前本地工作区的代码、已发布科研结果及配套文件部署到服务器。
以本文件、`database/source-state.json`、`database/backup-verification.json` 和本包校验报告为准。
旧的项目运行手册提供背景，不要照旧手册重新 bootstrap 数据。

## 包内内容

- `app/`：当前工作区代码（含未提交改动）、新构建的前端、raw/cache/derived/provenance 运行数据、GMrepo 数据。
- `database/ad-meta.sql.gz`：本机真实 MySQL 的全库逻辑备份，不是旧 SQLite 文件。
- `database/schema.sql`：同一次备份的空表结构，用于跨版本兼容性预检。
- `database/source-state.json`：逐表行数、当前发布修订、图表哈希、功能 SQLite 哈希及行数。
- `database/local-restore-test.json`：独立临时数据库恢复及已打包代码的接口测试结果。
- `deploy/`：隔离 Python、MySQL 恢复、运行文件校验、Nginx/systemd 模板与 R 安装脚本。
- `SERVER_AI_DEPLOY.md`：给服务器 AI 的部署任务和执行边界。
- `KNOWN_LIMITATIONS.md`：原机已存在的数据缺项及尚未在服务器验证的事项。
- `manifest.json`：每个交付文件的字节数与 SHA-256。

包中不含本机 `.env`、本机 MySQL/root/SSH 密码、Mac 虚拟环境、node_modules、R 编译库、上游生信运行环境。
不要把整个包放在 Nginx 的公开目录；公开目录仅为 `app/frontend/dist/` 的部署副本。
本包含科研结果和样本元数据，应作为私有部署材料传输与保管。

## 已知目标环境（来自用户提供的服务器盘点，执行前自行复核）

OpenCloudOS 9.6，2 核，3.6GiB 内存，1GiB swap，60GB 磁盘，约 52–54GB 可用。
宝塔 11.8 腾讯云专享版位于 `/www/server/panel`；`/www/wwwroot` 只有空默认目录。
已有 Python 3.11.6、Node 24.22.1、npm 11.19.1、git 2.43。
未安装 Nginx、MySQL、Docker；DSH 在 `127.0.0.1:3080`，宝塔在 8888，SSH 在 22。

部署方式：原生 Nginx + MySQL + 独立 Python 3.13 + systemd；随后恢复 R 4.5.2/Bioconductor 3.21。
已提供前端生产构建，无需在小服务器上执行 npm ci/build。
不安装 PHP、Redis、Java、Go 或整套上游生信工具。

## 0. 上传、解压并校验

先按 `UPLOAD_FROM_MAC.md` 上传压缩包与它的 `.sha256` 文件到服务器私有目录 `/root/admeta-upload/`。
以下操作都在服务器运行，除非特别注明。

```bash
cd /root/admeta-upload
sha256sum -c admeta-deploy-20261026.tar.gz.sha256
install -d -m 700 /root/admeta-unpack
```

解压目录下不应存在同名旧包；存在时先检查，不叠加不同快照。

```bash
tar -xzf admeta-deploy-20261026.tar.gz -C /root/admeta-unpack --no-same-owner
export AD_META_BUNDLE=/root/admeta-unpack/admeta-deploy-20261026
export AD_META_APP_ROOT=/www/wwwroot/ad-meta
python3 "$AD_META_BUNDLE/deploy/verify-bundle.py" "$AD_META_BUNDLE"
```

必须返回 `status: verified`。校验失败不继续执行 SQL 或安装脚本。
保持解压后的原包不变；渲染配置、日志、安装库和测试报告放在其他目录。

## 1. 复核环境并安装 Web/数据库服务

```bash
cat /etc/os-release
uname -m
free -h
df -h /
ss -lntp
command -v nginx mysql mysqld
dnf list --available nginx mysql-server mysql-community-server
```

如果没有现有 Nginx，优先通过系统受维护软件源安装 Nginx；如果通过宝塔安装，则使用宝塔的 Nginx 二进制、配置目录与服务，不再安装第二套。
系统源提供包时，可用：

```bash
dnf install -y nginx rsync curl ca-certificates tar gzip
```

MySQL 源版本为 **9.5.0**。优先使用同系列或按官方升级路径确认兼容的受维护版本。
系统源有合适的 `mysql-server` 时可安装该包；否则按 MySQL 官方 Yum 仓库说明选择明确版本并核对 OpenCloudOS 兼容性。
不要把 MariaDB 当作已验证的 MySQL 替代品，不要复制本机 MySQL 数据目录。
如果选择 MySQL 8.4/8.0，属于跨版本逻辑恢复，必须先执行下一节的 schema-only 空库预检；
本机同版本恢复测试不代表 8.x 或 Linux 上已经验证成功。

MySQL 官方参考：[Yum 仓库](https://dev.mysql.com/downloads/repo/yum/)、[升级路径](https://dev.mysql.com/doc/refman/8.4/en/upgrade-paths.html)。
安装渠道由服务器 AI 根据真实软件源决定；不要运行来源不明的一键安装脚本，也不要为了安装服务替换系统 Python 或宝塔 Python。

新建 MySQL 的配置需确认 `bind-address=127.0.0.1`；在确认被加载的独立配置段中，可先设置
`innodb_buffer_pool_size=256M`、`max_connections=40`，以后依据实测调整。
设置数据库服务开机启动，确认本机管理员可以通过 mysql 客户端认证。
新实例初始 root 凭据由安装器/管理员保管，不能输出到聊天、包目录或公开网页。

如果 mysql 管理员需要密码，创建服务器私有选项文件，例如 `/root/admeta-admin.cnf`，权限设为 600：

```ini
[client]
user=root
password=填写服务器本机的MySQL管理员密码
# host/socket 按实际安装方式设置，不使用开发电脑的连接信息
```

这个文件只在服务器本地创建，不会随本包交付。后续命令中的选项文件路径按实际替换。
若已有默认的本机 root 认证方式，可省略 `--defaults-extra-file`/`--admin-defaults-file`。

## 2. 在新空目录安装应用与 Python

确认 `/www/wwwroot/ad-meta` 尚不存在或只是本次部署的空目录；已有其他内容时先备份并换一个新目录，不覆盖。

```bash
install -d /www/wwwroot/ad-meta
rsync -a "$AD_META_BUNDLE/app/" "$AD_META_APP_ROOT/"
bash "$AD_META_BUNDLE/deploy/prepare-python.sh" "$AD_META_APP_ROOT"
```

该脚本创建 `admeta` 系统用户，在 `/opt/admeta-python` 安装独立 Python 3.13，并在应用目录创建 `.venv`。
不修改现有 Python 3.11、Node、DSH、SSH、宝塔服务。
服务器额外安装固定版本的 `cryptography` 与 `PyMySQL[rsa]`，支持 MySQL 的 `caching_sha2_password`/RSA 认证，
避免数据库重启后首次认证失败。参考 [PyMySQL 官方安装说明](https://pymysql.readthedocs.io/en/latest/user/installation.html)。
解释器和 Python/R 依赖需要服务器联网下载；本包不是包含全部 Linux 系统软件的离线镜像。

## 3. 先预检结构，再恢复真实数据库

创建一个全新的探测库，只恢复 `schema.sql`，不导入数据、不碰现有库。
下面的探测库名若已存在，换一个唯一的新名字，不使用 `IF NOT EXISTS` 来复用它。

```bash
mysql --defaults-extra-file=/root/admeta-admin.cnf -e 'CREATE DATABASE admeta_schema_probe_20261026 CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;'
mysql --defaults-extra-file=/root/admeta-admin.cnf admeta_schema_probe_20261026 < "$AD_META_BUNDLE/database/schema.sql"
```

任何 DDL、排序规则或语法错误都要先处理版本兼容性；不能加 `--force` 跳过，也不能删列、改原始科研数值或丢弃表。
预检成功后，只删除刚创建的这个空结构探测库：

```bash
mysql --defaults-extra-file=/root/admeta-admin.cnf -e 'DROP DATABASE admeta_schema_probe_20261026;'
```

正式恢复使用新的 `ad_meta_web` 库和专用账户 `admeta_web`：

```bash
"$AD_META_APP_ROOT/backend/.venv/bin/python" "$AD_META_BUNDLE/deploy/restore-database.py" \
  --bundle "$AD_META_BUNDLE" --app-root "$AD_META_APP_ROOT" \
  --database ad_meta_web --user admeta_web \
  --mysql-client /usr/bin/mysql --admin-defaults-file /root/admeta-admin.cnf
```

`/usr/bin/mysql` 替换为 `command -v mysql` 或宝塔实际客户端路径。
脚本会拒绝含表的目标库、已存在的同名账户或已有 `.env`，不覆盖、不改密码。
它自动生成服务器专用随机密码写入应用 `.env`（权限 600、归 `admeta`），不在输出中显示密码。
恢复后比对全部表行数与当前发布修订，结果写入 `/www/wwwroot/admeta-restore-result.json`。
失败时保留部分恢复状态和私有日志供诊断，不自动删库或重新导入。

**禁止执行 `bootstrap_storage`、`prepare_runtime`、`import_cohort` 或 `migrate_sqlite_to_mysql` 来代替本次恢复。**
本包已经包含当前发布和 MAG 功能索引；重导入可能重算结果、改变修订、耗尽内存或依赖尚未安装的 R。

## 4. 数据迁移与文件校验

先执行只读核验：

```bash
runuser -u admeta -- "$AD_META_APP_ROOT/backend/.venv/bin/python" "$AD_META_BUNDLE/deploy/verify-runtime.py" \
  --app-root "$AD_META_APP_ROOT" --source-state "$AD_META_BUNDLE/database/source-state.json"
```

核对当前发布修订、当前图表文件和不可变功能索引。旧修订既有缺项在 `KNOWN_LIMITATIONS.md` 中单列，不能把它伪装成新部署成功恢复的内容。
再从后端目录执行当前代码需要的 Alembic 迁移，以及 GMrepo 只读校验：

```bash
cd "$AD_META_APP_ROOT/backend"
runuser -u admeta -- .venv/bin/python -m alembic upgrade head
runuser -u admeta -- .venv/bin/python -m app.cli.install_gmrepo --check
runuser -u admeta -- .venv/bin/python -m app.cli.validate_mag --dataset prjca022804-ad-nc
```

如果相同版本数据库没有新的迁移，Alembic 应不改变数据发布。
GMrepo 异常时检查实际文件和 manifest，不覆盖已存在的数据目录。

## 5. 启动 API 和 Nginx 私有测试入口

```bash
python3 "$AD_META_BUNDLE/deploy/render-configs.py" --app-root "$AD_META_APP_ROOT" --output /root/admeta-config-20261026
```

先检查系统是否已有同名 systemd unit；新服务器没有时安装本次生成的文件：

```bash
install -m 644 /root/admeta-config-20261026/admeta-api.service /etc/systemd/system/admeta-api.service
systemctl daemon-reload
systemctl enable --now admeta-api
systemctl status admeta-api --no-pager
curl --fail --show-error http://127.0.0.1:8000/api/health/ready
```

初期只有 1 个 Uvicorn worker，BLAS/OMP 使用单线程。没有 R 时 `.env` 中 worker URL 留空；
此时可以浏览已发布结果，但不能称为正式统计能力已启用。

将 `/root/admeta-config-20261026/nginx-private.conf` 安装到本次实际 Nginx 的站点目录：

- 系统 Nginx 通常为 `/etc/nginx/conf.d/admeta.conf`；
- 宝塔 Nginx 通常为 `/www/server/panel/vhost/nginx/admeta.conf`。

只选择真实使用的一套。先检查全局 `include`，不要同时创建两份同端口站点。
该配置只监听 `127.0.0.1:8080`，静态根目录固定为 `frontend/dist`，`/api/` 保留路径代理到 8000。
不把数据库备份、源码、`.env` 或 raw 数据目录直接映射成静态下载目录。
如果系统新安装的 Nginx 带默认公网站点，先保存其原配置并限制该新默认站点，避免测试期间意外公开默认入口。

执行实际 Nginx 的 `-t` 后再启动/重载，并配置开机启动。系统包示例：

```bash
nginx -t
systemctl enable --now nginx
systemctl reload nginx
curl --fail --show-error http://127.0.0.1:8080/api/health/ready
```

宝塔安装时换用其实际二进制与服务管理方式。不关闭 SELinux；遇到拒绝时查看 AVC 与 Nginx 日志，按目录或代理需要配置。

## 6. 验收当前网站

```bash
curl --fail --show-error http://127.0.0.1:8080/api/datasets
curl --fail --show-error http://127.0.0.1:8080/api/analysis-runs
curl --fail --show-error http://127.0.0.1:8080/api/references/gmrepo/catalog
curl --fail --show-error http://127.0.0.1:8080/api/references/gmrepo/comparison-catalog
curl --fail --show-error http://127.0.0.1:8080/api/mag/datasets
curl --fail --show-error http://127.0.0.1:8080/api/mag/functions/overview
curl --fail --show-error -I http://127.0.0.1:8080/analysis/mag
```

`/api/internal/metrics` 经 Nginx 应返回 404。不能只看首页或 `/health/live` 就宣布完成。
用户在 Mac 上使用隧道查看：

```bash
ssh -N -L 18080:127.0.0.1:8080 root@106.53.116.51
```

Mac 浏览器打开 `http://127.0.0.1:18080`。检查首页、物种/KO、DiTing、MAG、GMrepo、原表下载和深层链接刷新。

## 7. 恢复 R 统计能力

只有基础浏览验收通过后，再单独执行：

```bash
bash "$AD_META_BUNDLE/deploy/install-r-worker.sh" "$AD_META_APP_ROOT"
```

脚本安装 R 4.5.2、恢复锁定的 renv/Bioconductor 3.21，并运行模型 smoke test。
Linux 系统依赖包名须以真实软件源为准；缺包时处理实际依赖，不跳过失败。
4GB 内存编译采用单线程，禁止同时跑 MAG 重导入或其他大任务；`Killed` 时检查内核 OOM 记录。
依赖下载/编译完成之前，状态只能报告“R 环境安装中”。

模型 smoke test 通过后，安装生成的 `admeta-stats.service`，执行：

```bash
install -m 644 /root/admeta-config-20261026/admeta-stats.service /etc/systemd/system/admeta-stats.service
systemctl daemon-reload
systemctl enable --now admeta-stats
curl --fail --show-error http://127.0.0.1:8001/health
```

用文件工具只修改服务器 `.env` 中这一项，不输出其他行或密码：

```dotenv
AD_META_STATS_WORKER_URL=http://127.0.0.1:8001
```

```bash
systemctl restart admeta-api
curl --fail --show-error http://127.0.0.1:8000/api/health/ready
```

应确认 `statisticsWorker.enabled` 和 `ok` 都为 true，并保留 smoke test 的成功日志。

## 8. 域名与 HTTPS

当前未提供域名或备案状态。先完成上述私有入口验收，再根据用户提供的域名接入。
中国大陆实例对外提供网站前按腾讯云要求完成相应备案；不要以更换端口或 IP 方式绕过。
域名 A 记录指向服务器，宝塔/实际 Nginx 绑定域名，部署证书并设置续期，再开放必要的 80/443。
如果仅供团队访问，在接入层配置认证并覆盖页面与全部 `/api/`。
不开放 3306、8000、8001、8080；保留现有 SSH、宝塔和 DSH 的访问方式。

## 9. 最终汇报与恢复路径

在 `/root/admeta-deployment-report.md` 记录：系统与软件版本、MySQL 备份/恢复校验、部署路径、服务开机启动、
各接口状态、R 模型测试状态、访问方法、域名/HTTPS 状态、原有缺项与新增失败（分别说明）。
报告不得包含密码或 `.env` 全文。

定期将 MySQL、匹配的 `storage/derived`、raw/provenance、GMrepo 数据、服务器 `.env` 和服务配置备份到服务器以外。
本次只新建 `ad_meta_web`、`admeta_web`、`admeta-api`、`admeta-stats` 和本应用目录；
回滚时只处理确由本次创建的目标，保留 SQL 与数据副本，不改动其他服务。
模板语法检查、本机恢复/接口测试与目标 Linux 验收是不同证据，最后汇报须明确区分。
