#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${1:-gkash_ussd}"
DB_USER="${2:-gkash_app}"
DB_PASSWORD="${3:-gkash_app_password}"

echo "Creating role/database in local PostgreSQL..."
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO
\$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
SQL

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
fi

echo "Done."
echo "Set this in TiaraConnect/.env:"
echo "DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
