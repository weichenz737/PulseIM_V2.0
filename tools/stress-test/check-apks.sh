#!/bin/bash
echo "--- old apk count ---"
docker exec pulse-api sh -c 'find /app/uploads -maxdepth 1 -type f -name "*.apk" ! -name "PulseIM-v2-2.4.apk" | wc -l'
echo "--- old apk total size ---"
docker exec pulse-api sh -c 'find /app/uploads -maxdepth 1 -type f -name "*.apk" ! -name "PulseIM-v2-2.4.apk" -printf "%s\n" | awk "{s+=\$1} END {printf \"total_bytes=%d (%.2f GB)\\n\", s, s/1073741824}"'
echo "--- version record ---"
docker exec pulse-postgres psql -U pulse -d pulseim -tAc 'SELECT apk_name FROM sys_app_version;'
