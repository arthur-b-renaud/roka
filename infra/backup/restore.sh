#!/usr/bin/env bash
# Roka database restore script
# Usage: ./restore.sh /path/to/roka_YYYYMMDD_HHMMSS.sql.gz

set -euo pipefail

BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup-file.sql.gz>"
    echo ""
    echo "Available backups:"
    ls -lh "${BACKUP_DIR:-/tmp/roka-backups}"/roka_*.sql.gz 2>/dev/null || echo "  No backups found"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: File not found: $BACKUP_FILE"
    exit 1
fi

DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-postgres}"
DB_USER="${DB_USER:-postgres}"

echo "WARNING: This will DROP and RECREATE the database '$DB_NAME'."
echo "Backup file: $BACKUP_FILE"
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
echo "[$TIMESTAMP] Starting restore..."

if command -v docker &> /dev/null && docker ps --filter "name=db" --format '{{.Names}}' | grep -q db; then
    DB_CONTAINER="$(docker ps --filter "name=db" --format '{{.Names}}' | head -1)"
    gunzip -c "$BACKUP_FILE" | docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD}" "$DB_CONTAINER" \
        psql -U "$DB_USER" -d "$DB_NAME"
else
    gunzip -c "$BACKUP_FILE" | PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "$DB_HOST" -p "$DB_PORT" \
        -U "$DB_USER" -d "$DB_NAME"
fi

echo "[$TIMESTAMP] Restore complete from: $BACKUP_FILE"
