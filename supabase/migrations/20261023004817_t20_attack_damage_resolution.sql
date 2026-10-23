-- Narrator-confirmed, one-time damage application for a resolved T20 attack.
CREATE TABLE IF NOT EXISTS public.t20_attack_resolutions (
  source_message_id uuid PRIMARY KEY REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  target_character_id uuid NOT NULL REFERENCES public.t20_characters(id) ON DELETE CASCADE,
  damage integer NOT NULL CHECK (damage >= 0),
  hp_before integer NOT NULL CHECK (hp_before >= 0),
  hp_after integer NOT NULL CHECK (hp_after >= 0),
  applied_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  applied_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.t20_attack_resolutions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.t20_attack_resolutions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.t20_attack_resolutions TO authenticated;

DROP POLICY IF EXISTS "members view T20 attack resolutions" ON public.t20_attack_resolutions;
CREATE POLICY "members view T20 attack resolutions"
  ON public.t20_attack_resolutions
  FOR SELECT TO authenticated
  USING (
    public.is_game_member(game_id, (select auth.uid()))
    OR public.is_game_narrator(game_id, (select auth.uid()))
  );

DROP POLICY IF EXISTS "narrator records T20 attack resolutions" ON public.t20_attack_resolutions;
CREATE POLICY "narrator records T20 attack resolutions"
  ON public.t20_attack_resolutions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_game_narrator(game_id, (select auth.uid())) AND applied_by = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.roll_t20_attack(
  p_game_id uuid,
  p_attacker_character_id uuid,
  p_target_character_id uuid,
  p_modifier integer,
  p_damage_expression text,
  p_label text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_attacker_owner_id uuid;
  v_narrator_id uuid;
  v_target public.t20_characters%ROWTYPE;
  v_die integer;
  v_total integer;
  v_message_id uuid;
  v_label text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_modifier IS NULL OR p_modifier < -100 OR p_modifier > 1000 THEN
    RAISE EXCEPTION 'Attack modifier is outside the supported range';
  END IF;
  IF p_damage_expression IS NULL OR p_damage_expression !~* '^([1-9]|1[0-9]|20)d(4|6|8|10|12|20)([+-][0-9]{1,4})?$' THEN
    RAISE EXCEPTION 'Invalid T20 damage expression';
  END IF;
  IF p_attacker_character_id = p_target_character_id THEN
    RAISE EXCEPTION 'A character cannot target itself with this weapon action';
  END IF;

  SELECT c.owner_id, g.narrator_id
    INTO v_attacker_owner_id, v_narrator_id
    FROM public.t20_characters AS c
    JOIN public.games AS g ON g.id = c.game_id
   WHERE c.id = p_attacker_character_id
     AND c.game_id = p_game_id;
  IF NOT FOUND OR (v_user_id <> v_attacker_owner_id AND v_user_id <> v_narrator_id) THEN
    RAISE EXCEPTION 'You cannot roll attacks for this character' USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_target
    FROM public.t20_characters
   WHERE id = p_target_character_id
     AND game_id = p_game_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target character is not available in this game';
  END IF;

  v_die := floor(random() * 20)::integer + 1;
  v_total := v_die + p_modifier;
  v_label := left(coalesce(nullif(trim(p_label), ''), 'Ataque T20'), 180);

  INSERT INTO public.chat_messages (game_id, user_id, kind, body, roll_data)
  VALUES (
    p_game_id,
    v_user_id,
    'roll',
    v_label,
    jsonb_build_object(
      'system', 't20',
      'die', v_die,
      'modifier', p_modifier,
      'total', v_total,
      'label', v_label,
      'attackTarget', jsonb_build_object(
        'id', v_target.id,
        'name', v_target.name,
        'defense', v_target.defense,
        'damageExpression', p_damage_expression,
        'hit', v_total >= v_target.defense
      )
    )
  )
  RETURNING id INTO v_message_id;

  RETURN v_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.roll_t20_attack(uuid, uuid, uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roll_t20_attack(uuid, uuid, uuid, integer, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_t20_attack_damage(
  p_source_message_id uuid,
  p_damage integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_game_id uuid;
  v_narrator_id uuid;
  v_roll jsonb;
  v_attack jsonb;
  v_target_id uuid;
  v_die integer;
  v_modifier integer;
  v_total integer;
  v_defense integer;
  v_character public.t20_characters%ROWTYPE;
  v_hp_before integer;
  v_hp_after integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_damage IS NULL OR p_damage < 0 OR p_damage > 10000 THEN
    RAISE EXCEPTION 'Damage must be between 0 and 10000';
  END IF;

  SELECT cm.game_id, g.narrator_id, cm.roll_data
    INTO v_game_id, v_narrator_id, v_roll
    FROM public.chat_messages AS cm
    JOIN public.games AS g ON g.id = cm.game_id
   WHERE cm.id = p_source_message_id
     AND cm.kind = 'roll'
     AND cm.roll_data->>'system' = 't20';

  IF NOT FOUND OR v_narrator_id <> v_user_id THEN
    RAISE EXCEPTION 'Only the game narrator can apply damage from a T20 attack' USING ERRCODE = '42501';
  END IF;

  v_attack := v_roll->'attackTarget';
  IF v_attack IS NULL OR v_attack->>'hit' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'This attack did not hit a target';
  END IF;

  v_target_id := (v_attack->>'id')::uuid;
  v_die := (v_roll->>'die')::integer;
  v_modifier := (v_roll->>'modifier')::integer;
  v_total := (v_roll->>'total')::integer;
  v_defense := (v_attack->>'defense')::integer;
  IF v_die IS NULL OR v_modifier IS NULL OR v_total IS NULL OR v_defense IS NULL
     OR v_die < 1 OR v_die > 20 OR v_total <> v_die + v_modifier OR v_total < v_defense THEN
    RAISE EXCEPTION 'Attack result is inconsistent with the recorded target Defense';
  END IF;

  SELECT *
    INTO v_character
    FROM public.t20_characters
   WHERE id = v_target_id
     AND game_id = v_game_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target character is no longer in this game';
  END IF;

  v_hp_before := greatest(0, coalesce(v_character.hp_current, v_character.hp_max, 0));
  v_hp_after := greatest(0, v_hp_before - p_damage);

  INSERT INTO public.t20_attack_resolutions (
    source_message_id, game_id, target_character_id, damage, hp_before, hp_after, applied_by
  ) VALUES (
    p_source_message_id, v_game_id, v_target_id, p_damage, v_hp_before, v_hp_after, v_user_id
  ) ON CONFLICT (source_message_id) DO NOTHING;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Damage for this attack has already been applied';
  END IF;

  UPDATE public.t20_characters
     SET hp_current = v_hp_after
   WHERE id = v_target_id
     AND game_id = v_game_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Could not update target HP';
  END IF;

  RETURN jsonb_build_object(
    'source_message_id', p_source_message_id,
    'target_character_id', v_target_id,
    'target_name', v_character.name,
    'damage', p_damage,
    'hp_before', v_hp_before,
    'hp_after', v_hp_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_t20_attack_damage(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_t20_attack_damage(uuid, integer) TO authenticated;
