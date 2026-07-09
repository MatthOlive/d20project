CREATE OR REPLACE FUNCTION public.assign_pokemon_to_trainer(
  p_pokemon_id uuid,
  p_trainer_id uuid,
  p_team_slot integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_game_id uuid;
  v_existing_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_team_slot IS NOT NULL AND (p_team_slot < 1 OR p_team_slot > 6) THEN
    RAISE EXCEPTION 'Team slot must be between 1 and 6';
  END IF;

  SELECT t.game_id INTO v_game_id
  FROM public.trainers t
  WHERE t.id = p_trainer_id;

  IF v_game_id IS NULL THEN
    RAISE EXCEPTION 'Trainer not found';
  END IF;

  IF NOT public.is_game_member(v_game_id, auth.uid()) THEN
    RAISE EXCEPTION 'You are not a member of this game';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pokemon p
    WHERE p.id = p_pokemon_id
      AND p.game_id = v_game_id
  ) THEN
    RAISE EXCEPTION 'Pokemon not found in this game';
  END IF;

  IF NOT public.can_view_character(v_game_id, 'pokemon', p_pokemon_id) THEN
    RAISE EXCEPTION 'You cannot move this Pokemon';
  END IF;

  IF NOT public.can_view_character(v_game_id, 'trainer', p_trainer_id) THEN
    RAISE EXCEPTION 'You cannot use this trainer PC';
  END IF;

  IF p_team_slot IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.pokemon
    WHERE owner_trainer_id = p_trainer_id
      AND team_slot = p_team_slot
      AND id <> p_pokemon_id
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'Team slot is already occupied';
    END IF;
  END IF;

  UPDATE public.pokemon
  SET owner_trainer_id = p_trainer_id,
      team_slot = p_team_slot
  WHERE id = p_pokemon_id
    AND game_id = v_game_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_pokemon_to_trainer(uuid, uuid, integer) TO authenticated;
