CREATE OR REPLACE FUNCTION public.can_view_character(_game uuid, _kind text, _character uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _kind = 'pokemon' THEN EXISTS (
      SELECT 1
      FROM public.pokemon p
      LEFT JOIN public.trainers t ON t.id = p.owner_trainer_id
      WHERE p.id = _character
        AND p.game_id = _game
        AND public.is_game_member(p.game_id, auth.uid())
        AND (
          COALESCE(cardinality(p.allowed_viewers), 0) = 0
          OR p.owner_id = auth.uid()
          OR public.is_game_narrator(p.game_id, auth.uid())
          OR auth.uid() = ANY(COALESCE(p.allowed_viewers, ARRAY[]::uuid[]))
          OR auth.uid() = ANY(COALESCE(p.allowed_editors, ARRAY[]::uuid[]))
          OR (
            t.id IS NOT NULL
            AND (
              t.owner_id = auth.uid()
              OR auth.uid() = ANY(COALESCE(t.allowed_viewers, ARRAY[]::uuid[]))
              OR auth.uid() = ANY(COALESCE(t.allowed_editors, ARRAY[]::uuid[]))
            )
          )
        )
    )
    WHEN _kind = 'trainer' THEN EXISTS (
      SELECT 1 FROM public.trainers t
      WHERE t.id = _character
        AND t.game_id = _game
        AND (public.is_game_member(t.game_id, auth.uid()) OR public.is_game_narrator(t.game_id, auth.uid()))
        AND (
          COALESCE(cardinality(t.allowed_viewers), 0) = 0
          OR t.owner_id = auth.uid()
          OR public.is_game_narrator(t.game_id, auth.uid())
          OR auth.uid() = ANY(COALESCE(t.allowed_viewers, ARRAY[]::uuid[]))
          OR auth.uid() = ANY(COALESCE(t.allowed_editors, ARRAY[]::uuid[]))
        )
    )
    WHEN _kind = 't20' THEN EXISTS (
      SELECT 1 FROM public.t20_characters c
      WHERE c.id = _character
        AND c.game_id = _game
        AND public.is_game_member(c.game_id, auth.uid())
        AND (
          COALESCE(cardinality(c.allowed_viewers), 0) = 0
          OR c.owner_id = auth.uid()
          OR public.is_game_narrator(c.game_id, auth.uid())
          OR auth.uid() = ANY(COALESCE(c.allowed_viewers, ARRAY[]::uuid[]))
          OR auth.uid() = ANY(COALESCE(c.allowed_editors, ARRAY[]::uuid[]))
        )
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.create_token_from_character(
  p_game_id uuid,
  p_page_id uuid,
  p_character_kind text,
  p_character_id uuid,
  p_label text,
  p_image_url text,
  p_x double precision,
  p_y double precision
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_character_owner_id uuid;
  v_token_owner_id uuid;
  v_token_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_game_member(p_game_id, auth.uid()) THEN
    RAISE EXCEPTION 'You are not a member of this game';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.scenarios s
    WHERE s.id = p_page_id
      AND s.game_id = p_game_id
  ) THEN
    RAISE EXCEPTION 'Page does not belong to this game';
  END IF;

  IF NOT public.can_view_character(p_game_id, p_character_kind, p_character_id) THEN
    RAISE EXCEPTION 'You cannot place this character on the map';
  END IF;

  IF p_character_kind = 'pokemon' THEN
    SELECT owner_id INTO v_character_owner_id
    FROM public.pokemon
    WHERE id = p_character_id AND game_id = p_game_id;
  ELSIF p_character_kind = 'trainer' THEN
    SELECT owner_id INTO v_character_owner_id
    FROM public.trainers
    WHERE id = p_character_id AND game_id = p_game_id;
  ELSIF p_character_kind = 't20' THEN
    SELECT owner_id INTO v_character_owner_id
    FROM public.t20_characters
    WHERE id = p_character_id AND game_id = p_game_id;
  ELSE
    RAISE EXCEPTION 'Invalid character kind: %', p_character_kind;
  END IF;

  IF v_character_owner_id IS NULL THEN
    RAISE EXCEPTION 'Character not found';
  END IF;

  v_token_owner_id := CASE
    WHEN public.can_edit_character(p_game_id, v_character_owner_id) THEN v_character_owner_id
    ELSE auth.uid()
  END;

  INSERT INTO public.tokens (
    game_id,
    page_id,
    character_kind,
    character_id,
    label,
    image_url,
    owner_id,
    x,
    y
  )
  VALUES (
    p_game_id,
    p_page_id,
    p_character_kind,
    p_character_id,
    p_label,
    p_image_url,
    v_token_owner_id,
    p_x,
    p_y
  )
  RETURNING id INTO v_token_id;

  RETURN v_token_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_token_from_character(uuid, uuid, text, uuid, text, text, double precision, double precision) TO authenticated;
