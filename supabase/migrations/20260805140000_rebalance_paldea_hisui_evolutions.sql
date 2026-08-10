-- Rebalance imported Paldea/Hisui evolutions that did not gain enough base
-- attributes over their previous form. Existing player sheets are untouched;
-- the corrected templates apply to new Pokemon and future evolutions.
with balance(name, base_hp, base_attrs, suggested_rank) as (
  values
    ('Annihilape', null, '{"strength":4,"dexterity":3,"vitality":2,"special":2,"insight":2}'::jsonb, null),
    ('Basculegion', null, '{"strength":2,"dexterity":2,"vitality":2,"special":4,"insight":2}'::jsonb, null),
    ('Baxcalibur', null, '{"strength":4,"dexterity":2,"vitality":3,"special":2,"insight":2}'::jsonb, null),
    ('Decidueye (Hisuian Form)', 5, null, 'ace'),
    ('Floragato', null, '{"strength":3,"dexterity":2,"vitality":2,"special":2,"insight":2}'::jsonb, null),
    ('Kingambit', null, '{"strength":4,"dexterity":2,"vitality":3,"special":2,"insight":2}'::jsonb, null),
    ('Kleavor', null, '{"strength":4,"dexterity":2,"vitality":3,"special":2,"insight":2}'::jsonb, null),
    ('Meowscarada', 5, '{"strength":3,"dexterity":4,"vitality":2,"special":2,"insight":2}'::jsonb, 'ace'),
    ('Quaquaval', 5, '{"strength":4,"dexterity":3,"vitality":2,"special":2,"insight":2}'::jsonb, 'ace'),
    ('Quaxwell', null, '{"strength":3,"dexterity":2,"vitality":2,"special":2,"insight":2}'::jsonb, null),
    ('Samurott (Hisuian Form)', 5, null, 'ace'),
    ('Skeledirge', null, null, 'ace'),
    ('Sneasler', null, '{"strength":4,"dexterity":3,"vitality":2,"special":1,"insight":2}'::jsonb, null),
    ('Typhlosion (Hisuian Form)', 5, null, 'ace')
)
update public.species as species
set
  base_hp = coalesce(balance.base_hp, species.base_hp),
  base_attrs = coalesce(balance.base_attrs, species.base_attrs),
  attr_limits = case
    when balance.base_attrs is null then species.attr_limits
    else species.attr_limits || jsonb_strip_nulls(jsonb_build_object(
      'strength', greatest((species.attr_limits->>'strength')::integer, (balance.base_attrs->>'strength')::integer),
      'dexterity', greatest((species.attr_limits->>'dexterity')::integer, (balance.base_attrs->>'dexterity')::integer),
      'vitality', greatest((species.attr_limits->>'vitality')::integer, (balance.base_attrs->>'vitality')::integer),
      'special', greatest((species.attr_limits->>'special')::integer, (balance.base_attrs->>'special')::integer),
      'insight', greatest((species.attr_limits->>'insight')::integer, (balance.base_attrs->>'insight')::integer)
    ))
  end,
  suggested_rank = coalesce(balance.suggested_rank::public.pokerole_rank, species.suggested_rank)
from balance
where species.name = balance.name;
