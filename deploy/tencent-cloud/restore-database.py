#!/usr/bin/env python3
"""Restore the packaged SQL only into an empty, explicitly named local database.

Use the installed backend .venv Python. Admin authentication stays in a private
mysql option file (or mysql's existing local defaults). No passwords are printed.
"""
import argparse
import gzip
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import shutil
import subprocess
import tempfile

import pymysql


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', type=Path, required=True)
    parser.add_argument('--app-root', type=Path, default=Path('/www/wwwroot/ad-meta'))
    parser.add_argument('--database', default='ad_meta_web')
    parser.add_argument('--user', default='admeta_web')
    parser.add_argument('--mysql-client', default=shutil.which('mysql') or '/www/server/mysql/bin/mysql')
    parser.add_argument('--admin-defaults-file', type=Path)
    args = parser.parse_args()
    for value in (args.database, args.user):
        if not re.fullmatch(r'[a-z][a-z0-9_]{2,40}', value):
            parser.error('Database/user names must be lowercase stable identifiers.')
    root = args.bundle.resolve()
    app = args.app_root.resolve()
    if os.geteuid() != 0:
        parser.error('Run as root on the deployment server.')
    if (app / '.env').exists():
        parser.error('Existing .env found; preserve it and inspect the deployment state before retrying.')
    expected = json.loads((root / 'database/source-state.json').read_text())
    mysql = [args.mysql_client]
    if args.admin_defaults_file:
        private = args.admin_defaults_file.resolve()
        if private.stat().st_mode & 0o077:
            parser.error('Admin option file must have mode 600 or stricter.')
        mysql.append('--defaults-extra-file=' + str(private))
    mysql.extend(['--user=root', '--batch', '--skip-column-names', '--default-character-set=utf8mb4'])

    def admin(sql):
        result = subprocess.run(mysql, input=sql, text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError('MySQL administrator command failed. Check local authentication; credentials were not printed.')
        return result.stdout.strip()

    version = admin('SELECT VERSION();')
    if 'mariadb' in version.lower():
        parser.error('This package requires MySQL; MariaDB has not been validated.')
    exists = admin("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='" + args.database + "';")
    if int(exists):
        parser.error('Target database contains tables. Refusing to overwrite it.')
    user_exists = admin("SELECT COUNT(*) FROM mysql.user WHERE user='" + args.user + "';")
    if int(user_exists):
        parser.error('Target database user already exists. Choose a fresh user; existing users are never changed.')
    password = secrets.token_hex(24)
    admin(
        f'CREATE DATABASE IF NOT EXISTS `{args.database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;\n'
        f"CREATE USER '{args.user}'@'127.0.0.1' IDENTIFIED BY '{password}';\n"
        f"CREATE USER '{args.user}'@'localhost' IDENTIFIED BY '{password}';\n"
        f"GRANT ALL PRIVILEGES ON `{args.database}`.* TO '{args.user}'@'127.0.0.1';\n"
        f"GRANT ALL PRIVILEGES ON `{args.database}`.* TO '{args.user}'@'localhost';\n"
    )
    # Write the server-only credentials before restoring so a partial failure is
    # recoverable. A repeat invocation refuses to silently overwrite this file.
    env_path = app / '.env'
    env_path.write_text(
        'AD_META_ENVIRONMENT=production\nAD_META_DB_ENGINE=mysql\n'
        'AD_META_MYSQL_HOST=127.0.0.1\nAD_META_MYSQL_PORT=3306\n'
        f'AD_META_MYSQL_USER={args.user}\nAD_META_MYSQL_PASSWORD={password}\n'
        f'AD_META_MYSQL_DATABASE={args.database}\n'
        'AD_META_STATS_WORKER_URL=\nAD_META_MAG_DATASET=prjca022804-ad-nc\n'
        'AD_META_GMREPO_DATA_ROOT=ADMetaData/reference/gmrepo/processed/2026-10-09-v1\n',
        encoding='utf-8',
    )
    os.chmod(env_path, 0o600)
    account = pwd.getpwnam('admeta')
    os.chown(env_path, account.pw_uid, account.pw_gid)
    handle, name = tempfile.mkstemp(prefix='admeta-client-', suffix='.cnf')
    os.close(handle)
    try:
        Path(name).write_text('[client]\nhost=127.0.0.1\nport=3306\n'
                              f'user={args.user}\npassword={password}\n', encoding='utf-8')
        os.chmod(name, 0o600)
        with gzip.open(root / 'database/ad-meta.sql.gz', 'rb') as source:
            process = subprocess.Popen([args.mysql_client, '--defaults-extra-file=' + name,
                                        '--default-character-set=utf8mb4', args.database],
                                       stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            try:
                shutil.copyfileobj(source, process.stdin)
                process.stdin.close()
                stderr = process.stderr.read()
                status = process.wait()
            except BaseException:
                process.kill()
                process.wait()
                raise
            if status:
                log = app.parent / 'admeta-restore-error.log'
                log.write_bytes(stderr)
                os.chmod(log, 0o600)
                raise RuntimeError('SQL restore failed; partial database preserved. Private log: ' + str(log))
    finally:
        Path(name).unlink(missing_ok=True)
    connection = pymysql.connect(host='127.0.0.1', port=3306, user=args.user, password=password,
                                 database=args.database, charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor)
    try:
        with connection.cursor() as cursor:
            counts = {}
            for table, count in expected['table_counts'].items():
                cursor.execute(f'SELECT COUNT(*) AS n FROM `{table}`')
                counts[table] = int(cursor.fetchone()['n'])
            if counts != expected['table_counts']:
                raise RuntimeError('Restored table counts differ from the source snapshot; do not start the site.')
            cursor.execute('SELECT slug,current_revision_id FROM datasets ORDER BY slug')
            if list(cursor.fetchall()) != expected['datasets']:
                raise RuntimeError('Published dataset revisions changed during restore.')
            cursor.execute('SELECT cohort_key,current_release FROM cohorts ORDER BY cohort_key')
            if list(cursor.fetchall()) != expected['cohorts']:
                raise RuntimeError('Published cohort release differs from the source snapshot.')
    finally:
        connection.close()
    report = {'status': 'restored_and_counts_verified', 'source_version': expected['server_version'],
              'target_version': version, 'database': args.database, 'table_counts': counts,
              'password_printed': False, 'r_worker_enabled': False}
    destination = app.parent / 'admeta-restore-result.json'
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    os.chmod(destination, 0o600)
    print(json.dumps({k: v for k, v in report.items() if k != 'table_counts'}, ensure_ascii=False, indent=2))
    print('Every table row count and published revision matched. Continue file integrity and HTTP verification.')


if __name__ == '__main__':
    main()
