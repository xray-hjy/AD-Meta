#!/usr/bin/env python3
"""Bounded single-package Linux diagnostic; no database/site/R-library replacement.

prepare: inspect safety prerequisites, create isolated diagnostic files, start nothing.
start: recheck prerequisites, start a small recorder and ONE constrained beachmat build.
report: summarize collected data; never restarts a service.
"""
from __future__ import annotations
import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import signal
import subprocess
import sys
import time

APP = Path('/www/wwwroot/ad-meta')
RSCRIPT = Path('/opt/R/4.5.2/bin/Rscript')
BASE = Path('/root/admeta-diagnostics')
MIB = 1024 * 1024


def stamp():
    return datetime.now().astimezone().isoformat()


def read(path):
    try:
        return Path(path).read_text().strip()
    except (OSError, ValueError):
        return None


def number(path):
    value = read(path)
    return int(value) if value is not None and value.isdigit() else None


def meminfo(path='/proc/meminfo'):
    result = {}
    text = read(path)
    if text is None:
        return result
    for line in text.splitlines():
        key, _, value = line.partition(':')
        fields = value.split()
        if fields and fields[0].isdigit():
            result[key] = int(fields[0]) * (1024 if len(fields) > 1 and fields[1] == 'kB' else 1)
    return result


def procstat(text):
    # The command name may itself contain spaces and parentheses.
    name = text[text.index('(') + 1:text.rindex(')')]
    fields = text[text.rindex(')') + 2:].split()
    return {'name': name, 'state': fields[0], 'ppid': int(fields[1]),
            'cpu_ticks': int(fields[11]) + int(fields[12]), 'rss_bytes': int(fields[21]) * os.sysconf('SC_PAGE_SIZE')}


def processes():
    result = []
    for path in Path('/proc').iterdir():
        if not path.name.isdigit():
            continue
        try:
            item = procstat((path / 'stat').read_text())
            item['pid'] = int(path.name)
            item['cgroup'] = read(path / 'cgroup')
            result.append(item)
        except (OSError, ValueError, IndexError):
            pass
    return result


def command(args, **kwargs):
    kwargs.setdefault('timeout', 30)
    return subprocess.run(args, text=True, capture_output=True, **kwargs)


def unit_state(unit):
    try:
        result = command(['systemctl', 'show', unit, '--no-pager', '-p', 'ActiveState', '-p', 'SubState',
                          '-p', 'Result', '-p', 'MainPID', '-p', 'ExecMainCode', '-p', 'ExecMainStatus',
                          '-p', 'MemoryCurrent', '-p', 'MemoryPeak', '-p', 'MemoryMax', '-p', 'MemorySwapMax',
                          '-p', 'ControlGroup'], timeout=2)
    except subprocess.TimeoutExpired:
        return {'QueryError': 'systemctl show exceeded 2 seconds'}
    return dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    path.chmod(0o600)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tail_text(path, lines):
    try:
        with path.open('rb') as source:
            source.seek(0, os.SEEK_END)
            source.seek(max(0, source.tell() - 65536))
            return '\n'.join(line[:4000] for line in source.read(65536).decode('utf-8', errors='replace').splitlines()[-lines:])
    except OSError:
        return '(no saved lines)'


