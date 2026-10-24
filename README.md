# Barber Shop Management Software

## Run locally
```bash
cp .env.example .env            # edit secrets
docker compose up -d            # Postgres
npm install
set -a; source .env; set +a
npm run build
npm run migrate -w @barbershop/api
PLATFORM_ADMIN_EMAIL=you@example.com PLATFORM_ADMIN_PASSWORD='Str0ngPass!' npm run create-platform-admin -w @barbershop/api
npm run dev:api                 # http://localhost:4000/api/v1/health/db
npm test                        # full suite (spins up its own temporary Postgres; no Docker needed)
```
Decisions: `docs/DECISIONS.md`.
