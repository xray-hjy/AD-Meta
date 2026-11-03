#!/usr/bin/env bash
# Install only the app's isolated Python. Does not install/replace MySQL or Nginx.
set -euo pipefail
AD_META_APP_ROOT="${1:-/www/wwwroot/ad-meta}"
if [[ "$(id -u)" != 0 ]]; then
  echo 'Run as root on the target Linux server.' >&2
  exit 1
fi
if [[ ! -f "$AD_META_APP_ROOT/backend/requirements.txt" || ! -f "$AD_META_APP_ROOT/frontend/dist/index.html" ]]; then
  echo 'Copy the verified app/ directory to the target first.' >&2
  exit 1
fi
if ! id admeta >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /var/lib/admeta --shell /sbin/nologin admeta
fi
if [[ ! -x /usr/local/bin/uv ]]; then
  curl -LsSf https://astral.sh/uv/install.sh -o /tmp/admeta-install-uv.sh
  UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh /tmp/admeta-install-uv.sh
fi
export UV_PYTHON_INSTALL_DIR=/opt/admeta-python
/usr/local/bin/uv python install 3.13
if [[ ! -d "$AD_META_APP_ROOT/backend/.venv" ]]; then
  /usr/local/bin/uv venv --python 3.13 "$AD_META_APP_ROOT/backend/.venv"
fi
/usr/local/bin/uv pip install --python "$AD_META_APP_ROOT/backend/.venv/bin/python" -r "$AD_META_APP_ROOT/backend/requirements.txt" 'PyMySQL[rsa]==1.2.3' 'cryptography==46.0.3'
/usr/local/bin/uv pip check --python "$AD_META_APP_ROOT/backend/.venv/bin/python"
chown -R admeta:admeta "$AD_META_APP_ROOT"
chmod 755 "$AD_META_APP_ROOT" "$AD_META_APP_ROOT/frontend"
chmod -R a+rX "$AD_META_APP_ROOT/frontend/dist"
runuser -u admeta -- "$AD_META_APP_ROOT/backend/.venv/bin/python" --version
echo 'Python ready. Database restoration and service configuration are separate steps.'