def preflight():
    errors = []
    memory = meminfo()
    controllers = (read('/sys/fs/cgroup/cgroup.controllers') or '').split()
    panic = number('/proc/sys/vm/panic_on_oom')
    compilers = [p for p in processes() if p['name'] in
                 {'R', 'Rscript', 'Rcmd', 'cc1', 'cc1plus', 'gcc', 'g++', 'make', 'ninja', 'cmake'}]
    if os.geteuid() != 0 or sys.platform != 'linux':
        errors.append('Run as root on the Linux server only')
    if panic != 0:
        errors.append('vm.panic_on_oom is not 0 or could not be read: do not provoke a cgroup OOM')
    if not {'cpu', 'memory'}.issubset(controllers):
        errors.append('Required cgroup v2 CPU/memory controllers are unavailable')
    if memory.get('MemAvailable', 0) < 2048 * MIB:
        errors.append('Less than 2048 MiB currently available; do not start this probe')
    if memory.get('SwapFree', 0) < 2048 * MIB:
        errors.append('Less than 2048 MiB free swap; do not start this probe')
    if compilers:
        errors.append('Another R/compiler/build process is running; do not run concurrently')
    lock = APP / 'stats-worker/renv.lock'
    if not RSCRIPT.is_file() or not lock.is_file():
        errors.append('Expected R runtime or application renv.lock is absent')
    if shutil.disk_usage('/').free < 2 * 1024**3:
        errors.append('Less than 2 GiB root disk free')
    for name in ('runuser', 'systemctl', 'systemd-analyze', 'journalctl'):
        if not shutil.which(name):
            errors.append('Required tool absent: ' + name)
    try:
        pwd.getpwnam('admeta')
    except KeyError:
        errors.append('Application user admeta does not exist')
    rcheck = None
    if not errors:
        rcheck = command(['runuser', '-u', 'admeta', '--', 'env', 'R_USER=/var/lib/admeta',
                          str(RSCRIPT), '--vanilla', '-e',
                          'stopifnot(as.character(getRversion()) == "4.5.2"); '
                          'stopifnot(requireNamespace("renv", quietly=TRUE)); '
                          'cat("R=", as.character(getRversion()), ";renv=", as.character(packageVersion("renv")), "\\n", sep="")'],
                         cwd='/var/lib/admeta')
        if rcheck.returncode:
            errors.append('Base R/renv check failed; do not auto-install or activate the application project')
    return {'time': stamp(), 'status': 'blocked' if errors else 'ready', 'errors': errors,
            'memory_bytes': memory, 'vm_policy': {key: read('/proc/sys/vm/' + key) for key in
             ('panic_on_oom', 'swappiness', 'overcommit_memory', 'overcommit_ratio')},
            'compiler_processes': compilers, 'r_check': rcheck.stdout.strip() if rcheck else None,
            'r_check_error': rcheck.stderr[-1500:] if rcheck and rcheck.returncode else None}


