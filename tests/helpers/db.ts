// An in-process Postgres (PGlite) with just enough of Supabase's auth and storage
// schemas to run the real migrations, so the database rules can be tested without
// Docker. Queries made through `as()` run as the `authenticated` role, under RLS.
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

const SUPABASE_SHIM = `
  create role anon nologin;
  create role authenticated nologin;

  create schema auth;
  create table auth.users (
    id uuid primary key, email text not null, raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;

  grant usage on schema public, auth, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant select, insert, delete on storage.objects to authenticated;
`;

export type Row = Record<string, unknown>;

export async function createTestDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(directory).sort()) {
    // Each migration in its own transaction, as the Supabase CLI applies them.
    await db.transaction(async (tx) => {
      await tx.exec(readFileSync(new URL(file, directory), "utf8"));
    });
  }

  /** Runs one statement as the given signed-in user. */
  function as(userId: string) {
    const query = <T extends Row = Row>(sql: string, params: unknown[] = []) =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
        await tx.exec("set local role authenticated");
        return (await tx.query<T>(sql, params)).rows;
      });
    return {
      query,
      /** The single column of the single row, e.g. a function's result. */
      async value<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
        const rows = await query(sql, params);
        return Object.values(rows[0] ?? {})[0] as T;
      },
    };
  }

  async function createUser(label: string) {
    const id = randomUUID();
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${label}@example.test`]);
    return { id, email: `${label}@example.test`, ...as(id) };
  }

  return { db, createUser };
}
