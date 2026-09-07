-- Keep Hybrid forms playable even when the source catalog has no dedicated
-- signature entry for the form. The chosen techniques are the catalog's
-- established Field signatures and already exist in digirole_techniques.
update public.digirole_species
set signature_technique = case fields[1]
  when 'DR' then 'Dragon Burst'
  when 'NSp' then 'Savage Fang'
  when 'WG' then 'Gale Strike'
  when 'JT' then 'Nature Bind'
  when 'DS' then 'Aqua Burst'
  when 'NSo' then 'Dark Pulse'
  when 'ME' then 'Metal Cannon'
  else signature_technique
end
where stage = 'Hybrid'
  and signature_technique is null;
