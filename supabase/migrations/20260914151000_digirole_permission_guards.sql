-- Only the game narrator may change who can view or edit a DigiRole sheet.
create or replace function public.protect_digirole_permission_lists()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    old.allowed_viewers is distinct from new.allowed_viewers
    or old.allowed_editors is distinct from new.allowed_editors
  ) and not public.is_game_narrator(new.game_id, auth.uid()) then
    raise exception 'Apenas o mestre pode alterar as permissões da ficha';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_digirole_tamer_permission_lists on public.digirole_tamers;
create trigger protect_digirole_tamer_permission_lists
before update of allowed_viewers, allowed_editors on public.digirole_tamers
for each row execute function public.protect_digirole_permission_lists();

drop trigger if exists protect_digirole_digimon_permission_lists on public.digirole_digimons;
create trigger protect_digirole_digimon_permission_lists
before update of allowed_viewers, allowed_editors on public.digirole_digimons
for each row execute function public.protect_digirole_permission_lists();
