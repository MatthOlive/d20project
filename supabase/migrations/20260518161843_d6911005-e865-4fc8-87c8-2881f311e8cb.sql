
CREATE TABLE IF NOT EXISTS public.natures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  keywords text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  confidence integer NOT NULL DEFAULT 2,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE public.natures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "natures readable" ON public.natures
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.natures (name, keywords, description, confidence, sort_order) VALUES
('Hardy',     'Confident, Headstrong, Stubborn',           'Steadfast and self-assured; rarely backs down from a challenge.', 4, 1),
('Lonely',    'Independent, Withdrawn, Self-reliant',      'Prefers solitude and dislikes depending on others.', 2, 2),
('Adamant',   'Determined, Inflexible, Driven',            'Single-minded and unwilling to change course once set.', 3, 3),
('Naughty',   'Mischievous, Rude, Provocative',            'Acts out and teases, often getting into trouble.', 3, 4),
('Brave',     'Fearless, Reckless, Bold',                  'Charges into danger without hesitation.', 4, 5),
('Bold',      'Assertive, Daring, Forward',                'Speaks up and acts without fear of judgment.', 4, 6),
('Docile',    'Gentle, Compliant, Easygoing',              'Cooperative and willing to follow along.', 2, 7),
('Relaxed',   'Calm, Laid-back, Patient',                  'Takes life slowly and rarely gets ruffled.', 2, 8),
('Impish',    'Playful, Teasing, Mischievous',             'Loves pranks and lighthearted trouble.', 3, 9),
('Lax',       'Carefree, Unconcerned, Lazy',               'Avoids effort and worries about little.', 2, 10),
('Timid',     'Shy, Anxious, Cautious',                    'Avoids attention and conflict.', 1, 11),
('Hasty',     'Quick, Impatient, Impulsive',               'Acts before thinking, always in a hurry.', 3, 12),
('Serious',   'Focused, Stern, Composed',                  'Treats every task with weight and discipline.', 3, 13),
('Jolly',     'Cheerful, Energetic, Friendly',             'Spreads good mood and enjoys company.', 3, 14),
('Naive',     'Innocent, Trusting, Curious',               'Sees the world with wide eyes and an open heart.', 2, 15),
('Modest',    'Humble, Reserved, Unassuming',              'Downplays achievements and avoids the spotlight.', 2, 16),
('Mild',      'Soft-spoken, Kind, Patient',                'Gentle in word and deed.', 2, 17),
('Quiet',     'Reserved, Thoughtful, Observant',           'Speaks little and listens much.', 2, 18),
('Bashful',   'Embarrassed, Hesitant, Insecure',           'Easily flustered, struggles to speak up.', 1, 19),
('Rash',      'Hot-headed, Quick-tempered, Impulsive',     'Snaps quickly and acts on feeling.', 3, 20),
('Calm',      'Composed, Peaceful, Centered',              'Steady under pressure and slow to anger.', 3, 21);
