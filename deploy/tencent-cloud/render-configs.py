#!/usr/bin/env python3
"""Render configuration drafts without installing or changing running services."""
import argparse
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--app-root', type=Path, default=Path('/www/wwwroot/ad-meta'))
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--rscript', type=Path, default=Path('/opt/R/4.5.2/bin/Rscript'))
args = parser.parse_args()
app = str(args.app_root.resolve())
if any(ch.isspace() for ch in app):
    parser.error('Choose an application path without whitespace.')
args.output.mkdir(parents=True, exist_ok=True)
for name in ('admeta-api.service.in', 'admeta-stats.service.in', 'nginx-private.conf.in'):
    source = Path(__file__).resolve().parent / name
    text = source.read_text().replace('@@APP_ROOT@@', app).replace('@@RSCRIPT@@', str(args.rscript))
    target = args.output / name.removesuffix('.in')
    target.write_text(text, encoding='utf-8')
    print(target)
