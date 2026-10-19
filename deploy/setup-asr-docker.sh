#!/bin/bash
set -e
cd /opt/pulseim
tar -xzf /opt/pulseim-asr.tgz 2>/dev/null || true
cp -f docker-compose.prod.yml docker-compose.yml

echo "== build pulse-asr =="
docker-compose build pulse-asr

echo "== start pulse-asr =="
docker-compose up -d pulse-asr

echo "== wait model ready =="
for i in $(seq 1 90); do
  body=$(docker exec pulse-asr node -e "fetch('http://127.0.0.1:3978/health').then(r=>r.text()).then(t=>console.log(t)).catch(()=>process.exit(1))" 2>/dev/null || true)
  echo "health_$i:$body"
  if echo "$body" | grep -q '"ready":true'; then
    echo asr_ready
    break
  fi
  if [ $((i % 5)) -eq 0 ]; then
    docker logs pulse-asr --tail 8 2>&1 || true
  fi
  sleep 4
done

echo "== recreate api with ASR url =="
docker-compose up -d --no-deps --force-recreate pulse-api
sleep 2
docker cp artifacts/api/pulse-api-1.0.0-SNAPSHOT.jar pulse-api:/app/app.jar
if ! docker exec pulse-api which ffmpeg >/dev/null 2>&1; then
  docker exec -u root pulse-api bash -lc 'sed -i "s|http://archive.ubuntu.com/ubuntu|http://mirrors.aliyun.com/ubuntu|g" /etc/apt/sources.list || true; sed -i "s|http://security.ubuntu.com/ubuntu|http://mirrors.aliyun.com/ubuntu|g" /etc/apt/sources.list || true; apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ffmpeg'
  docker commit pulse-api pulseim_pulse-api:latest
fi
docker restart pulse-api

for i in $(seq 1 20); do
  code=$(curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:6080/api/v1/auth/sms/send -X OPTIONS || true)
  echo "api_$i:$code"
  [ "$code" = "200" ] && break
  sleep 3
done

echo "== verify =="
docker exec pulse-api printenv PULSE_ASR_URL
docker exec pulse-api bash -lc 'command -v curl >/dev/null || (apt-get update -qq && apt-get install -y -qq curl >/dev/null); curl -s --max-time 3 http://pulse-asr:3978/health; echo'
docker ps --format '{{.Names}} {{.Status}}' | grep pulse
echo DONE
