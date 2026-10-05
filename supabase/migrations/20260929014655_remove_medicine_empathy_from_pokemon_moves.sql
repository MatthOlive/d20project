-- Pokémon no longer use the Medicine or Empathy skills.
-- Map existing move accuracy formulas onto skills that remain available to Pokémon.
update public.moves
set accuracy_skill = case
  when lower(name) = 'simple beam' then 'channel'
  when lower(name) = 'stabilize an ally' then 'nature'
  else replace(
    replace(lower(accuracy_skill), 'empathy', 'channel'),
    'medicine',
    'nature'
  )
end
where lower(accuracy_skill) like '%empathy%'
   or lower(accuracy_skill) like '%medicine%';
