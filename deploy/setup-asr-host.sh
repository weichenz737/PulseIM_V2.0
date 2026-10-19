#!/bin/bash
set -e
cd /opt/pulseim
tar -xzf /opt/pulseim-asr.tgz
cp -f docker-compose.prod.yml docker-compose.yml

NODE_DIR=/opt/pulse-node
NODE_VER=v20.18.1
export PATH="$NODE_DIR/bin:$PATH"

if [ ! -x "$NODE_DIR/bin/node" ]; then
  echo "== install node $NODE_VER =="
  mkdir -p /tmp/pulse-node-dl "$NODE_DIR"
  curl -fsSL "https://npmmirror.com/mirrors/node/${NODE_VER}/node-${NODE_VER}-linux-x64.tar.xz" \
    -o /tmp/pulse-node-dl/node.tar.xz
  tar -xJf /tmp/pulse-node-dl/node.tar.xz -C "$NODE_DIR" --strip-components=1
fi
node -v

ASR_DIR=/opt/pulseim/artifacts/asr
mkdir -p /opt/pulseim/asr-cache
cd "$ASR_DIR"

echo "== npm install (ignore scripts) =="
npm install --omit=dev --ignore-scripts --registry=https://registry.npmmirror.com

echo "== patch onnxruntime-node installer for redirects =="
python3 - <<'PY'
from pathlib import Path
p = Path('/opt/pulseim/artifacts/asr/node_modules/onnxruntime-node/script/install-utils.js')
s = p.read_text()
if 'followRedirectsPatched' in s:
    print('already patched')
else:
    needle = "if (statusCode !== 200) {\n          reject(new Error(`Failed to download"
    # replace all non-200 rejects that don't follow redirects — insert redirect handling before each
    old = """request.on('response', (response) => {
        const { statusCode } = response;
        if (statusCode !== 200) {
          reject(new Error(`Failed to download binary. HTTP status code = ${statusCode}`));
          return;
        }"""
    new = """request.on('response', (response) => {
        const { statusCode } = response;
        // followRedirectsPatched
        if (statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) {
          const loc = response.headers.location;
          response.resume();
          if (!loc) { reject(new Error('redirect without location')); return; }
          httpsGet(loc).then(resolve, reject);
          return;
        }
        if (statusCode !== 200) {
          reject(new Error(`Failed to download binary. HTTP status code = ${statusCode}`));
          return;
        }"""
    if old in s:
        s = s.replace(old, new)
    old2 = """request.on('response', (response) => {
        const { statusCode } = response;
        if (statusCode !== 200) {
          reject(new Error(`Failed to download build list. HTTP status code = ${statusCode}`));
          return;
        }"""
    new2 = """request.on('response', (response) => {
        const { statusCode } = response;
        // followRedirectsPatched
        if (statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) {
          const loc = response.headers.location;
          response.resume();
          if (!loc) { reject(new Error('redirect without location')); return; }
          httpsGet(loc).then(resolve, reject);
          return;
        }
        if (statusCode !== 200) {
          reject(new Error(`Failed to download build list. HTTP status code = ${statusCode}`));
          return;
        }"""
    if old2 in s:
        s = s.replace(old2, new2)
    p.write_text(s)
    print('patched')
PY

cd "$ASR_DIR/node_modules/onnxruntime-node"
node ./script/install

cd "$ASR_DIR"
echo "== start ASR daemon =="
pkill -f "/opt/pulseim/artifacts/asr/server.mjs" 2>/dev/null || true
sleep 1
export PULSE_ASR_PORT=3978
export PULSE_ASR_MODEL=Xenova/whisper-tiny
export HF_ENDPOINT=https://hf-mirror.com
export TRANSFORMERS_CACHE=/opt/pulseim/asr-cache
nohup "$NODE_DIR/bin/node" "$ASR_DIR/server.mjs" > /opt/pulseim/asr.log 2>&1 &
echo $! > /opt/pulseim/asr.pid

for i in $(seq 1 90); do
  body=$(curl -s --max-time 2 http://127.0.0.1:3978/health || true)
  echo "health_$i:$body"
  if echo "$body" | grep -q '"ready":true'; then
    echo asr_ready
    break
  fi
  # show log progress
  if [ $((i % 5)) -eq 0 ]; then
    tail -5 /opt/pulseim/asr.log || true
  fi
  sleep 4
done

echo "== recreate pulse-api =="
docker-compose up -d --no-deps --force-recreate pulse-api
sleep 2
docker cp /opt/pulseim/artifacts/api/pulse-api-1.0.0-SNAPSHOT.jar pulse-api:/app/app.jar
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

echo "== verify from api container =="
docker exec pulse-api printenv PULSE_ASR_URL
docker exec pulse-api bash -lc 'command -v curl >/dev/null || (apt-get update -qq && apt-get install -y -qq curl); curl -s --max-time 3 http://host.docker.internal:3978/health; echo'
curl -s http://127.0.0.1:3978/health; echo
tail -15 /opt/pulseim/asr.log || true
echo DONE
