#!/bin/sh
set -eu

cd "$(dirname "$0")"
stamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="$(pwd)/backups/$stamp"
mkdir -p "$backup_dir"

docker exec pulse-postgres pg_dump -U pulse -d pulseim -Fc > "$backup_dir/pulseim.dump"
upload_type="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Type}}{{end}}{{end}}' pulse-api)"
upload_source="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Source}}{{end}}{{end}}' pulse-api)"
upload_name="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}' pulse-api)"
if [ -z "$upload_type" ] || [ -z "$upload_source" ]; then
  echo "ERROR: could not resolve the pulse-api uploads mount." >&2
  exit 1
fi
if [ "$upload_type" = "bind" ]; then
  tar -czf "$backup_dir/uploads.tgz" -C "$upload_source" .
elif [ "$upload_type" = "volume" ]; then
  if [ -z "$upload_name" ]; then
    echo "ERROR: could not resolve the uploads volume name." >&2
    exit 1
  fi
  docker run --rm \
    -v "$upload_name:/source:ro" \
    -v "$backup_dir:/backup" \
    alpine:3.20 \
    tar -czf /backup/uploads.tgz -C /source .
else
  echo "ERROR: unsupported uploads mount type: $upload_type" >&2
  exit 1
fi

if [ -d /opt/pulseim/data/minio ]; then
  tar -czf "$backup_dir/minio.tgz" -C /opt/pulseim/data/minio .
else
  echo "ERROR: MinIO data directory is missing: /opt/pulseim/data/minio" >&2
  exit 1
fi

sha256sum "$backup_dir/pulseim.dump" "$backup_dir/uploads.tgz" "$backup_dir/minio.tgz" > "$backup_dir/SHA256SUMS"
echo "Backup created: $backup_dir"
