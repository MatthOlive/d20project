-- Only the game narrator may clear a table's shared chat history.
drop policy if exists "narrator clears chat" on public.chat_messages;
create policy "narrator clears chat"
on public.chat_messages
for delete
to authenticated
using (public.is_game_narrator(game_id, (select auth.uid())));
