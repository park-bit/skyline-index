#!/usr/bin/env bash
set -e

python3 scripts/01_download.py
python3 scripts/02_build_panel.py
python3 -m pytest -v
