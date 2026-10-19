#!/bin/bash
# Prepares /opt/pulseim for the P0 concurrency update:
# 1) backs up the current IM jar
# 2) creates /opt/pulseim/.env from the running container env (compose interpolation source)
# 3) validates the compose file
set -e
cd /opt/pulseim
TS=$(date +%Y%m%d-%H%M%S)
cp -p artifacts/im/pulse-im-server-1.0.0-SNAPSHOT.jar "artifacts/im/pulse-im-server-1.0.0-SNAPSHOT.jar.bak-pre-p0-$TS"
echo "jar backed up: pulse-im-server-1.0.0-SNAPSHOT.jar.bak-pre-p0-$TS"
docker inspect pulse-api --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(DB_PASSWORD|JWT_SECRET|CORS_ALLOWED_ORIGINS|TURN_CREDENTIAL|BAIDU_MAP_AK)=' \
  > .env
chmod 600 .env
echo "--- .env keys ---"
cut -d= -f1 .env
docker compose -f docker-compose.prod.yml config -q && echo CONFIG_OK
