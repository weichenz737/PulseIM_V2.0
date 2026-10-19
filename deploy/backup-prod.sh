#!/bin/sh
set -eu

cd "$(dirname "$0")"
stamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="$(pwd)/backups/$stamp"
mkdir -p "$backup_dir"

docker exec pulse-postgres pg_dump -U pulse -d pulseim -Fc > "$backup_dir/pulseim.dump"
upload_volume="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}' pulse-api)"
if [ -z "$upload_volume" ]; then
  echo "ERROR: could not resolve the pulse-api uploads volume." >&2
  exit 1
fi
docker run --rm \
  -v "$upload_volume:/source:ro" \
  -v "$backup_dir:/backup" \
  alpine:3.20 \
  tar -czf /backup/uploads.tgz -C /source .

sha256sum "$backup_dir/pulseim.dump" "$backup_dir/uploads.tgz" > "$backup_dir/SHA256SUMS"
echo "Backup created: $backup_dir"
