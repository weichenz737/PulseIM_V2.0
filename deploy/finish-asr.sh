#!/bin/bash
set -e
cd /opt/pulseim
cp -f docker-compose.prod.yml docker-compose.yml

cat > artifacts/asr/Dockerfile <<'EOF'
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PULSE_ASR_PORT=3978
ENV PULSE_ASR_MODEL=Xenova/whisper-tiny
ENV HF_ENDPOINT=https://hf-mirror.com
ENV TRANSFORMERS_CACHE=/data/hf-cache
ENV ONNXRUNTIME_NODE_INSTALL=skip
RUN mkdir -p /data/hf-cache
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts --registry=https://registry.npmmirror.com
COPY server.mjs transcribe.mjs ./
EXPOSE 3978
CMD ["node", "server.mjs"]
EOF

docker-compose up -d pulse-asr

echo "== wait asr ready =="
for i in $(seq 1 90); do
  body=$(docker exec pulse-asr wget -qO- http://127.0.0.1:3978/health 2>/dev/null || true)
  if [ -z "$body" ]; then
    body=$(docker exec pulse-asr node -e 'require("http").get("http://127.0.0.1:3978/health",r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>console.log(d))}).on("error",()=>process.exit(1))' 2>/dev/null || true)
  fi
  echo "h$i:$body"
  if echo "$body" | grep -q '"ready":true'; then
    echo asr_ready
    break
  fi
  if [ $((i % 5)) -eq 0 ]; then
    docker logs pulse-asr --tail 12 2>&1 || true
  fi
  sleep 4
done

echo "== recreate api =="
docker-compose up -d --no-deps --force-recreate pulse-api
sleep 2
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
docker ps --format '{{.Names}} {{.Status}}' | grep pulse
docker logs pulse-asr --tail 25 2>&1
echo DONE
