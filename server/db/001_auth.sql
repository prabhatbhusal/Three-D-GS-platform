-- Studio accounts (usersStore-pg.js). Emails are stored lowercased by the
-- app, so a plain unique constraint is the uniqueness check.
-- Down: drop table app.users;
create table app.users (
  id uuid primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  role text not null default 'editor' check (role in ('admin', 'editor', 'staff')),
  -- sessions issued before this are void (middleware/auth.js staleReason)
  password_changed_at timestamptz,
  -- the one live reset link: its sha256, never the token itself
  reset_hash text unique,
  reset_expires timestamptz,
  created_at timestamptz not null default now()
);

-- Only the server's own connection reads this; no policies means the
-- Data API's anon/authenticated roles get nothing even if exposed.
alter table app.users enable row level security;
