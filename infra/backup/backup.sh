#!/usr/bin/env bash
# Roka database backup script
# Usage: ./backup.sh
# Cron:  0 3 * * * /path/to/backup.sh >> /var/log/roka-backup.log 2>&1

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/tmp/roka-backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/roka_${TIMESTAMP}.sql.gz"

# Read from .env or use defaults
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-postgres}"
DB_USER="${DB_USER:-postgres}"

mkdir -p "$BACKUP_DIR"

echo "[$TIMESTAMP] Starting backup..."

# Use docker exec if running in compose, or direct pg_dump
if command -v docker &> /dev/null && docker ps --filter "name=db" --format '{{.Names}}' | grep -q db; then
    docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "$(docker ps --filter "name=db" --format '{{.Names}}' | head -1)" \
        pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges | gzip > "$BACKUP_FILE"
else
    PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --no-owner --no-privileges | gzip > "$BACKUP_FILE"
fi

echo "[$TIMESTAMP] Backup saved to: $BACKUP_FILE"
echo "[$TIMESTAMP] Size: $(du -h "$BACKUP_FILE" | cut -f1)"

# Cleanup: keep last 30 backups
cd "$BACKUP_DIR"
ls -t roka_*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm --
echo "[$TIMESTAMP] Old backups cleaned up (keeping 30 most recent)"

# Optional: sync to S3/MinIO
if [ -n "${S3_BACKUP_BUCKET:-}" ]; then
    echo "[$TIMESTAMP] Syncing to S3: $S3_BACKUP_BUCKET"
    aws s3 cp "$BACKUP_FILE" "s3://${S3_BACKUP_BUCKET}/backups/" \
        --endpoint-url "${S3_ENDPOINT:-}" 2>/dev/null || \
    echo "[$TIMESTAMP] S3 sync failed (aws cli may not be installed)"
fi

echo "[$TIMESTAMP] Backup complete."
