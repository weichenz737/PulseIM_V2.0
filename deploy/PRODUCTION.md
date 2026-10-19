# PulseIM production operations

## Required configuration

Copy `.env.prod.example` to `.env` on the production host and replace every placeholder.
Never commit or package the real `.env` file.

```sh
cp .env.prod.example .env
chmod 600 .env
./validate-prod.sh
```

`DB_PASSWORD`, `JWT_SECRET`, `TURN_CREDENTIAL`, and `CORS_ALLOWED_ORIGINS` are mandatory.
`SMS_DEV_FIXED_CODE` must remain empty in production.

For an existing PostgreSQL volume, changing `DB_PASSWORD` in `.env` does not change the
database role automatically. Rotate the `pulse` role password in PostgreSQL first, then
update `.env`, and restart API/IM together. Keep the old application containers available
until the new credentials have passed health checks.

Changing `JWT_SECRET` immediately invalidates every existing user and admin token. Plan a
maintenance window and restart API and IM with the same new value.

## Backup before deployment

```sh
./backup-prod.sh
```

The command creates a timestamped PostgreSQL custom-format dump, an uploads archive, and
SHA-256 checksums under `deploy/backups/`. Copy backups to a different host or object store;
a backup on the same server is not sufficient disaster recovery.

## Deployment gate

Always run the preflight before building or recreating production containers:

```sh
./validate-prod.sh
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d
docker-compose -f docker-compose.prod.yml ps
```

Do not reload Nginx or remove previous artifacts until API, IM, mobile, and admin report
healthy. Database migrations run in fail-fast mode under the `prod` profile: a failed
migration must stop the release instead of allowing a partially migrated API to start.
