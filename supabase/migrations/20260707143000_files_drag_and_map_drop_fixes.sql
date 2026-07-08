CREATE OR REPLACE FUNCTION public.set_character_folder(
  p_kind text,
  p_character_id uuid,
  p_folder text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_kind = 'pokemon' THEN
    SELECT game_id INTO v_game_id FROM public.pokemon WHERE id = p_character_id;
  ELSIF p_kind = 'trainer' THEN
    SELECT game_id INTO v_game_id FROM public.trainers WHERE id = p_character_id;
  ELSIF p_kind = 't20' THEN
    SELECT game_id INTO v_game_id FROM public.t20_characters WHERE id = p_character_id;
  ELSE
    RAISE EXCEPTION 'Invalid character kind: %', p_kind;
  END IF;

  IF v_game_id IS NULL THEN
    RAISE EXCEPTION 'Character not found';
  END IF;

  IF NOT public.can_view_character(v_game_id, p_kind, p_character_id) THEN
    RAISE EXCEPTION 'You cannot organize this character';
  END IF;

  IF p_kind = 'pokemon' THEN
    UPDATE public.pokemon SET folder = p_folder WHERE id = p_character_id;
  ELSIF p_kind = 'trainer' THEN
    UPDATE public.trainers SET folder = p_folder WHERE id = p_character_id;
  ELSE
    UPDATE public.t20_characters SET folder = p_folder WHERE id = p_character_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_character_folder(text, uuid, text) TO authenticated;

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
AS $$
DECLARE
  v_owner_id uuid;
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
    SELECT owner_id INTO v_owner_id FROM public.pokemon WHERE id = p_character_id AND game_id = p_game_id;
  ELSIF p_character_kind = 'trainer' THEN
    SELECT owner_id INTO v_owner_id FROM public.trainers WHERE id = p_character_id AND game_id = p_game_id;
  ELSIF p_character_kind = 't20' THEN
    SELECT owner_id INTO v_owner_id FROM public.t20_characters WHERE id = p_character_id AND game_id = p_game_id;
  ELSE
    RAISE EXCEPTION 'Invalid character kind: %', p_character_kind;
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Character not found';
  END IF;

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
    v_owner_id,
    p_x,
    p_y
  )
  RETURNING id INTO v_token_id;

  RETURN v_token_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_token_from_character(uuid, uuid, text, uuid, text, text, double precision, double precision) TO authenticated;

DROP POLICY IF EXISTS "owner or narrator inserts tokens" ON public.tokens;
CREATE POLICY "owner or narrator inserts tokens" ON public.tokens
FOR INSERT TO authenticated
WITH CHECK (
  public.is_game_member(game_id, auth.uid())
  AND public.can_view_character(game_id, character_kind, character_id)
  AND EXISTS (
    SELECT 1
    FROM public.scenarios s
    WHERE s.id = page_id
      AND s.game_id = tokens.game_id
  )
);
