#!/usr/bin/env bash
set -euo pipefail
REMOTE="https://github.com/Vorium1/raiz-digital.git"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE"
else
  git remote add origin "$REMOTE"
fi
git branch -M main
git push -u origin main
