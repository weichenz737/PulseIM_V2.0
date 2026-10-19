#!/bin/bash
set -e
cd /opt/pulseim

echo "== install ffmpeg into pulse-api =="
docker exec -u root pulse-api bash -lc 'set -e
if [ -f /etc/apt/sources.list ]; then
  sed -i "s|http://archive.ubuntu.com/ubuntu|http://mirrors.aliyun.com/ubuntu|g" /etc/apt/sources.list || true
  sed -i "s|http://security.ubuntu.com/ubuntu|http://mirrors.aliyun.com/ubuntu|g" /etc/apt/sources.list || true
fi
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ffmpeg
ffmpeg -version | head -1
which ffmpeg
'

echo "== commit image with ffmpeg =="
docker commit pulse-api pulseim_pulse-api:latest
docker tag pulseim_pulse-api:latest pulseim_pulse-api:with-ffmpeg

echo "== verify =="
docker exec pulse-api which ffmpeg
docker exec pulse-api ffmpeg -version | head -1
echo DONE
