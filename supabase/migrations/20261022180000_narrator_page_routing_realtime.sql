-- Player page overrides are stored in game_members.viewing_page_id.
-- Publish membership row changes so connected players can react immediately
-- when a narrator routes them to a different scenario.
do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_members'
  ) then
    alter publication supabase_realtime add table public.game_members;
  end if;
end;
$$;
