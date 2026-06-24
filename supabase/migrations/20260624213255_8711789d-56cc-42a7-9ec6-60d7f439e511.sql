
-- Allow allowed_editors to manage moves on pokemon/trainers
DROP POLICY IF EXISTS "edit pokemon_moves" ON public.pokemon_moves;
CREATE POLICY "edit pokemon_moves" ON public.pokemon_moves
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.pokemon p
  WHERE p.id = pokemon_moves.pokemon_id
    AND (public.can_edit_character(p.game_id, p.owner_id) OR auth.uid() = ANY(p.allowed_editors))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.pokemon p
  WHERE p.id = pokemon_moves.pokemon_id
    AND (public.can_edit_character(p.game_id, p.owner_id) OR auth.uid() = ANY(p.allowed_editors))
));

DROP POLICY IF EXISTS "edit trainer_moves" ON public.trainer_moves;
CREATE POLICY "edit trainer_moves" ON public.trainer_moves
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.trainers t
  WHERE t.id = trainer_moves.trainer_id
    AND (public.can_edit_character(t.game_id, t.owner_id) OR auth.uid() = ANY(t.allowed_editors))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.trainers t
  WHERE t.id = trainer_moves.trainer_id
    AND (public.can_edit_character(t.game_id, t.owner_id) OR auth.uid() = ANY(t.allowed_editors))
));

-- Add WITH CHECK on pokemon/trainers UPDATE so editors can actually save
DROP POLICY IF EXISTS "owner or narrator edits pokemon" ON public.pokemon;
CREATE POLICY "owner or narrator edits pokemon" ON public.pokemon
FOR UPDATE TO authenticated
USING (public.can_edit_character(game_id, owner_id) OR auth.uid() = ANY(allowed_editors))
WITH CHECK (public.can_edit_character(game_id, owner_id) OR auth.uid() = ANY(allowed_editors));

DROP POLICY IF EXISTS "owner or narrator edits trainer" ON public.trainers;
CREATE POLICY "owner or narrator edits trainer" ON public.trainers
FOR UPDATE TO authenticated
USING (public.can_edit_character(game_id, owner_id) OR auth.uid() = ANY(allowed_editors))
WITH CHECK (public.can_edit_character(game_id, owner_id) OR auth.uid() = ANY(allowed_editors));
