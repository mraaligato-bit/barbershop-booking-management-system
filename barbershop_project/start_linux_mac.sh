#!/usr/bin/env sh
cd "$(dirname "$0")/app" || exit 1
exec python3 app.py
