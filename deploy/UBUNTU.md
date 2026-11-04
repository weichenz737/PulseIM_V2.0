# Ubuntu deployment alongside existing applications

Use `docker-compose.ubuntu.yml` with project name `pulseim`. It publishes application
services only on loopback; the existing host Nginx provides the public gateway.
Do not replace another application's Nginx configuration or database volumes.

## Prepare and start

1. Build the backend and three frontends, setting `VITE_DEPLOY_PREFIX=/pulseim` for
   web builds. Run `prepare-artifacts.ps1` and copy the artifacts, compose file,
   `postgres/init.sql`, and Ubuntu gateway templates to a release directory.
2. Run `python3 init-ubuntu-env.py PUBLIC_IP DEPLOY_DIRECTORY` once. This exclusively
   creates a mode-0600 `.env` with random secrets. Reuse this environment for later
   releases; generating new secrets does not rotate existing database credentials.
3. Validate with `docker compose -p pulseim -f docker-compose.ubuntu.yml config --quiet`.
   Build, then run `docker compose -p pulseim -f docker-compose.ubuntu.yml up -d`.
4. Before exposing the API, replace the seeded administrator password with the
   generated `ADMIN_PASSWORD`, using the application's password reset mechanism or
   PostgreSQL `crypt(password, gen_salt('bf', 12))` for this initial deployment.
5. Wait for API, IM and web container health checks. Point `/opt/pulseim/current`
   at the release directory, replace `__PUBLIC_IP__` in the public Nginx template,
   and install it in `/etc/nginx/conf.d/`. Test Nginx before reloading.

The gateway expects a valid certificate in `/etc/letsencrypt/live/PUBLIC_IP/`.
For an IP certificate, configure automatic renewal and an Nginx reload deploy hook.
Keep the ACME webroot `/var/www/pulseim-acme` reachable on port 80 during renewal.

## Public entry points

- Web application: `https://PUBLIC_IP/pulseim/`
- Administration: `https://PUBLIC_IP/pulseim/admin/`
- Desktop web: `https://PUBLIC_IP/pulseim/desktop/`
- Bundled Android server setting: `https://PUBLIC_IP` (without `/pulseim`)

Public ports: TCP 22 for SSH, TCP 80/443 for web and certificate renewal,
TCP/UDP 3478 for TURN/STUN, and UDP 49160–49200 for relayed call media.
Keep PostgreSQL, Redis, MinIO, API, and IM host ports private.

## Data and updates

PostgreSQL and Redis use project-scoped volumes. Upload working files and MinIO
objects live under `/opt/pulseim/data`. Preserve these during releases. Copy the
previous private `.env` into the next release and compare its compose configuration
before recreating services. Do not run `down -v` on a production stack.

`backup-prod.sh` also supports this stack because it resolves mounts by container
name. Quiesce uploads while archiving object storage. Store a backup off the host.
Credentials and backup files must remain private and must not be committed.

To roll back application code, select the previous release, reuse the current
environment, recreate its services, switch the `current` symlink, and reload Nginx
after a successful configuration test. Check schema compatibility before rollback;
restoring a database backup can lose changes made after the backup.

SMS registration requires a configured SMS provider. Production fixed SMS codes
are disabled. An administrator can create accounts in the user management page.
