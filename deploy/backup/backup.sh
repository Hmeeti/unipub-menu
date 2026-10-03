#!/bin/sh
# Daily pg_dump → S3-compatible storage (Cloudflare R2), keeps BACKUP_RETENTION_DAYS (default 14).
set -eu

: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
: "${BACKUP_S3_ENDPOINT:?BACKUP_S3_ENDPOINT is required}"
: "${BACKUP_S3_ACCESS_KEY_ID:?}"
: "${BACKUP_S3_SECRET_ACCESS_KEY:?}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
PREFIX="${BACKUP_S3_PREFIX:-pg}/${APP_ENV:-production}"

export AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-auto}"

STAMP="$(date +%Y-%m-%dT%H-%M-%S)"
FILE="/tmp/unipub-${STAMP}.dump"

echo "[backup] dumping database at ${STAMP}"
pg_dump --format=custom --compress=9 --no-owner --no-privileges --file="$FILE"
aws s3 cp "$FILE" "s3://${BACKUP_S3_BUCKET}/${PREFIX}/unipub-${STAMP}.dump" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
rm -f "$FILE"
echo "[backup] uploaded ${PREFIX}/unipub-${STAMP}.dump"

CUTOFF="$(date -d "@$(( $(date +%s) - RETENTION_DAYS * 86400 ))" +%Y-%m-%d 2>/dev/null || date -v-"${RETENTION_DAYS}"d +%Y-%m-%d)"
aws s3 ls "s3://${BACKUP_S3_BUCKET}/${PREFIX}/" --endpoint-url "$BACKUP_S3_ENDPOINT" | while read -r day _time _size name; do
  [ -n "${name:-}" ] || continue
  if [ "$day" \< "$CUTOFF" ]; then
    aws s3 rm "s3://${BACKUP_S3_BUCKET}/${PREFIX}/${name}" --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
    echo "[backup] pruned ${name}"
  fi
done

if [ -n "${BACKUP_HEALTHCHECK_URL:-}" ]; then
  wget -q -O /dev/null "$BACKUP_HEALTHCHECK_URL" || true
fi
echo "[backup] done"
