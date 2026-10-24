#!/bin/sh
set -eu
: "${DATABASE_URL:?Set DATABASE_URL}"
umask 077
backup_dir="backups/arced-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
pg_dump --format=custom "$DATABASE_URL" > "$backup_dir/database.dump"
# Files are immutable and are written before their database rows commit.
# Capture them after the DB snapshot so all referenced files are included.
if [ -d "${UPLOAD_DIR:-/workspace/.arced/uploads}" ]; then
  tar -cf "$backup_dir/files.tar" -C "${UPLOAD_DIR:-/workspace/.arced/uploads}" .
else
  tar -cf "$backup_dir/files.tar" -T /dev/null
fi
(cd "$backup_dir" && sha256sum database.dump files.tar > SHA256SUMS)
printf 'Backup created: %s\n' "$backup_dir"
