#!/usr/bin/env bash
# Резервная копия базы team-tracker: сжатый дамп в каталоге backups/ (по умолчанию).
# Использование: scripts/backup.sh [каталог]. Хранятся последние KEEP копий (по умолчанию 14).
set -euo pipefail
cd "$(dirname "$0")/.."

dir="${1:-backups}"
keep="${KEEP:-14}"
mkdir -p "$dir"
file="$dir/tracker-$(date +%Y%m%d-%H%M%S).sql.gz"

docker compose exec -T db pg_dump -U tracker --clean --if-exists tracker | gzip > "$file.part"
mv "$file.part" "$file"
echo "Копия сохранена: $file"

# старые копии удаляем, оставляя последние $keep
ls -1t "$dir"/tracker-*.sql.gz 2>/dev/null | tail -n +"$((keep + 1))" | xargs -r rm --
