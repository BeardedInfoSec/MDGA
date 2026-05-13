#!/usr/bin/env bash
# ================================================
# MDGA — MySQL container init script
# Runs once on first boot of the mysql container (via the standard
# /docker-entrypoint-initdb.d/ hook). Loads schema.sql first, then
# every migration-NNN-*.sql in sorted order. All migrations are
# written idempotently (IF NOT EXISTS / ON DUPLICATE KEY ...) so
# applying ones already in schema.sql is a no-op.
# ================================================
set -euo pipefail

DB_DIR="/docker-entrypoint-initdb.d/db-source"
MYSQL="mysql -uroot -p${MYSQL_ROOT_PASSWORD} ${MYSQL_DATABASE}"

if [ ! -d "$DB_DIR" ]; then
  echo "[mdga-init] $DB_DIR not mounted — nothing to do."
  exit 0
fi

if [ -f "$DB_DIR/schema.sql" ]; then
  echo "[mdga-init] Loading schema.sql..."
  $MYSQL < "$DB_DIR/schema.sql"
else
  echo "[mdga-init] WARNING: schema.sql not found in $DB_DIR — skipping bootstrap."
fi

echo "[mdga-init] Applying migrations..."
shopt -s nullglob
for f in "$DB_DIR"/migration-*.sql; do
  echo "[mdga-init]   $(basename "$f")"
  $MYSQL < "$f"
done
echo "[mdga-init] Done."
