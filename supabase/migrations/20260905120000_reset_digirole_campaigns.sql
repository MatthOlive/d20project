-- DigiRole is being rebuilt from the Pokérole interaction model. Existing
-- DigiRole campaigns use the discarded prototype shape and were explicitly
-- approved for removal. Other systems and the DigiRole catalog are preserved.
delete from public.games
where system = 'digirole';
