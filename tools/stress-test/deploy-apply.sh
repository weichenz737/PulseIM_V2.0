#!/bin/bash
# Applies the P0+P1+P2 update: rebuild IM image, recreate postgres+im, reload nginx, raise sysctls.
# Uses docker-compose v1 (the server has no docker compose plugin) and the ACTIVE compose file
# /opt/pulseim/docker-compose.yml.
set -e
cd /opt/pulseim
cp -f /tmp/pulse-im-server-new.jar artifacts/im/pulse-im-server-1.0.0-SNAPSHOT.jar
cp -f /tmp/pulse-api-new.jar artifacts/api/pulse-api-1.0.0-SNAPSHOT.jar
cp -f /tmp/nginx.prod.conf.new nginx/nginx.prod.conf
cp -f /tmp/docker-compose.yml.new docker-compose.yml
docker-compose -f docker-compose.yml config > /dev/null
docker-compose -f docker-compose.yml build pulse-im
docker-compose -f docker-compose.yml build pulse-api
docker-compose -f docker-compose.yml up -d postgres
docker-compose -f docker-compose.yml up -d pulse-im
docker-compose -f docker-compose.yml up -d pulse-api
docker-compose -f docker-compose.yml restart nginx
sysctl -w net.core.somaxconn=4096
sysctl -w net.ipv4.tcp_max_syn_backlog=4096
cat > /etc/sysctl.d/99-pulse.conf <<'EOF'
net.core.somaxconn=4096
net.ipv4.tcp_max_syn_backlog=4096
EOF
echo APPLY_DONE
