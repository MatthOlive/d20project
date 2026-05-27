
INSERT INTO public.natures (name, description, confidence) VALUES
  ('Sassy',   'Lively, Irreverent, Mouthy', 7),
  ('Careful', 'Analytic, Skeptical, Withdrawn', 5),
  ('Quirky',  'Unusual, Open-Minded, Original', 9),
  ('Gentle',  'Graceful, Charismatic, Extroverts', 10)
ON CONFLICT (name) DO NOTHING;

UPDATE public.natures SET confidence = CASE name
  WHEN 'Adamant' THEN 4
  WHEN 'Bashful' THEN 6
  WHEN 'Bold'    THEN 9
  WHEN 'Brave'   THEN 9
  WHEN 'Calm'    THEN 8
  WHEN 'Hardy'   THEN 9
  WHEN 'Careful' THEN 5
  WHEN 'Hasty'   THEN 7
  WHEN 'Docile'  THEN 7
  WHEN 'Impish'  THEN 7
  WHEN 'Gentle'  THEN 10
  WHEN 'Jolly'   THEN 10
  WHEN 'Lax'     THEN 8
  WHEN 'Naughty' THEN 6
  WHEN 'Lonely'  THEN 5
  WHEN 'Quiet'   THEN 5
  WHEN 'Mild'    THEN 8
  WHEN 'Quirky'  THEN 9
  WHEN 'Modest'  THEN 10
  WHEN 'Rash'    THEN 6
  WHEN 'Naive'   THEN 7
  WHEN 'Relaxed' THEN 8
  WHEN 'Sassy'   THEN 7
  WHEN 'Serious' THEN 4
  WHEN 'Timid'   THEN 4
  ELSE confidence
END
WHERE name IN ('Adamant','Bashful','Bold','Brave','Calm','Hardy','Careful','Hasty','Docile','Impish','Gentle','Jolly','Lax','Naughty','Lonely','Quiet','Mild','Quirky','Modest','Rash','Naive','Relaxed','Sassy','Serious','Timid');
