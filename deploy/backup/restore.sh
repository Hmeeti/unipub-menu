#!/bin/sh
# Restore a dump from R2 into the database.
#   docker compose -f deploy/compose.yml run --rm backup restore.sh                # list available dumps
#   docker compose -f deploy/compose.yml run --rm backup restore.sh <file.dump>    # restore (asks for confirmation)
set -eu
PREFIX="${BACKUP_S3_PREFIX:-pg}/${APP_ENV:-production}"
export AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-auto}"

if [ $# -eq 0 ]; then
  aws s3 ls "s3://${BACKUP_S3_BUCKET}/${PREFIX}/" --endpoint-url "$BACKUP_S3_ENDPOINT"
  echo "Usage: restore.sh <file.dump>"
  exit 0
fi

NAME="$1"
echo "This will OVERWRITE database '${PGDATABASE}' on '${PGHOST}' with ${NAME}."
printf "Type RESTORE to continue: "
read -r answer
[ "$answer" = "RESTORE" ] || { echo "Aborted"; exit 1; }

aws s3 cp "s3://${BACKUP_S3_BUCKET}/${PREFIX}/${NAME}" /tmp/restore.dump --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --dbname="$PGDATABASE" /tmp/restore.dump
rm -f /tmp/restore.dump
echo "Restored ${NAME}. Restart app and worker: docker compose -f deploy/compose.yml restart app worker"
