revoke all on function public.can_read_game_asset(text) from public, anon;
grant execute on function public.can_read_game_asset(text) to authenticated;
