-- Affinity fields control which generic techniques can be learned. The sheet
-- color and combat field use only the signature technique fields (one or two).
with resolved as (
  select
    species.id,
    coalesce(
      (
        select array_agg(signature_field.field order by signature_field.priority, signature_field.field)
        from (
          select
            technique.field,
            min(
              case
                when lower(btrim(technique.name)) = lower(btrim(species.signature_technique))
                  then 0
                else 1
              end
            ) as priority
          from public.digirole_species_techniques link
          join public.digirole_techniques technique on technique.id = link.technique_id
          where link.species_id = species.id
            and link.is_signature
            and nullif(btrim(technique.field), '') is not null
          group by technique.field
          order by priority, technique.field
          limit 2
        ) signature_field
      ),
      case
        when cardinality(species.available_fields) > 0 then species.available_fields[1:1]
        else array['Neutra']::text[]
      end
    ) as primary_fields
  from public.digirole_species species
)
update public.digirole_species species
set fields = resolved.primary_fields,
    updated_at = now()
from resolved
where resolved.id = species.id
  and species.fields is distinct from resolved.primary_fields;

alter table public.digirole_species
  drop constraint if exists digirole_species_primary_fields_count_check;
alter table public.digirole_species
  add constraint digirole_species_primary_fields_count_check
  check (cardinality(fields) between 1 and 2);
