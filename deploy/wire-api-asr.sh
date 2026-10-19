#!/bin/bash
set -e
cd /opt/pulseim
cp -f docker-compose.prod.yml docker-compose.yml
docker-compose up -d --no-deps --force-recreate pulse-api
sleep 3
docker cp artifacts/api/pulse-api-1.0.0-SNAPSHOT.jar pulse-api:/app/app.jar
if ! docker exec pulse-api which ffmpeg >/dev/null 2>&1; then
  docker exec -u root pulse-api bash -lc 'sed -i "s|http://archive.ubuntu.com/ubuntu|http://mirrors.aliyun.com/ubuntu|g" /etc/apt/sources.list || true; sed -i "s|http://security.ubuntu.com/ubuntu|http://mirrors.aliyun.com/ubuntu|g" /etc/apt/sources.list || true; apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ffmpeg'
  docker commit pulse-api pulseim_pulse-api:latest
fi
docker restart pulse-api
for i in $(seq 1 25); do
  code=$(curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:6080/api/v1/auth/sms/send -X OPTIONS || true)
  echo "api$i:$code"
  if [ "$code" = "200" ]; then break; fi
  sleep 3
done
echo "PULSE_ASR_URL=$(docker exec pulse-api printenv PULSE_ASR_URL)"
docker exec pulse-api bash -lc 'command -v curl >/dev/null || (apt-get update -qq && apt-get install -y -qq curl >/dev/null); curl -s --max-time 5 http://pulse-asr:3978/health; echo'
docker exec pulse-api which ffmpeg
echo DONE
