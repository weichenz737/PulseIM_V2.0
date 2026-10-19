#!/bin/bash
echo "--- deleting old apks ---"
docker exec pulse-api sh -c 'find /app/uploads -maxdepth 1 -type f -name "*.apk" ! -name "PulseIM-v2-2.4.apk" -delete'
echo "--- remaining apks ---"
docker exec pulse-api sh -c 'ls -la /app/uploads/*.apk 2>/dev/null'
echo "--- download check ---"
curl -sk -o /dev/null -w '2.4 HTTP %{http_code} size %{size_download}\n' https://127.0.0.1:6080/api/v1/files/raw/PulseIM-v2-2.4.apk