def prepare():
    result = preflight()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result['errors']:
        return 2
    ident = datetime.now().strftime('%Y%m%d-%H%M%S') + '-' + str(os.getpid())
    run = BASE / ident
    run.mkdir(parents=True, mode=0o700)
    userdir = Path('/var/lib/admeta/diagnostics') / ident
    project = userdir / 'project'
    project.mkdir(parents=True, mode=0o700)
    helper = userdir / 'probe-beachmat.R'
    shutil.copy2(Path(__file__).with_name('probe-beachmat.R'), helper)
    shutil.copy2(APP / 'stats-worker/renv.lock', project / 'renv.lock')
    account = pwd.getpwnam('admeta')
    for path in [userdir.parent, userdir, project, helper, project / 'renv.lock']:
        os.chown(path, account.pw_uid, account.pw_gid)
    shutil.copy2(Path(__file__), run / 'diagnose.py')
    originals = [APP / 'stats-worker/renv.lock', Path('/root/admeta-r-stage4.sh'),
                 Path('/etc/systemd/system/admeta-renv-build.service')]
    snapshots = {str(p): digest(p) for p in originals if p.is_file()}
    probe = 'admeta-beachmat-probe-' + ident + '.service'
    recorder = 'admeta-resource-record-' + ident + '.service'
    metadata = {'created_at': stamp(), 'run_dir': str(run), 'project': str(project),
                'probe_unit': probe, 'recorder_unit': recorder, 'original_hashes': snapshots,
                'scope': 'force rebuild beachmat and restore its recursive dependencies into a separate library',
                'linux_execution': 'pending', 'status': 'prepared'}
    save(run / 'run.json', metadata)
    save(run / 'preflight.json', result)
    probe_text = f'''[Unit]
Description=Bounded AD-Meta beachmat diagnostic
After=network-online.target
[Service]
Type=oneshot
User=admeta
Group=admeta
WorkingDirectory={project}
Environment=R_USER=/var/lib/admeta
Environment=MAKEFLAGS=-j1
Environment=OPENBLAS_NUM_THREADS=1
Environment=OMP_NUM_THREADS=1
Environment=MKL_NUM_THREADS=1
ExecStart={RSCRIPT} --vanilla {helper} {project}
MemoryAccounting=yes
MemoryHigh=1536M
MemoryMax=2048M
MemorySwapMax=1024M
CPUQuota=100%
Nice=10
IOWeight=10
TasksMax=128
OOMScoreAdjust=500
OOMPolicy=kill
TimeoutStartSec=20min
TimeoutStopSec=20s
Restart=no
RemainAfterExit=yes
StandardOutput=append:{run}/build.log
StandardError=append:{run}/build.log
'''
    recorder_text = f'''[Unit]
Description=Temporary AD-Meta resource recorder
[Service]
Type=exec
ExecStart={sys.executable} {run}/diagnose.py record {run}
MemoryMax=128M
CPUQuota=10%
OOMScoreAdjust=-500
RuntimeMaxSec=30min
TimeoutStopSec=10s
Restart=no
StandardOutput=append:{run}/recorder.log
StandardError=append:{run}/recorder.log
'''
    (run / probe).write_text(probe_text)
    (run / recorder).write_text(recorder_text)
    print('PREPARED_RUN=' + str(run))
    print('No service has been started. To run once: python3 ' + str(run / 'diagnose.py') + ' start ' + str(run))
    return 0


def load_run(run):
    run = run.resolve()
    if run.parent != BASE:
        raise RuntimeError('Use an exact run directory created below /root/admeta-diagnostics')
    if not re.fullmatch(r'\d{8}-\d{6}-\d+', run.name):
        raise RuntimeError('Unexpected diagnostic run name')
    meta = json.loads((run / 'run.json').read_text())
    if meta['probe_unit'] != 'admeta-beachmat-probe-' + run.name + '.service':
        raise RuntimeError('Unexpected probe unit: refusing actions against other services')
    if meta['recorder_unit'] != 'admeta-resource-record-' + run.name + '.service':
        raise RuntimeError('Unexpected recorder unit')
    return run, meta


