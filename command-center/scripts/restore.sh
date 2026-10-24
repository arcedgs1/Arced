#!/bin/sh
set -eu
: "${RESTORE_DATABASE_URL:?Set a separate empty restore database URL}"
: "${RESTORE_UPLOAD_DIR:?Set a separate empty directory for restored private files}"
: "${1:?Pass a backup DIRECTORY containing database.dump, files.tar, SHA256SUMS}"
backup_dir=$(cd "$1" && pwd)
(cd "$backup_dir" && sha256sum -c SHA256SUMS)
# Validate all archive entries before touching the database or destination.
python3 - "$backup_dir/files.tar" "$RESTORE_UPLOAD_DIR" <<'PY'
import sys,tarfile,re,pathlib
archive,destination=sys.argv[1:]
root=pathlib.Path(destination)
if root.exists() and (not root.is_dir() or any(root.iterdir())):
 raise SystemExit('Restore file directory must be empty.')
with tarfile.open(archive) as t:
 for m in t.getmembers():
  if m.name in ('.','./') and m.isdir():continue
  if not m.isfile() or not re.fullmatch(r'(\./)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',m.name):
   raise SystemExit('Unexpected or unsafe file in backup archive.')
PY
pg_restore --exit-on-error --no-owner --dbname="$RESTORE_DATABASE_URL" < "$backup_dir/database.dump"
python3 - "$backup_dir/files.tar" "$RESTORE_UPLOAD_DIR" <<'PY'
import sys,tarfile,pathlib,shutil,os
root=pathlib.Path(sys.argv[2]);root.mkdir(parents=True,exist_ok=True,mode=0o700)
with tarfile.open(sys.argv[1]) as t:
 for m in t.getmembers():
  if not m.isfile():continue
  target=root/pathlib.PurePosixPath(m.name).name
  with t.extractfile(m) as src, target.open('xb') as out:shutil.copyfileobj(src,out)
  os.chmod(target,0o600)
print('Database and private files restored. Verify record counts and download checks before use.')
PY
