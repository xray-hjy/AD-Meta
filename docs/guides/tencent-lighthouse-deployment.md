# 腾讯云轻量应用服务器部署：OpenCloudOS 9 + 宝塔

适用场景：将当前 Mac 上的 AD-Meta 代码、已发布数据库和配套文件迁移到一台服务器。
本文按 2026-10-24 的代码核对。截图配置为 2 核、4GB 内存、60GB SSD、5Mbps，镜像已包含宝塔。
下文提供操作步骤，尚未连接服务器执行或验证服务器环境。

## 1. 部署方式与顺序

采用宝塔管理 Nginx 和 MySQL，使用 systemd 管理 Python 后端和 R 统计服务。
前端在 Mac 上构建为静态文件，服务器不必长期运行 Node.js。

```text
浏览器 → Nginx
          ├─ 页面、JS、CSS → frontend/dist/
          └─ /api/ → FastAPI 127.0.0.1:8000
                       ├─ MySQL 127.0.0.1:3306
                       ├─ backend/storage/ 和 ADMetaData/
                       └─ R worker 127.0.0.1:8001
```

建议先按「迁移现有数据库」路线验证浏览、筛选、下载，再安装 R worker 恢复完整统计能力。
这台机器可以先尝试小规模演示，实际承载能力须以运行时内存、响应时间和并发测试为准。
首次 R 依赖编译、MAG 重导入和模型计算可能超过现有内存；不要同时执行这些工作。
上游 FASTQ 质控、组装、分箱等完整生信流程不属于本次网站部署。

项目当前要求：Python 按 CI 使用 3.13；本地前端构建使用 Node.js 22.12.0 或更新的受维护版本；
MySQL 要求 8.0+；统计服务的锁文件为 R 4.5.2 / Bioconductor 3.21。

本文中的 `服务器公网IP`、`你的本地数据库用户`、`你的数据库密码`、`你的已备案域名` 都需要替换。
每个代码块标有执行地点。发生错误时先处理该步，不要继续执行后面的导入和发布命令。

## 2. 登录腾讯云与宝塔

1. 在腾讯云控制台重置截图中已经暴露的服务器登录密码，不必将新密码发到聊天里。
2. 打开「轻量应用服务器 → 目标实例 → 应用管理」，使用该实例提供的宝塔登录入口。
   宝塔面板账号与服务器 SSH 的 root 账号是两套账号。
3. 在宝塔软件商店安装或确认已有 Nginx、MySQL 8.x。此项目不需要 PHP、FTP、phpMyAdmin 或 Redis。
4. 在腾讯云为这台新服务器创建一次快照，保留部署前状态。

