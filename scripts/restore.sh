#!/usr/bin/env bash
# Восстановление базы из копии: scripts/restore.sh backups/tracker-ГГГГММДД-ЧЧММСС.sql.gz
# Текущие данные в базе заменяются данными из копии.
set -euo pipefail
cd "$(dirname "$0")/.."

file="${1:?Укажите файл копии: scripts/restore.sh backups/tracker-….sql.gz}"
[ -f "$file" ] || { echo "Нет файла: $file" >&2; exit 1; }

read -r -p "Заменить текущие данные данными из $file? [y/N] " answer
[ "$answer" = "y" ] || { echo "Отменено."; exit 1; }

docker compose stop app
gunzip -c "$file" | docker compose exec -T db psql -U tracker -d tracker -v ON_ERROR_STOP=1 -q
docker compose start app
echo "База восстановлена из $file"
