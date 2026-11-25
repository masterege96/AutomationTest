// "Rows in the DB" are checked as `postgres` on the local database, not through the app (brief, AC preamble).
// psql runs inside the local stack's DB container (`supabase_db_<project_id>`), the same way db-builder checked
// the schema. No connection string or password is needed or stored. Values are passed as hex literals, so no test
// string is ever spliced into SQL text.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function container(): string {
  const toml = readFileSync(join(process.cwd(), "supabase", "config.toml"), "utf8");
  const m = /^project_id\s*=\s*"([^"]+)"/m.exec(toml);
  if (!m) throw new Error("supabase/config.toml has no project_id");
  return `supabase_db_${m[1]}`;
}

/** A SQL text literal for any string (emoji, quotes, HTML), built from its UTF-8 hex. */
export function lit(value: string): string {
  return `convert_from(decode('${Buffer.from(value, "utf8").toString("hex")}', 'hex'), 'UTF8')`;
}

export function uuidLit(id: string): string {
  if (!UUID_RE.test(id)) throw new Error("not a uuid");
  return `'${id}'::uuid`;
}

function psql(query: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", container(), "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-f", "-"],
    { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}

/** Runs a query and returns its rows as JSON objects. */
export function rows<T = Record<string, unknown>>(query: string): T[] {
  // A CTE (not a subquery) so data-changing statements with `returning` work too.
  const out = psql(`with t as (${query}) select coalesce(json_agg(t), '[]'::json) from t;`).trim();
  return JSON.parse(out) as T[];
}

/** Runs a statement as postgres (seed data). */
export function exec(statement: string): void {
  psql(statement);
}

export type TodoRow = {
  id: string;
  user_id: string;
  title: string;
  done: boolean;
  created_at: string;
  updated_at: string;
};

export function todoById(id: string): TodoRow | undefined {
  return rows<TodoRow>(`select * from public.todos where id = ${uuidLit(id)}`)[0];
}

export function todosOf(userId: string): TodoRow[] {
  // Newest first, ties by id (schema.md section 6). Ranked in SQL and sorted here, because json_agg over a CTE
  // doesn't promise to keep the order.
  return rows<TodoRow & { rn: number }>(
    `select *, row_number() over (order by created_at desc, id desc)::int as rn
       from public.todos where user_id = ${uuidLit(userId)}`,
  ).sort((a, b) => a.rn - b.rn);
}

export function todosWithTitle(title: string): TodoRow[] {
  return rows<TodoRow>(`select * from public.todos where title = ${lit(title)}`);
}

export function countAllTodos(): number {
  return rows<{ n: number }>(`select count(*)::int as n from public.todos`)[0].n;
}

/** Inserts a to-do as postgres (test setup, not under test). `ageSeconds` backdates it so the order is fixed. */
export function seedTodo(userId: string, title: string, opts: { done?: boolean; ageSeconds?: number } = {}): string {
  const age = Math.max(0, Math.floor(opts.ageSeconds ?? 0));
  const r = rows<{ id: string }>(
    `insert into public.todos (user_id, title, done, created_at, updated_at)
     values (${uuidLit(userId)}, ${lit(title)}, ${opts.done ? "true" : "false"},
             now() - make_interval(secs => ${age}), now() - make_interval(secs => ${age}))
     returning id`,
  );
  return r[0].id;
}

export type AuthUserRow = {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  raw_app_meta_data: Record<string, unknown> | null;
  raw_user_meta_data: Record<string, unknown> | null;
};

export function authUsersByEmail(email: string): AuthUserRow[] {
  return rows<AuthUserRow>(
    `select id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data
       from auth.users where lower(email) = lower(${lit(email)})`,
  );
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
