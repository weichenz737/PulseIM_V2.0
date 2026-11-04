# PulseIM production operations

## Linux server prerequisites

Use a 64-bit Linux host with Docker Engine and the Docker Compose plugin (`docker compose`).
The production Dockerfiles package prebuilt API/IM JARs and mobile/admin `dist` directories
from `deploy/artifacts/`. Build those artifacts first with JDK 21, Maven 3.9+, and Node 22
on a build machine, or install those tools on the server if building there. The runtime host
does not need separate Java, Node, PostgreSQL, Redis, or MinIO installations. Keep Docker enabled
after reboot and provide enough disk space for images, PostgreSQL, backups, and uploaded media.
The current PostgreSQL configuration reserves 2 GiB for shared buffers, so size memory
accordingly and confirm capacity with a load test.

The production Compose file is adapted to an existing host and must be reviewed before
using it on a new server:

| Purpose | Current host port | Public access |
| --- | --- | --- |
| Nginx HTTP | 6081/tcp | Only if serving HTTP or redirecting to HTTPS |
| Nginx HTTPS | 6080, 6443, 6843/tcp | Open only the selected HTTPS entry point |
| TURN/STUN | 3478/tcp+udp, 49160-49200/udp | Required for calls across networks |
| API, IM, mobile, admin | 18080, 19001, 18082, 18083/tcp | Bound to 127.0.0.1; do not expose publicly |
| MinIO API/console | 19090, 19091/tcp | Bound to 127.0.0.1; do not expose publicly |
| PostgreSQL, Redis | Docker internal network | Do not expose publicly |

The production Compose file includes MinIO with persistent storage. Set `TURN_URLS` to the
new server's public address and replace the old `external-ip` in `coturn/turnserver.conf`.
Install a trusted certificate and key at
`nginx/certs/pulse.crt` and `nginx/certs/pulse.key`, or adapt the mounts to your reverse proxy.
For standard public `80/443`, change the Nginx port mappings or place a reverse proxy in front.
Mobile and desktop web assets use the same-origin API/WS proxy; packaged Android and Electron
clients need their server origin set at build time with `VITE_SERVER_ORIGIN` or configured in
the client. Fresh packaged clients default to the local development server and do not
bootstrap against the previous production server. Use a trusted HTTPS certificate for the
new public origin. The desktop web bundle is built
separately with `deploy/build-desktop-web.ps1` and is not included in this Compose file.

## Required configuration

After successful Maven `verify` and production builds for `frontend/mobile`, `frontend/admin`
and `frontend/desktop`, run `./deploy/prepare-artifacts.ps1` on Windows to populate the ignored
`deploy/artifacts/` directories from tracked Dockerfile/Nginx templates. Pass
`-BackendBuildRoot <isolated-backend-directory>` if local development services hold JARs open.
The script produces a release manifest with the Git revision and SHA-256 hashes. Build outputs
and real server configuration are distributed separately from Git source.

Copy `.env.prod.example` to `.env` on the production host and replace every placeholder.
Never commit or package the real `.env` file.

```sh
cp .env.prod.example .env
chmod 600 .env
sh ./validate-prod.sh
```

`DB_PASSWORD`, `JWT_SECRET`, `TURN_CREDENTIAL`, `MINIO_ACCESS_KEY`,
`MINIO_SECRET_KEY`, `MINIO_PUBLIC_URL`, `TURN_URLS`, and `CORS_ALLOWED_ORIGINS` are mandatory.
`MINIO_PUBLIC_URL` must be a browser-reachable HTTPS bucket URL; the example path also needs
a matching reverse-proxy route or a separate public MinIO endpoint. MinIO presigned avatar
upload URLs are generated from the server's `MINIO_ENDPOINT`, so test avatar upload from a
real client before release and provide a public endpoint or upload proxy if needed.
`SMS_DEV_FIXED_CODE` must remain empty in production.

For an existing PostgreSQL volume, changing `DB_PASSWORD` in `.env` does not change the
database role automatically. Rotate the `pulse` role password in PostgreSQL first, then
update `.env`, and restart API/IM together. Keep the old application containers available
until the new credentials have passed health checks.

Changing `JWT_SECRET` immediately invalidates every existing user and admin token. Plan a
maintenance window and restart API and IM with the same new value.

## Backup before deployment

```sh
sh ./backup-prod.sh
```

The command creates a timestamped PostgreSQL custom-format dump, an uploads archive, a
MinIO data archive, and SHA-256 checksums under `deploy/backups/`. Pause uploads while
archiving MinIO so the backup is consistent. Copy backups to a different host or object store;
a backup on the same server is not sufficient disaster recovery.

## Deployment gate

Always run the preflight before building or recreating production containers:

```sh
sh ./validate-prod.sh
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

Do not reload Nginx or remove previous artifacts until API, IM, mobile, and admin report
healthy. Database migrations run in fail-fast mode under the `prod` profile: a failed
migration must stop the release instead of allowing a partially migrated API to start.
