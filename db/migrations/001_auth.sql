-- Better Auth 1.7.5 schema; app-generated IDs are UUIDs.
begin;
create table public."cadence_user" (
  "id" uuid primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" boolean not null default false,
  "image" text,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null
);
revoke all on public."cadence_user" from public;
create table public."cadence_auth_session" (
  "id" uuid primary key,
  "expiresAt" timestamptz not null,
  "token" text not null unique,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid not null references public."cadence_user"(id) on delete cascade
);
create index "cadence_auth_session_userId_idx" on public."cadence_auth_session"("userId");
revoke all on public."cadence_auth_session" from public;
create table public."cadence_account" (
  "id" uuid primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" uuid not null references public."cadence_user"(id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null
);
create index "cadence_account_userId_idx" on public."cadence_account"("userId");
revoke all on public."cadence_account" from public;
create table public."cadence_verification" (
  "id" uuid primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null
);
create index "cadence_verification_identifier_idx" on public."cadence_verification"("identifier");
revoke all on public."cadence_verification" from public;
commit;
