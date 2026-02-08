#!/bin/bash
set -eu

# Substitute env vars in kong.yml template
sed \
  -e "s|\${SUPABASE_ANON_KEY}|${SUPABASE_ANON_KEY}|g" \
  -e "s|\${SUPABASE_SERVICE_KEY}|${SUPABASE_SERVICE_KEY}|g" \
  /home/kong/temp.yml > /home/kong/kong.yml

exec /docker-entrypoint.sh kong docker-start