def start(run):
    run, meta = load_run(run)
    if meta['status'] != 'prepared':
        raise RuntimeError('Run was already started; never auto-repeat a probe')
    result = preflight()
    save(run / 'preflight-at-start.json', result)
    if result['errors']:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2
    units = [meta['recorder_unit'], meta['probe_unit']]
    checked = command(['systemd-analyze', 'verify', *[str(run / name) for name in units]])
    (run / 'unit-validation.log').write_text(checked.stdout + checked.stderr)
    if checked.returncode:
        raise RuntimeError('systemd unit validation failed; nothing started')
    for name in units:
        target = Path('/run/systemd/system') / name
        if target.exists():
            raise RuntimeError('Refusing to replace an existing unit: ' + name)
        shutil.copy2(run / name, target)
        target.chmod(0o644)
    subprocess.run(['systemctl', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', 'start', meta['recorder_unit']], check=True)
    ready = run / 'recorder-ready'
    for _ in range(50):
        if ready.exists():
            break
        time.sleep(0.1)
    else:
        raise RuntimeError('Recorder did not become ready; compile was not started')
    meta['status'] = 'started'
    meta['started_at'] = stamp()
    meta['linux_execution'] = 'started_on_target'
    save(run / 'run.json', meta)
    subprocess.run(['systemctl', 'start', '--no-block', meta['probe_unit']], check=True)
    print(json.dumps({'status': 'started_once', 'run_dir': str(run), 'probe_unit': meta['probe_unit'],
                      'recording': str(run / 'samples.jsonl'), 'build_log': str(run / 'build.log'),
                      'limits': '2048MiB RAM hard limit, 1024MiB swap, one CPU, 20min timeout',
                      'site_database_and_project_library_targeted': False}, ensure_ascii=False, indent=2))
    return 0


def record(run):
    run, meta = load_run(run)
    stop = False
    def received(*_):
        nonlocal stop
        stop = True
    signal.signal(signal.SIGTERM, received)
    signal.signal(signal.SIGINT, received)
    kernel = (run / 'kernel-follow.log').open('ab', buffering=0)
    follower = subprocess.Popen(['journalctl', '--boot=0', '_TRANSPORT=kernel', '--since=now',
                                 '--follow', '--no-pager', '--output=short-iso'], stdout=kernel, stderr=kernel)
    active_seen = False
    finished_since = None
    low_count = 0
    guard_sent = False
    started = time.monotonic()
    try:
        with (run / 'samples.jsonl').open('x', buffering=1) as stream:
            (run / 'recorder-ready').write_text(stamp())
            while not stop and time.monotonic() - started < 1800:
                memory = meminfo()
                all_processes = processes()
                state = unit_state(meta['probe_unit'])
                group = state.get('ControlGroup') or '/system.slice/' + meta['probe_unit']
                cgroup = {}
                if group and '..' not in Path(group).parts:
                    cgroot = Path('/sys/fs/cgroup') / group.lstrip('/')
                    for name in ('memory.current', 'memory.peak', 'memory.high', 'memory.max',
                                 'memory.swap.current', 'memory.swap.max', 'memory.events',
                                 'cpu.stat', 'pids.current'):
                        cgroup[name] = read(cgroot / name)
                selected = {p['pid']: p for p in sorted(all_processes, key=lambda p: p['rss_bytes'], reverse=True)[:15]}
                for p in all_processes:
                    if meta['probe_unit'] in (p['cgroup'] or '') or p['name'] in {'sshd', 'mysqld', 'node', 'MainThread', 'R', 'cc1plus', 'cc1'}:
                        selected[p['pid']] = p
                row = {'time': stamp(), 'monotonic': time.monotonic(),
                       'boot_id': read('/proc/sys/kernel/random/boot_id'), 'memory_bytes': memory,
                       'cpu_counters': (read('/proc/stat') or '').splitlines()[:3],
                       'vmstat': {line.split()[0]: int(line.split()[1]) for line in (read('/proc/vmstat') or '').splitlines()
                                  if line.split()[0] in {'pswpin', 'pswpout', 'pgmajfault', 'pgscan_kswapd', 'pgscan_direct', 'pgsteal_kswapd', 'pgsteal_direct', 'oom_kill'}},
                       'pressure': {key: read('/proc/pressure/' + key) for key in ('cpu', 'memory', 'io')},
                       'block_counters': {p.parent.name: read(p) for p in Path('/sys/block').glob('*/stat')
                                          if not p.parent.name.startswith(('loop', 'ram'))},
                       'unit': state, 'cgroup': cgroup, 'processes': list(selected.values())}
                low_count = low_count + 1 if memory.get('MemAvailable', 0) < 256 * MIB else 0
                if state.get('ActiveState') in {'activating', 'active', 'failed'}:
                    active_seen = True
                if low_count >= 2 and active_seen and not guard_sent:
                    row['guard_action'] = 'host MemAvailable below 256MiB twice; request stop of probe only'
                    subprocess.run(['systemctl', 'stop', '--no-block', meta['probe_unit']], capture_output=True, timeout=5)
                    guard_sent = True
                stream.write(json.dumps(row, ensure_ascii=False) + '\n')
                stream.flush()
                os.fsync(stream.fileno())
                if active_seen and (state.get('ActiveState') in {'failed', 'inactive'} or state.get('SubState') == 'exited'):
                    finished_since = finished_since or time.monotonic()
                    if time.monotonic() - finished_since >= 10:
                        break
                time.sleep(2)
    finally:
        try:
            follower.terminate()
        except ProcessLookupError:
            pass
        try:
            follower.wait(timeout=3)
        except subprocess.TimeoutExpired:
            follower.kill()
            follower.wait()
        kernel.close()
        save(run / 'recorder-end.json', {'time': stamp(), 'guard_stop_requested': guard_sent,
                                        'probe_state': unit_state(meta['probe_unit'])})
    return 0


def report(run):
    run, meta = load_run(run)
    count = 0
    first = last = None
    minimum = None
    max_swap = max_mem = max_peak = max_probe_swap = 0
    guards = []
    if (run / 'samples.jsonl').exists():
        with (run / 'samples.jsonl').open() as source:
            for line in source:
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                count += 1
                first = first or row['time']
                last = row['time']
                available = row['memory_bytes'].get('MemAvailable', 0) / MIB
                minimum = available if minimum is None else min(minimum, available)
                max_swap = max(max_swap, (row['memory_bytes'].get('SwapTotal', 0) - row['memory_bytes'].get('SwapFree', 0)) / MIB)
                max_mem = max(max_mem, int(row['cgroup'].get('memory.current') or 0) / MIB)
                max_peak = max(max_peak, int(row['cgroup'].get('memory.peak') or 0) / MIB)
                max_probe_swap = max(max_probe_swap, int(row['cgroup'].get('memory.swap.current') or 0) / MIB)
                if 'guard_action' in row:
                    guards.append({'time': row['time'], 'action': row['guard_action']})
    original = {p: digest(Path(p)) == value if Path(p).is_file() else False for p, value in meta['original_hashes'].items()}
    result = {'run_dir': str(run), 'sample_count': count, 'current_unit': unit_state(meta['probe_unit']),
              'original_files_unchanged': original,
              'guard_actions': guards, 'minimum_host_available_MiB': minimum,
              'maximum_host_swap_used_MiB': max_swap if count else None,
              'maximum_probe_memory_MiB': max_mem if count else None,
              'maximum_probe_recorded_peak_MiB': max_peak if count else None,
              'maximum_probe_swap_MiB': max_probe_swap if count else None,
              'first_sample': first, 'last_sample': last,
              'note': 'A cgroup-limit OOM in this test does not prove that an earlier host-wide OOM occurred.'}
    save(run / 'summary.json', result)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    for name, limit in (('build.log', 40), ('kernel-follow.log', 25)):
        print('\n' + name + ' (tail only)')
        print(tail_text(run / name, limit))
    return 0


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('prepare', 'start', 'record', 'report', 'self-test'))
    parser.add_argument('run_dir', nargs='?', type=Path)
    args = parser.parse_args()
    if args.mode == 'self-test':
        fields = ['S', '7'] + ['0'] * 9 + ['120', '30'] + ['0'] * 8 + ['42']
        parsed = procstat('99 (name with ) parentheses) ' + ' '.join(fields))
        assert parsed['name'] == 'name with ) parentheses'
        assert parsed['ppid'] == 7 and parsed['cpu_ticks'] == 150
        assert parsed['rss_bytes'] == 42 * os.sysconf('SC_PAGE_SIZE')
        print('Process-counter parsing self-test passed. No server action performed.')
        return 0
    if sys.platform != 'linux' or os.geteuid() != 0:
        parser.error('Run as root on the Linux server; self-test is portable')
    if args.mode == 'prepare':
        return prepare()
    if args.run_dir is None:
        parser.error('Provide the exact run directory returned by prepare')
    return {'start': start, 'record': record, 'report': report}[args.mode](args.run_dir)


if __name__ == '__main__':
    raise SystemExit(main())
