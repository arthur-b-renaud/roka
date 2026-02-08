-- Set Supabase service role passwords to match POSTGRES_PASSWORD.
-- Runs after migrate.sh (which creates authenticator, supabase_auth_admin, etc.)

\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';

-- Realtime needs this schema to exist before it runs its own migrations
CREATE SCHEMA IF NOT EXISTS _realtime;