腾讯云宝塔镜像提供应用管理中的免密或密码登录入口，面板实际端口、安全入口以控制台为准。
见[腾讯云宝塔镜像说明](https://cloud.tencent.com/document/product/1207/54078)。

初次测试先保留 SSH 访问和面板访问，来源限制为自己的公网 IP；检查已有宽泛放行规则，避免重复规则使限制失效。
测试阶段使用后文 SSH 隧道，不需要对公网开放网站端口。
正式发布时才按需要放行 TCP 80、443。3306、8000、8001 不应对公网开放。
同时检查腾讯云实例防火墙与宝塔内的系统防火墙，不能只修改其中一层。

如果实例在中国大陆，正式对外提供网站服务前应完成相应 ICP 备案，使用 IP 地址也不是正式发布的豁免方式。
截图未显示地域，先在实例详情确认。
下面的隧道用于自己验证部署；正式公开访问另按第 12 节处理。
见[腾讯云备案场景](https://cloud.tencent.com/document/product/243/18910)。

## 3. 确定要迁移的内容

本项目不能只上传 `frontend/dist/`，也不能只从 GitHub 拉取代码。
当前工作区有未提交的代码、元数据和原始数据修改，另外若干运行目录被 Git 忽略。

需要一起保存：

| 内容 | 用途 |
| --- | --- |
| 当前项目源码，含 `backend/metadata/`、`backend/storage_manifest.json` | 当前代码与数据绑定关系 |
| 本机实际在用的 MySQL 数据库逻辑备份 | 已发布分析、队列修订与关联记录 |
| `backend/storage/raw/` | 原始表格、MAG 输入和原表下载 |
| `backend/storage/cache/` | 已发布图表缓存；首次迁移先完整保留 |
| `backend/storage/derived/` | MAG 功能查询使用的不可变 SQLite 派生库 |
| `backend/storage/provenance/` 及其余运行数据目录 | 来源记录与已保存的分析产物 |
| `ADMetaData/` | GMrepo 参考数据、来源材料与已保存快照 |
| `data-packages/` | 固定版本的 GMrepo 安装包 |
| 新构建的 `frontend/dist/` | 实际提供给浏览器的页面 |

本次本地盘点：`backend/storage/` 约 2.4GB，其中 `derived/` 约 737MB；`ADMetaData/` 约 155MB。
这些数字不包含 MySQL 服务自身的数据文件，也不代表服务器最终占用。
MySQL 数据通常在项目文件夹外，普通文件上传不会自动带走它。
不要把现存的 `backend/storage/ad_meta.sqlite3` 自动当成当前 MySQL 的完整备份。

不要迁移 Mac 的 `backend/.venv/`、`node_modules/`、R 已安装库、`.tmp/` 或本机 `.env`；在服务器重新安装或配置。
保留源码、锁文件、输入数据与发布产物即可。科研原始文件不要放到网站公开目录。

## 4. 在服务器准备项目目录

**执行地点：Mac 终端。** 使用腾讯云控制台重置后的密码登录；输入密码时终端不显示字符是正常现象。

```bash
ssh root@服务器公网IP
```

**执行地点：服务器终端，root。** 先查看实际系统和资源。

```bash
cat /etc/os-release
uname -m
free -h
df -h /
```

本教程使用 `/www/wwwroot/ad-meta`。先在宝塔文件管理确认它没有现有网站或其他数据；若已被使用，改选一个全新的目录，并同步修改后文路径。

```bash
dnf install -y rsync curl ca-certificates tar gzip
mkdir -p /www/wwwroot/ad-meta
```

如果尚无 `admeta` 系统用户，创建专门运行应用的用户；已有同名用户时先确认它的用途，不重复创建。

```bash
useradd --system --create-home --home-dir /var/lib/admeta --shell /sbin/nologin admeta
```

## 5. 在 Mac 构建前端并上传当前文件

**执行地点：Mac 的另一个终端。** 先检查 Node 版本。

```bash
cd /Users/x-ray/Desktop/ad-meta
node --version
npm --version
```

当前本机默认命令行曾解析到 Node 16，低于项目要求。若仍是该版本，可以在这个终端使用本机已经存在的 Codex Node 运行时：

```bash
export PATH="/Users/x-ray/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
node --version
```

上述路径是本机运行时位置；若不存在，安装受维护的 Node.js 22.12.0+ 后重新检查版本。
构建时保持 API 为同源相对路径，清空可能遗留的 API 域名配置：

```bash
npm ci --prefix frontend
VITE_API_BASE_URL='' npm run build
test -f frontend/dist/index.html
```

本次教程准备时已成功构建当前前端，产物在 `frontend/dist/`，约 7.1MB。源码变更后需重新构建。

上传前暂停本机的新导入、修订发布和分析任务，直到数据库导出和文件上传结束，避免两者来自不同状态。
上传当前工作目录，包含忽略的运行数据与新构建的前端。结尾的 `/` 请保留。
以下命令适用于首次部署到前面准备的新目录，不包含 `--delete`。

```bash
rsync -av --progress \
  --exclude='.git/' \
  --exclude='.env*' \
  --exclude='node_modules/' \
  --exclude='.venv/' \
  --exclude='.tmp/' \
  --exclude='__pycache__/' \
  --exclude='.pytest_cache/' \
  --exclude='.mypy_cache/' \
  --exclude='.ruff_cache/' \
  --exclude='coverage/' \
  --exclude='frontend/output/' \
  --exclude='/external/' \
  --exclude='/easymetagenome_run/' \
  --exclude='/图片/' \
  --exclude='/design-assets/' \
  --exclude='/*.psd' \
  --exclude='stats-worker/.Rprofile' \
  --exclude='stats-worker/renv/library/' \
  --exclude='stats-worker/renv/staging/' \
  --exclude='stats-worker/renv/cache/' \
  --exclude='.DS_Store' \
  --exclude='._*' \
  /Users/x-ray/Desktop/ad-meta/ \
  root@服务器公网IP:/www/wwwroot/ad-meta/
```

此时服务器应用尚未运行。上述命令排除了不参与网站运行的上游工具与设计目录。
若后续更新已运行的服务器，不要原样再次覆盖全部运行目录，见第 13 节。

## 6. 创建服务器 MySQL 数据库与配置文件

**执行地点：宝塔面板。** 在「数据库」中新建一个空库，例如 `ad_meta`，创建专用账户 `ad_meta`，设置单独的随机密码，访问范围设为本机。
若已有同名数据库，先检查用途；不要导入覆盖现有库，改用新库名。
使用面板中维护中的 MySQL 8.x 版本，启动服务并设置开机启动。

**执行地点：服务器宝塔文件管理。** 在 `/www/wwwroot/ad-meta/.env` 新建以下内容：

```dotenv
AD_META_ENVIRONMENT=production
AD_META_DB_ENGINE=mysql
AD_META_MYSQL_HOST=127.0.0.1
AD_META_MYSQL_PORT=3306
AD_META_MYSQL_USER=ad_meta
AD_META_MYSQL_PASSWORD='你的数据库密码'
AD_META_MYSQL_DATABASE=ad_meta
AD_META_STATS_WORKER_URL=
AD_META_MAG_DATASET=prjca022804-ad-nc
AD_META_GMREPO_DATA_ROOT=ADMetaData/reference/gmrepo/processed/2026-10-09-v1
```

`AD_META_STATS_WORKER_URL` 暂留空，仅适用于下一节「恢复已有已发布数据库」路线。
第 11 节安装 R 后再启用。这里的数据库密码与 SSH、宝塔面板密码分别配置。
`production` 模式下代码明确拒绝使用 MySQL root 账户或空密码。
后端会自己加载项目根目录的 `.env`，不需要执行 `source .env`。

不要将 `.env` 或数据库备份放入 `frontend/dist/`。运行目录与数据库文件需允许应用用户访问：

```bash
chown -R admeta:admeta /www/wwwroot/ad-meta
chmod 600 /www/wwwroot/ad-meta/.env
```

## 7. 恢复数据：推荐迁移已发布的 MySQL

**执行地点：Mac 终端。** 本机 MySQL 正常运行后，使用本机 `.env` 对应的数据库地址、端口、用户名和库名导出。
下面按 `127.0.0.1:3306 / ad_meta` 举例，`-p` 会提示输入本机数据库密码。
导出时不要同时运行导入、数据库迁移或修订发布。

```bash
umask 077
mysqldump \
  -h 127.0.0.1 -P 3306 -u 你的本地数据库用户 -p \
  --single-transaction --quick --no-tablespaces \
  --set-gtid-purged=OFF --column-statistics=0 \
  --result-file=/private/tmp/admeta-deploy.sql \
  ad_meta
```

必须确认导出命令成功退出，并检查备份不是空文件；命令报错留下的文件不能当成成功备份。
如果找不到 `mysqldump`，使用本机 MySQL 安装目录中的客户端，不要因此改用旧 SQLite 文件。

```bash
test -s /private/tmp/admeta-deploy.sql
shasum -a 256 /private/tmp/admeta-deploy.sql
scp -p /private/tmp/admeta-deploy.sql root@服务器公网IP:/root/admeta-deploy.sql
```

**执行地点：服务器终端，root。** 对照 Mac 输出核对 SHA-256，然后只向第 6 节新建的空库恢复。
`mysql` 若不在 PATH，宝塔通常安装在 `/www/server/mysql/bin/mysql`，以实际路径为准。

```bash
sha256sum /root/admeta-deploy.sql
mysql -h 127.0.0.1 -P 3306 -u ad_meta -p ad_meta < /root/admeta-deploy.sql
```

这一操作会执行备份里的建表和数据语句，不能用于覆盖不明用途的已有库。
恢复后保留私有备份，并在宝塔数据库管理中确认表和数据已出现。

本次文档准备时只能确认配置选用 MySQL，当前执行环境未能建立本机数据库连接；
没有完成或生成真实 MySQL 备份，也没有核对当前库中的行数。导出和恢复需要实际成功后才算完成。

**新建数据库的另一条路线：** 如果不迁移历史发布记录，可以从原始文件重新导入。
必须先完成 Python 安装和第 11 节的 R worker 安装、启动与模型测试，配置好 worker URL，然后在服务器执行：

```bash
cd /www/wwwroot/ad-meta/backend
runuser -u admeta -- .venv/bin/python -m app.cli.install_gmrepo
runuser -u admeta -- .venv/bin/python -m app.cli.prepare_runtime
runuser -u admeta -- .venv/bin/python -m app.cli.validate_mag --dataset prjca022804-ad-nc
```

当前物种与 KO 的导入会调用正式差异统计；worker 不可用时可能失败，不能把它当成可省略的后台服务。
`prepare_runtime` 还可能根据已有原始文件执行首次 MAG 导入，耗时和内存应单独观测。
此路线生成新的导入结果，不等同于恢复原来的所有发布修订、缓存和评估记录。
不要先向空库运行初始化，再把旧库 SQL 覆盖进去。两条路线选择一条。

## 8. 在服务器安装 Python 3.13

**执行地点：服务器终端，root。** 使用独立 Python 安装目录，不替换系统 Python 或宝塔自身的 Python 环境。
下面按 uv 官方安装方式安装工具，再下载 Python；依赖下载需要服务器能连接对应源。
见 [uv 安装](https://docs.astral.sh/uv/getting-started/installation/)、[Python 管理](https://docs.astral.sh/uv/guides/install-python/)。

```bash
curl -LsSf https://astral.sh/uv/install.sh -o /tmp/admeta-install-uv.sh
UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh /tmp/admeta-install-uv.sh
/usr/local/bin/uv --version
```

```bash
export UV_PYTHON_INSTALL_DIR=/opt/admeta-python
/usr/local/bin/uv python install 3.13
cd /www/wwwroot/ad-meta
/usr/local/bin/uv venv --python 3.13 backend/.venv
/usr/local/bin/uv pip install --python backend/.venv/bin/python -r backend/requirements.txt
backend/.venv/bin/python --version
/usr/local/bin/uv pip check --python backend/.venv/bin/python
runuser -u admeta -- backend/.venv/bin/python --version
```

使用 `/opt/admeta-python` 是为了让 `admeta` 用户能访问解释器，避免虚拟环境指向 `/root` 私有目录。
安装失败时检查下载或缺少的二进制依赖，不要直接降低 requirements 中的版本。
若该项目目录已存在虚拟环境，先确认用途，不直接重建覆盖。

迁移旧库后，在服务器对这份代码执行数据库迁移并校验 GMrepo：

```bash
cd /www/wwwroot/ad-meta/backend
runuser -u admeta -- .venv/bin/python -m alembic upgrade head
runuser -u admeta -- .venv/bin/python -m app.cli.install_gmrepo --check
```

如果默认 GMrepo 目录完全不存在，可以先运行不带 `--check` 的安装命令；安装器拒绝覆盖已有异常目录。
第一次恢复已有数据后，先做接口验证，不要为解决访问问题直接运行 `bootstrap_storage` 重算数据。

## 9. 将 Python 后端设置为常驻服务

**执行地点：服务器宝塔文件管理或终端，root。** 新建 `/etc/systemd/system/admeta-api.service`：

```ini
[Unit]
Description=AD-Meta FastAPI
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=admeta
Group=admeta
WorkingDirectory=/www/wwwroot/ad-meta/backend
Environment=PYTHONUNBUFFERED=1
Environment=OPENBLAS_NUM_THREADS=1
Environment=OMP_NUM_THREADS=1
Environment=MKL_NUM_THREADS=1
ExecStartPre=/www/wwwroot/ad-meta/backend/.venv/bin/python -c "from app.core.database import get_engine; get_engine().connect().close()"
ExecStart=/www/wwwroot/ad-meta/backend/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`ExecStartPre` 在数据库尚不可连接时让启动失败并重试，避免进程先启动、数据库迁移却失败。
确认宝塔的 MySQL 已设置开机启动。初期只使用一个 Uvicorn worker；是否增加并发以后再按实测决定。

```bash
systemctl daemon-reload
systemctl enable --now admeta-api
systemctl status admeta-api --no-pager
journalctl -u admeta-api -n 60 --no-pager
curl --fail --show-error http://127.0.0.1:8000/api/health/live
curl --fail --show-error http://127.0.0.1:8000/api/health/ready
```

`live` 只证明进程活着。`ready` 还检查数据库、迁移、图表缓存、已发布分析，以及已配置的统计 worker。
`ready` 必须返回 HTTP 200 和 `status: ready`；503 时读取各 `components` 定位原因。
迁移旧数据库时若出现旧机器的绝对路径，应逐类核对数据库路径与已复制文件，保留备份后处理；不要全库字符串替换，也不要把重导入当作默认修复。

## 10. 在宝塔配置 Nginx，先用隧道测试

**执行地点：宝塔面板。** 新建一个专用于本项目的静态站点。
如果面板将静态站点归在「PHP 项目」下，创建时选择「纯静态」，不创建 FTP，不重复创建数据库。
站点目录设为 `/www/wwwroot/ad-meta/frontend/dist`，不能设为整个项目目录。

备份这个新站点自动生成的配置，在它的「配置文件」中使用下面的测试配置。
仅修改这个新站点，不覆盖 Nginx 全局配置或其他站点。

```nginx
server {
    listen 127.0.0.1:8080;
    server_name localhost 127.0.0.1;
    root /www/wwwroot/ad-meta/frontend/dist;
    index index.html;

    location ^~ /api/internal/ {
        return 404;
    }

    location ^~ /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 360s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

`proxy_pass` 这里没有尾部 `/`，使 `/api/…` 原样到达后端。
`try_files` 允许刷新 `/analysis/mag` 等前端深层路径。
同源访问不需要将 `VITE_API_BASE_URL` 写成服务器的 `127.0.0.1`，浏览器中的该地址会指向访问者自己的电脑。
见 [Nginx 代理规则](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)、[静态文件与回退](https://docs.nginx.com/nginx/admin-guide/web-server/serving-static-content/)。

保存并在宝塔重载 Nginx。可以先在服务器检查：

```bash
/www/server/nginx/sbin/nginx -t
curl --fail --show-error http://127.0.0.1:8080/api/health/ready
```

**执行地点：Mac 终端。** 保持下列 SSH 命令运行：

```bash
ssh -N -L 18080:127.0.0.1:8080 root@服务器公网IP
```

Mac 浏览器打开 `http://127.0.0.1:18080`。这是通过 SSH 访问服务器，不是 Mac 本机的开发服务。
不需要向公网开放 8080。
依次检查首页、分析目录、物种与 KO 图表、DiTing 通路、MAG 概览与功能页、GMrepo 页面、原表下载和刷新深层链接。

服务器接口检查示例：

```bash
curl --fail --show-error http://127.0.0.1:8080/api/datasets
curl --fail --show-error http://127.0.0.1:8080/api/analysis-runs
curl --fail --show-error http://127.0.0.1:8080/api/references/gmrepo/catalog
curl --fail --show-error http://127.0.0.1:8080/api/references/gmrepo/comparison-catalog
curl --fail --show-error http://127.0.0.1:8080/api/mag/datasets
curl --fail --show-error http://127.0.0.1:8080/api/mag/functions/overview
```

`ready` 不覆盖所有科研数据模块；这些接口与浏览器检查也要通过。
如有个别模块本来没有数据，应核对迁移前状态，不能用空数据替代缺失文件。

## 11. 安装 R worker，恢复完整统计能力

恢复已有发布结果后，可先读缓存和数据库浏览页面；新的正式差异统计及需要它的重导入还需要 R worker。
当前锁文件要求 R 4.5.2 / Bioconductor 3.21，Mac 的编译库不能复制到 Linux 直接使用。

若服务器已有可用 R 4.5.2，确认其绝对路径后跳过源码安装部分，并相应修改后面的 Rscript 路径。
以下是独立安装到 `/opt/R/4.5.2` 的源码方案，尚未在这台服务器实测。
参考 [R 安装手册](https://cran.r-project.org/doc/manuals/r-release/R-admin.html)。

**执行地点：服务器终端，root。** 准备编译依赖；软件包名称以实际 OpenCloudOS 9 仓库为准。
如果提示缺包，先处理依赖，不跳过错误。

```bash
dnf install -y gcc gcc-c++ gcc-gfortran make cmake patch perl bison \
  readline-devel zlib-devel bzip2-devel xz-devel pcre2-devel \
  libcurl-devel openssl-devel libxml2-devel libicu-devel \
  libpng-devel libjpeg-turbo-devel libtiff-devel \
  fontconfig-devel freetype-devel harfbuzz-devel fribidi-devel \
  blas-devel lapack-devel gmp-devel mpfr-devel gsl-devel pkgconf-pkg-config
mkdir -p /opt/admeta-build
cd /opt/admeta-build
curl -fL https://cran.r-project.org/src/base/R-4/R-4.5.2.tar.gz -o R-4.5.2.tar.gz
tar -xzf R-4.5.2.tar.gz
cd R-4.5.2
./configure --prefix=/opt/R/4.5.2 --enable-R-shlib --with-x=no
make -j1
make install
/opt/R/4.5.2/bin/Rscript --version
```

4GB 环境先单线程编译。若日志出现 `Killed`，结合 `free -h` 和 `journalctl -k` 确认是否内存不足；
停止并行工作，再评估扩容或在兼容 Linux 环境准备依赖，不能只靠反复重试。
系统依赖列表不能保证覆盖锁文件全部包的编译需求；以实际失败包的安装日志补齐。

安装 renv，然后以应用用户恢复项目库：

```bash
/opt/R/4.5.2/bin/Rscript --vanilla -e 'install.packages("renv", repos = "https://cloud.r-project.org")'
cd /www/wwwroot/ad-meta/stats-worker
runuser -u admeta -- sh -c 'printf "%s\n" "source(\"renv/activate.R\")" > .Rprofile'
runuser -u admeta -- env R_USER=/var/lib/admeta MAKEFLAGS=-j1 \
  /opt/R/4.5.2/bin/Rscript -e 'renv::restore(project = ".", lockfile = "renv.lock", prompt = FALSE)'
runuser -u admeta -- env R_USER=/var/lib/admeta \
  /opt/R/4.5.2/bin/Rscript tests/model_smoke.R
```

首次下载和编译可能较久，不要在模型测试失败时直接宣称统计服务已部署成功。
配置文件 `/etc/systemd/system/admeta-stats.service`：

```ini
[Unit]
Description=AD-Meta R statistics worker
After=network.target

[Service]
Type=simple
User=admeta
Group=admeta
WorkingDirectory=/www/wwwroot/ad-meta/stats-worker
Environment=R_USER=/var/lib/admeta
Environment=AD_META_STATS_WORKER_HOST=127.0.0.1
Environment=AD_META_STATS_WORKER_PORT=8001
Environment=OPENBLAS_NUM_THREADS=1
Environment=OMP_NUM_THREADS=1
Environment=MKL_NUM_THREADS=1
ExecStart=/opt/R/4.5.2/bin/Rscript server.R
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now admeta-stats
systemctl status admeta-stats --no-pager
curl --fail --show-error http://127.0.0.1:8001/health
```

然后在项目 `.env` 中将原来的空值改为：

```dotenv
AD_META_STATS_WORKER_URL=http://127.0.0.1:8001
```

```bash
systemctl restart admeta-api
curl --fail --show-error http://127.0.0.1:8000/api/health/ready
```

后端需要重启才会重新加载这项设置。`/health` 证明 worker 能响应，前面的模型 smoke test 证明锁定模型链路能执行，两者都需要。

## 12. 域名、HTTPS 与正式发布

完成隧道验证，并确认数据可以公开提供后，再发布。
当前应用不能据现有路由宣称已经具备面向多用户的登录、权限隔离；若仅供团队使用，应继续限制访问，
或在 Nginx/接入层启用访问认证并覆盖页面与 `/api/`，不要只给首页加密码。

1. 若是中国大陆服务器，先完成相应备案；已有其他接入商备案时核对是否需要腾讯云接入备案。
2. 在 DNS 添加域名的 A 记录，指向实例公网 IP。
3. 在宝塔给这个站点绑定实际域名，将测试用 `listen 127.0.0.1:8080` 改为公开的 HTTP 监听，并设置实际 `server_name`。
4. 在腾讯云和系统防火墙放通网站所需的 80、443，保留对数据库、后端和统计端口的限制。
5. 在宝塔该站点的 SSL 设置中部署证书，成功后启用 HTTPS 跳转与续期。证书验证方式与防火墙规则保持一致。
6. 保存宝塔生成的证书与验证配置，继续保留 `/api/` 代理和 SPA 回退；不要再把第 10 节的纯 HTTP 测试配置整段覆盖回去。
7. 用外部网络访问域名，检查页面、API、深层链接、图表和下载；检查开发者工具是否有请求发往 `localhost`、`127.0.0.1` 或 HTTP 混合内容。

备案要求参考[腾讯云官方说明](https://cloud.tencent.com/document/product/243/18910)。
域名与 HTTPS 配置完成不等于科研数据的来源与发布范围已经核验；保持项目原有研究用途与候选线索边界。

## 13. 更新、备份与排查

后续每次更新前备份 MySQL、与其发布修订匹配的 `backend/storage/`、`ADMetaData/`、服务器 `.env` 及 Nginx/systemd 配置。
备份应有一份放在该服务器以外。服务器快照不能替代可恢复、与配套文件匹配的数据库备份。
至少做一次向独立空库/独立目录的恢复验证。

代码与前端更新时单独传输它们，保留服务器 `.env`、`.venv`、R 库和运行数据；不要对整个运行目录使用 `rsync --delete`。
有数据库迁移时先检查迁移内容并保留回滚所需备份，再执行迁移、重启服务与接口验证。
不要仅为更新页面重跑 `bootstrap_storage` 或重新导入 MAG。

| 现象 | 优先检查 |
| --- | --- |
| 页面正常，但图表 502 | `admeta-api` 状态、8000 监听和 Nginx 代理 |
| `live` 正常而 `ready` 503 | 返回 JSON 中具体失败的数据库、迁移、缓存、分析登记或 worker |
| 刷新分析页面 404 | SPA 的 `try_files` 回退 |
| 数据集目录为空 | 是否恢复了实际 MySQL；是否误用空库；分析运行是否已登记 |
| MAG 功能页缺文件 | `backend/storage/derived/mag-functions/`、权限、原有 SHA-256 与字节数 |
| GMrepo 对比失败 | 默认数据包、`ADMetaData/`、上下文元数据和 `storage/provenance/` 是否一起迁移 |
| R 安装或导入出现 `Killed` | 内存使用、内核 OOM 日志、是否同时运行重任务 |
| 浏览器请求自己的 127.0.0.1 | 构建时 `VITE_API_BASE_URL` 配置错误，清空并重建 |
| Nginx 403/502 且文件/端口存在 | Nginx 错误日志、目录权限、SELinux AVC；按具体拒绝配置，不直接关闭 SELinux |
| SSH 隧道能访问而域名不能 | 公开监听、域名解析、备案状态、两层防火墙和证书 |

常用服务器检查命令：

```bash
systemctl status admeta-api admeta-stats --no-pager
journalctl -u admeta-api -n 100 --no-pager
journalctl -u admeta-stats -n 100 --no-pager
ss -lntp
free -h
df -h /
```

完成标准：服务开机可启动；`ready` 返回 200；应迁移的数据模块能打开；深层链接刷新正常；
模型 smoke test 通过；私有数据与配置不在静态根目录；数据库和内部服务端口不向公网开放；
域名/HTTPS 的外部访问及一次备份恢复得到验证。
目前本文完成的是根据本地代码整理的部署说明，上述服务器验收尚待实际执行。
