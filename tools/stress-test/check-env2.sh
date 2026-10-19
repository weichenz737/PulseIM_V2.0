#!/bin/bash
docker inspect pulse-api --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/pulse-api.env
echo "--- required keys present in container ---"
grep -E '^(DB_PASSWORD|JWT_SECRET|CORS_ALLOWED_ORIGINS|TURN_CREDENTIAL|BAIDU_MAP_AK)=' /tmp/pulse-api.env | sed 's/=.*/=<set>/'
echo "--- all env keys in container ---"
cut -d= -f1 /tmp/pulse-api.env
echo "--- current /opt/pulseim/.env keys ---"
cut -d= -f1 /opt/pulseim/.env 2>/dev/null
