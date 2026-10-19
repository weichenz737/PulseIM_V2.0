#!/bin/bash
set -e
cd /opt/pulseim
tar -xzf /opt/pulseim-asr.tgz
cp -f docker-compose.prod.yml docker-compose.yml

echo "== build pulse-asr =="
docker-compose build pulse-asr

echo "== start pulse-asr =="
docker-compose up -d pulse-asr

echo "== wait asr health =="
ready=0
for i in $(seq 1 60); do
  if docker exec pulse-asr node -e "fetch('http://127.0.0.1:3978/health').then(r=>r.json()).then(j=>{if(!j.ok)process.exit(2)}).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "asr_up_try_$i"
    # wait until model ready if possible
    body=$(docker exec pulse-asr node -e "fetch('http://127.0.0.1:3978/health').then(r=>r.text()).then(t=>console.log(t)).catch(e=>{console.log('err');process.exit(1)})" 2>/dev/null || true)
    echo "$body"
    if echo "$body" | grep -q '"ready":true'; then
      ready=1
      break
    fi
  fi
  sleep 5
done

echo "== recreate pulse-api with ASR env =="
docker-compose up -d --no-deps --force-recreate pulse-api
sleep 2
docker cp artifacts/api/pulse-api-1.0.0-SNAPSHOT.jar pulse-api:/app/app.jar
# keep ffmpeg: commit after jar swap? ffmpeg already in image; recreate used image with ffmpeg
# but recreate wiped filesystem changes from previous ffmpeg apt if image didn't have it
# Check ffmpeg
if ! docker exec pulse-api which ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg missing, reinstalling..."
  docker exec -u root pulse-api bash -lc 'sed -i "s|http://archive.ubuntu.com/ubuntu|http://mirrors.aliyun.com/ubuntu|g" /etc/apt/sources.list || true; sed -i "s|http://security.ubuntu.com/ubuntu|http://mirrors.aliyun.com/ubuntu|g" /etc/apt/sources.list || true; apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ffmpeg'
  docker commit pulse-api pulseim_pulse-api:latest
fi
docker restart pulse-api

echo "== wait api =="
for i in $(seq 1 20); do
  code=$(curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:6080/api/v1/auth/sms/send -X OPTIONS || true)
  echo "api_try_$i:$code"
  if [ "$code" = "200" ]; then break; fi
  sleep 3
done

echo "== env check =="
docker exec pulse-api printenv PULSE_ASR_URL || true
docker exec pulse-api which ffmpeg || true
docker ps --format '{{.Names}} {{.Status}}' | grep pulse
echo "asr_ready=$ready"
echo DONE
