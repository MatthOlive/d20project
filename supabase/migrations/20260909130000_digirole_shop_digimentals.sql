insert into public.digirole_items(name, item_type, description, price)
values
  ('Digimental da Coragem','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas à Coragem.',0),
  ('Digimental da Amizade','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas à Amizade.',0),
  ('Digimental do Amor','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas ao Amor.',0),
  ('Digimental da Pureza','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas à Pureza.',0),
  ('Digimental do Conhecimento','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas ao Conhecimento.',0),
  ('Digimental da Sinceridade','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas à Sinceridade.',0),
  ('Digimental da Esperança','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas à Esperança.',0),
  ('Digimental da Luz','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas à Luz.',0),
  ('Digimental da Bondade','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas à Bondade.',0),
  ('Digimental dos Milagres','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas aos Milagres.',0),
  ('Digimental do Destino','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas ao Destino.',0)
on conflict (name) do update
set item_type = excluded.item_type,
    description = excluded.description,
    price = excluded.price;
