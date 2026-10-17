#!/usr/bin/env bash
# Публикация снимка проекта в публичное зеркало sputnik-game-public.
# Использование:
#   tools/sync_public.sh --dry-run
#   tools/sync_public.sh --push
set -euo pipefail

SRC="/root/projects/sputnik_game"
DST="/root/projects/sputnik_game_public"
KEY="/root/.ssh/sputnik_game_deploy_public"
MODE="${1:---dry-run}"

if [[ ! -d "$SRC" || ! -d "$DST" ]]; then
  echo "нет каталога источника или зеркала" >&2
  exit 1
fi

RSYNC_ARGS=(
  -aR --delete --max-size=20m
  --exclude '.git'
  --exclude '.env' --exclude '.env.*'
  --exclude '*.key' --exclude '*.pem'
  --exclude 'secrets*' --exclude '*_secret*' --exclude 'credentials*'
  --exclude '__pycache__' --exclude '.venv' --exclude 'venv*'
  --exclude 'node_modules' --exclude '.godot' --exclude '.stfolder' --exclude '.stignore'
  --exclude 'build' --exclude 'dist'
  --exclude '*.gguf' --exclude '*.zip' --exclude '*.tar' --exclude '*.tar.gz' --exclude '*.zst'
)

# allowlist: что вообще публикуем
ITEMS=()
for item in README.md index.html styles.css docs src assets vendor tools/sync_public.sh; do
  [[ -e "$SRC/$item" ]] && ITEMS+=("$item")
done

if [[ ${#ITEMS[@]} -eq 0 ]]; then
  echo "нечего публиковать" >&2
  exit 1
fi

echo "[mirror] источник: $SRC"
echo "[mirror] элементы: ${ITEMS[*]}"

if [[ "$MODE" == "--dry-run" ]]; then
  rsync "${RSYNC_ARGS[@]}" --dry-run --itemize-changes "${ITEMS[@]/#/$SRC/./}" "$DST/" 2>/dev/null || true
  exit 0
fi

rsync "${RSYNC_ARGS[@]}" "${ITEMS[@]/#/$SRC/./}" "$DST/"

# Скан на типовые секреты
if grep -rInE '(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY)' "$DST" --exclude-dir=.git >/tmp/sputnik_secret_hits.txt 2>/dev/null; then
  echo "[mirror] СТОП: найдены похожие на секреты строки:" >&2
  cat /tmp/sputnik_secret_hits.txt >&2
  exit 2
fi

cd "$DST"
git config user.name >/dev/null 2>&1 || git config user.name "sputnik-mirror"
git config user.email >/dev/null 2>&1 || git config user.email "sputnik-mirror@users.noreply.github.com"
git add -A
if git diff --cached --quiet; then
  echo "[mirror] изменений нет"
else
  git commit -q -m "mirror: $(date -u +%Y-%m-%dT%H:%MZ)"
  echo "[mirror] коммит создан"
fi

if [[ "$MODE" == "--push" ]]; then
  GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" \
    git push -u origin main
  echo "[mirror] запушено: https://github.com/13ruskiynero/sputnik-game-public"
else
  echo "[mirror] собран локально; для отправки добавьте --push"
fi
