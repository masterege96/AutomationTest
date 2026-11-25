-- Task 3: to-do table (specs/3/schema.md). Each signed-in user can create, list, change (title, done) and
-- remove only their own to-dos. Adds objects only; changes no existing object or data.

create table public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Stored title is already trimmed (same character set as JavaScript's String.prototype.trim())
  -- and 1 to 200 code points long (specs/3/schema.md section 1).
  constraint todos_title_trimmed check (title = btrim(title, E' \t\n\u000B\f\r                 　﻿')),
  constraint todos_title_length check (char_length(title) between 1 and 200)
);

-- RLS predicate, newest-first list, and the foreign key lookup.
create index todos_user_id_created_at_idx on public.todos (user_id, created_at desc, id desc);

-- updated_at is server-computed. Trigger functions need no EXECUTE grant to fire; none is given (task 2a).
create function public.todos_set_updated_at() returns trigger
  language plpgsql security invoker set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.todos_set_updated_at() from public, anon, authenticated;

create trigger todos_set_updated_at before update on public.todos
  for each row execute function public.todos_set_updated_at();

-- Row level security: only the owner, only signed in. No policy for anon.
alter table public.todos enable row level security;

create policy todos_select_own on public.todos for select to authenticated
  using ((select auth.uid()) = user_id);
create policy todos_insert_own on public.todos for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy todos_update_own on public.todos for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy todos_delete_own on public.todos for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Explicit grants (default privileges grant nothing in production, lesson L14). Clients may insert only the
-- title and change only title and done; id, user_id, created_at and updated_at come from the server.
revoke all on table public.todos from anon, authenticated;
grant select, delete on table public.todos to authenticated;
grant insert (title) on table public.todos to authenticated;
grant update (title, done) on table public.todos to authenticated;
