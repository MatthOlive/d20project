-- Rank no longer gates form unlocks or transformations.
begin;
drop trigger if exists digirole_forms_require_rank on public.digirole_forms;
drop trigger if exists digirole_digimons_require_rank_for_form on public.digirole_digimons;
commit;
