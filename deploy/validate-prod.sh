#!/bin/sh
set -eu

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "ERROR: deploy/.env is missing. Copy .env.prod.example and set real secrets." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

require_secret() {
  name="$1"
  unsafe="$2"
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "ERROR: $name is empty." >&2
    exit 1
  fi
  if [ "$value" = "$unsafe" ]; then
    echo "ERROR: $name still uses the development default." >&2
    exit 1
  fi
  case "$value" in
    *replace-with*|*your-domain.example*)
      echo "ERROR: $name still contains a placeholder." >&2
      exit 1
      ;;
  esac
  if [ "${#value}" -lt 24 ]; then
    echo "ERROR: $name must contain at least 24 characters." >&2
    exit 1
  fi
}

require_secret DB_PASSWORD pulse123
require_secret JWT_SECRET 'pulse-im-jwt-secret-key-change-me-32bytes!!'
require_secret TURN_CREDENTIAL pulse-turn-2026-secret

if [ -z "${CORS_ALLOWED_ORIGINS:-}" ] || [ "$CORS_ALLOWED_ORIGINS" = "*" ]; then
  echo "ERROR: CORS_ALLOWED_ORIGINS must list trusted production origins." >&2
  exit 1
fi

for name in CORS_ALLOWED_ORIGINS MINIO_PUBLIC_URL TURN_URLS; do
  eval "value=\${$name:-}"
  case "$value" in
    ""|*your-domain.example*|*110.42.238.238*)
      echo "ERROR: $name must use the new public address." >&2
      exit 1
      ;;
  esac
done

if grep -q '^external-ip=110\.42\.238\.238$' coturn/turnserver.conf; then
  echo "ERROR: coturn/turnserver.conf still uses the previous server IP." >&2
  exit 1
fi

if [ -n "${SMS_DEV_FIXED_CODE:-}" ]; then
  echo "ERROR: SMS_DEV_FIXED_CODE must be empty in production." >&2
  exit 1
fi

if [ "${ALLOW_FIXED_SMS_CODE:-false}" != "false" ]; then
  echo "ERROR: ALLOW_FIXED_SMS_CODE must be false in production." >&2
  exit 1
fi

docker compose -f docker-compose.prod.yml config >/dev/null
docker info >/dev/null

available_kb="$(df -Pk . | awk 'NR==2 {print $4}')"
if [ "${available_kb:-0}" -lt 2097152 ]; then
  echo "ERROR: less than 2 GiB disk space is available." >&2
  exit 1
fi

echo "Production preflight passed."
