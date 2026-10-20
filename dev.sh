#!/bin/bash
# Run MYT Pulse on your own computer: ./dev.sh   then open http://localhost:8788
set -e
cd "$(dirname "$0")"
ID=$(grep -E '^database_id' wrangler.toml | sed -E 's/.*"(.*)".*/\1/')
W="npx -y wrangler@3"

if [ ! -f .dev.vars ]; then
  printf 'ADMIN_PASSWORD=test123\nSESSION_SECRET=local-dev-secret-change-me\n' > .dev.vars
  echo "Created .dev.vars (local admin password: test123)"
fi

# First run: create tables and load the 2025 data into the local test database
if ! $W d1 execute myt-pulse --local --command "SELECT COUNT(*) FROM ratings" >/dev/null 2>&1; then
  echo "Setting up local database (one time, about a minute)..."
  $W d1 execute myt-pulse --local --file db/schema.sql >/dev/null 2>&1
  for f in db/seed_2025_*.sql; do echo "  loading $f"; $W d1 execute myt-pulse --local --file "$f" >/dev/null 2>&1; done
  echo "Done."
fi

echo ""
echo "  Student form : http://localhost:8788"
echo "  Admin        : http://localhost:8788/admin   (password is in .dev.vars)"
echo "  Teacher view : http://localhost:8788/me"
echo "  Stop with Ctrl+C"
echo ""
$W pages dev public --d1 DB="$ID" --persist-to .wrangler/state --port 8788
