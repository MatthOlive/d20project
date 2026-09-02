import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CirclePause,
  CirclePlay,
  Dices,
  FastForward,
  Flag,
  History,
  RefreshCw,
  Swords,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  createEngineState,
  currentEngineParticipant,
  mayControlEngineParticipant,
} from "@/lib/game-engine/core";
import { getEngineRulePack } from "@/lib/game-engine/rules";
import type {
  EngineEvent,
  EngineParticipant,
  EngineParticipantKind,
} from "@/lib/game-engine/types";
import { useGameEngine } from "@/hooks/use-game-engine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

type MapToken = {
  id: string;
  character_kind: EngineParticipantKind;
  character_id: string;
  owner_id: string;
  label: string;
  image_url: string | null;
  page_id: string;
};

type CharacterData = {
  id: string;
  name: string;
  imageUrl: string | null;
  ownerId: string;
  controllerIds: string[];
  initiativePool: number;
  initiativeModifier: number;
  currentHp: number | null;
  maxHp: number | null;
};

const EMPTY_MAP_TOKENS: MapToken[] = [];
const EMPTY_CHARACTER_DATA = new Map<string, CharacterData>();

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberAt(value: unknown, key: string, fallback = 0): number {
  const candidate = asRecord(value)[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : fallback;
}

function relationObject(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function formatError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : asRecord(error).message
        ? String(asRecord(error).message)
        : String(error);
  if (
    /game_engine_sessions|start_game_engine_session|schema cache|relation .* does not exist/i.test(
      message,
    )
  ) {
    return "O banco do motor ainda não foi preparado. Rode a migration 20260821130000_game_engine_foundation.sql para liberar o teste.";
  }
  if (/state changed|40001/i.test(message)) {
    return "Outro jogador atualizou o encontro ao mesmo tempo. O estado foi recarregado; tente novamente.";
  }
  return message;
}

function eventLabel(event: EngineEvent): string {
  const payload = event.payload ?? {};
  if (event.command === "start_session")
    return `Encontro criado com ${payload.participantCount ?? 0} participante(s)`;
  if (event.command === "set_initiative") return `Iniciativa definida: ${payload.value ?? "-"}`;
  if (event.command === "start_turns") return "Ordem de turnos iniciada";
  if (event.command === "record_action") {
    const actor = payload.participantName ? `${payload.participantName} · ` : "";
    const type = payload.actionType === "move"
      ? "Move"
      : payload.actionType === "reaction"
        ? "Reação"
        : "Ação";
    return `${actor}${type}${payload.label ? ` · ${payload.label}` : ""}`;
  }
  if (event.command === "advance_turn") return "Turno avançado";
  if (event.command === "pause") return "Motor pausado";
  if (event.command === "resume") return "Motor retomado";
  if (event.command === "finish") return "Encontro encerrado";
  return event.command;
}

export function GameEnginePanel({
  gameId,
  userId,
  isNarrator,
  systemId,
  activePageId,
}: {
  gameId: string;
  userId: string;
  isNarrator: boolean;
  systemId: string;
  activePageId: string | null;
}) {
  const queryClient = useQueryClient();
  const rules = getEngineRulePack(systemId);
  const [selectedTokenIds, setSelectedTokenIds] = useState<Set<string>>(new Set());
  const [actionType, setActionType] = useState(rules.actionTypes[0]?.id ?? "other");
  const [actionLabel, setActionLabel] = useState("");
  const selectionPageRef = useRef<string | null>(null);
  const engine = useGameEngine({ gameId, actor: { userId, isNarrator } });

  function actionEntries(participant: EngineParticipant) {
    if (!Array.isArray(participant.metadata.actions)) return [];
    return participant.metadata.actions.filter(
      (entry): entry is { type: string; label: string | null; recordedAt?: string } =>
        !!entry && typeof entry === "object" && "type" in entry,
    );
  }

  const { data: currentPageId = activePageId } = useQuery<string | null>({
    queryKey: ["current-map-page", gameId, userId],
    queryFn: async () => activePageId,
    initialData: activePageId,
    enabled: false,
  });

  const { data: tokens = EMPTY_MAP_TOKENS, isLoading: tokensLoading } = useQuery({
    queryKey: ["game-engine-tokens", gameId, currentPageId],
    queryFn: async () => {
      if (!currentPageId) return [] as MapToken[];
      const { data, error } = await supabase
        .from("tokens")
        .select("id,character_kind,character_id,owner_id,label,image_url,page_id")
        .eq("game_id", gameId)
        .eq("page_id", currentPageId)
        .eq("layer", "tokens");
      if (error) throw error;
      return (data ?? []) as MapToken[];
    },
    enabled: !!currentPageId,
  });

  useEffect(() => {
    if (!currentPageId) return;
    const channel = supabase
      .channel(`game-engine-tokens:${gameId}:${currentPageId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tokens", filter: `page_id=eq.${currentPageId}` },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["game-engine-tokens", gameId, currentPageId],
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentPageId, gameId, queryClient]);

  const characterRefs = useMemo(() => {
    const refs = new Map<
      string,
      { kind: EngineParticipantKind; characterId: string }
    >();
    for (const token of tokens) {
      refs.set(`${token.character_kind}:${token.character_id}`, {
        kind: token.character_kind,
        characterId: token.character_id,
      });
    }
    for (const participant of engine.session?.state.participants ?? []) {
      if (!participant.characterId) continue;
      refs.set(`${participant.kind}:${participant.characterId}`, {
        kind: participant.kind,
        characterId: participant.characterId,
      });
    }
    return [...refs.values()];
  }, [engine.session?.state.participants, tokens]);

  const { data: characters = EMPTY_CHARACTER_DATA } = useQuery({
    queryKey: [
      "game-engine-character-data",
      gameId,
      characterRefs
        .map((ref) => `${ref.kind}:${ref.characterId}`)
        .sort()
        .join("|"),
    ],
    queryFn: async () => {
      const pokemonIds = [
        ...new Set(
          characterRefs
            .filter((ref) => ref.kind === "pokemon")
            .map((ref) => ref.characterId),
        ),
      ];
      const trainerIds = [
        ...new Set(
          characterRefs
            .filter((ref) => ref.kind === "trainer")
            .map((ref) => ref.characterId),
        ),
      ];
      const t20Ids = [
        ...new Set(
          characterRefs
            .filter((ref) => ref.kind === "t20")
            .map((ref) => ref.characterId),
        ),
      ];
      const digiTamerIds = [
        ...new Set(characterRefs.filter((ref) => ref.kind === "digirole_tamer").map((ref) => ref.characterId)),
      ];
      const digimonIds = [
        ...new Set(characterRefs.filter((ref) => ref.kind === "digirole_digimon").map((ref) => ref.characterId)),
      ];
      const [pokemonResult, trainerResult, t20Result, digiTamerResult, digimonResult] = await Promise.all([
        pokemonIds.length
          ? supabase
              .from("pokemon")
              .select(
                "id,nickname,image_url,owner_id,allowed_editors,current_attrs,skills,current_hp,hp,species:species_id(name,sprite_url)",
              )
              .in("id", pokemonIds)
          : Promise.resolve({ data: [], error: null }),
        trainerIds.length
          ? supabase
              .from("trainers")
              .select("id,name,image_url,owner_id,allowed_editors,attrs,skills,current_hp")
              .in("id", trainerIds)
          : Promise.resolve({ data: [], error: null }),
        t20Ids.length
          ? (
              supabase.from("t20_characters" as never) as never as {
                select: (columns: string) => {
                  in: (
                    column: string,
                    values: string[],
                  ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
                };
              }
            )
              .select("id,name,image_url,owner_id,allowed_editors,skills,hp_current,hp_max")
              .in("id", t20Ids)
          : Promise.resolve({ data: [], error: null }),
        digiTamerIds.length
          ? (
              supabase.from("digirole_tamers" as never) as never as {
                select: (columns: string) => { in: (column: string, values: string[]) => Promise<{ data: unknown[] | null; error: { message: string } | null }> };
              }
            ).select("id,name,image_url,owner_id,allowed_editors,attrs,skills,hp_current,ds_current,condensed_count").in("id", digiTamerIds)
          : Promise.resolve({ data: [], error: null }),
        digimonIds.length
          ? (
              supabase.from("digirole_digimons" as never) as never as {
                select: (columns: string) => { in: (column: string, values: string[]) => Promise<{ data: unknown[] | null; error: { message: string } | null }> };
              }
            ).select("id,nickname,image_url,owner_id,allowed_editors,attrs,skills,hp_current,ds_current,species:species_id(name,image_url,hp_base)").in("id", digimonIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const firstError = pokemonResult.error || trainerResult.error || t20Result.error || digiTamerResult.error || digimonResult.error;
      if (firstError) throw firstError;

      const result = new Map<string, CharacterData>();
      for (const raw of pokemonResult.data ?? []) {
        const row = asRecord(raw);
        const species = relationObject(row.species);
        const attrs = asRecord(row.current_attrs);
        const skills = asRecord(row.skills);
        result.set(`pokemon:${row.id}`, {
          id: String(row.id),
          name: String(row.nickname || species.name || "Pokémon"),
          imageUrl: row.image_url
            ? String(row.image_url)
            : species.sprite_url
              ? String(species.sprite_url)
              : null,
          ownerId: String(row.owner_id),
          controllerIds: [
            String(row.owner_id),
            ...(Array.isArray(row.allowed_editors)
              ? row.allowed_editors.filter((entry): entry is string => typeof entry === "string")
              : []),
          ],
          initiativePool: numberAt(attrs, "dexterity", 1) + numberAt(skills, "Alert", 0),
          initiativeModifier: 0,
          currentHp: typeof row.current_hp === "number" ? row.current_hp : null,
          maxHp: typeof row.hp === "number" ? row.hp : null,
        });
      }
      for (const raw of trainerResult.data ?? []) {
        const row = asRecord(raw);
        result.set(`trainer:${row.id}`, {
          id: String(row.id),
          name: String(row.name || "Treinador"),
          imageUrl: row.image_url ? String(row.image_url) : null,
          ownerId: String(row.owner_id),
          controllerIds: [
            String(row.owner_id),
            ...(Array.isArray(row.allowed_editors)
              ? row.allowed_editors.filter((entry): entry is string => typeof entry === "string")
              : []),
          ],
          initiativePool: numberAt(row.attrs, "dexterity", 1) + numberAt(row.skills, "Alert", 0),
          initiativeModifier: 0,
          currentHp: typeof row.current_hp === "number" ? row.current_hp : null,
          maxHp: null,
        });
      }
      for (const raw of t20Result.data ?? []) {
        const row = asRecord(raw);
        result.set(`t20:${row.id}`, {
          id: String(row.id),
          name: String(row.name || "Personagem"),
          imageUrl: row.image_url ? String(row.image_url) : null,
          ownerId: String(row.owner_id),
          controllerIds: [
            String(row.owner_id),
            ...(Array.isArray(row.allowed_editors)
              ? row.allowed_editors.filter((entry): entry is string => typeof entry === "string")
              : []),
          ],
          initiativePool: 0,
          initiativeModifier: numberAt(row.skills, "Iniciativa", 0),
          currentHp: typeof row.hp_current === "number" ? row.hp_current : null,
          maxHp: typeof row.hp_max === "number" ? row.hp_max : null,
        });
      }
      for (const raw of digiTamerResult.data ?? []) {
        const row = asRecord(raw);
        const attrs = asRecord(row.attrs);
        const skills = asRecord(row.skills);
        result.set(`digirole_tamer:${row.id}`, {
          id: String(row.id),
          name: String(row.name || "Tamer"),
          imageUrl: row.image_url ? String(row.image_url) : null,
          ownerId: String(row.owner_id),
          controllerIds: [
            String(row.owner_id),
            ...(Array.isArray(row.allowed_editors) ? row.allowed_editors.filter((entry): entry is string => typeof entry === "string") : []),
          ],
          initiativePool: numberAt(attrs, "dexterity", 1) + numberAt(skills, "Alert", 0),
          initiativeModifier: 0,
          currentHp: typeof row.hp_current === "number" ? row.hp_current : null,
          maxHp: 3 + numberAt(attrs, "vitality", 1),
        });
      }
      for (const raw of digimonResult.data ?? []) {
        const row = asRecord(raw);
        const species = relationObject(row.species);
        const attrs = asRecord(row.attrs);
        const skills = asRecord(row.skills);
        result.set(`digirole_digimon:${row.id}`, {
          id: String(row.id),
          name: String(row.nickname || species.name || "Digimon"),
          imageUrl: row.image_url ? String(row.image_url) : species.image_url ? String(species.image_url) : null,
          ownerId: String(row.owner_id),
          controllerIds: [
            String(row.owner_id),
            ...(Array.isArray(row.allowed_editors) ? row.allowed_editors.filter((entry): entry is string => typeof entry === "string") : []),
          ],
          initiativePool: numberAt(attrs, "dexterity", 1) + numberAt(skills, "Alert", 0),
          initiativeModifier: 0,
          currentHp: typeof row.hp_current === "number" ? row.hp_current : null,
          maxHp: numberAt(species, "hp_base", 3) + numberAt(attrs, "vitality", 1),
        });
      }
      return result;
    },
    enabled: characterRefs.length > 0,
  });

  const candidates = useMemo<EngineParticipant[]>(
    () =>
      tokens.map((token) => {
        const character = characters.get(`${token.character_kind}:${token.character_id}`);
        return {
          id: token.id,
          tokenId: token.id,
          characterId: token.character_id,
          kind: token.character_kind,
          ownerId:
            (isNarrator
              ? character?.controllerIds.find((controllerId) => controllerId !== userId)
              : null) ??
            character?.ownerId ??
            token.owner_id,
          name: character?.name || token.label || "Participante",
          imageUrl: token.image_url || character?.imageUrl || null,
          initiative: null,
          initiativePool: character?.initiativePool ?? 1,
          initiativeModifier: character?.initiativeModifier ?? 0,
          actionsUsed: 0,
          resources: {
            ...(character?.currentHp != null ? { hp: character.currentHp } : {}),
            ...(character?.maxHp != null ? { hpMax: character.maxHp } : {}),
          },
          metadata: {
            controllerIds: [
              ...new Set([...(character?.controllerIds ?? []), token.owner_id]),
            ],
          },
        };
      }),
    [characters, isNarrator, tokens, userId],
  );

  useEffect(() => {
    if (selectionPageRef.current !== currentPageId) {
      selectionPageRef.current = currentPageId;
      setSelectedTokenIds(new Set(candidates.map((participant) => participant.id)));
    } else {
      setSelectedTokenIds((previous) => {
        const validIds = new Set(candidates.map((participant) => participant.id));
        const next = new Set([...previous].filter((id) => validIds.has(id)));
        for (const participant of candidates) {
          if (!previous.has(participant.id) && !engine.session) next.add(participant.id);
        }
        return next;
      });
    }
  }, [candidates, currentPageId, engine.session]);

  async function run(task: () => Promise<unknown>, success?: string) {
    try {
      await task();
      if (success) toast.success(success);
    } catch (error) {
      toast.error(formatError(error));
    }
  }

  async function startEncounter() {
    const participants = candidates.filter((participant) => selectedTokenIds.has(participant.id));
    if (participants.length === 0) {
      toast.error("Selecione pelo menos um token da página.");
      return;
    }
    const state = createEngineState({ systemId, pageId: currentPageId, participants });
    await run(async () => {
      await engine.start(state);
      const rolled = await rollNarratorInitiatives(state.participants);
      toast.success(
        rolled > 0
          ? `Encontro criado. ${rolled} iniciativa(s) do narrador rolada(s).`
          : "Encontro criado. Aguardando as iniciativas dos jogadores.",
      );
    });
  }

  async function rollInitiative(participant: EngineParticipant) {
    const result = rules.rollInitiative(participant);
    await run(
      () =>
        engine.commit({
          type: "set_initiative",
          participantId: participant.id,
          value: result.value,
          detail: result.detail,
        }),
      `${participant.name}: ${result.label}`,
    );
  }

  async function rollNarratorInitiatives(participants = engine.session?.state.participants ?? []) {
    if (!isNarrator) return 0;
    let rolled = 0;
    for (const participant of participants) {
      if (participant.initiative != null || participant.ownerId !== userId) continue;
      const result = rules.rollInitiative(participant);
      await engine.commit({
        type: "set_initiative",
        participantId: participant.id,
        value: result.value,
        detail: result.detail,
      });
      rolled += 1;
    }
    return rolled;
  }

  const session = engine.session;
  const current = session ? currentEngineParticipant(session.state) : null;
  const participantImageUrl = (participant: EngineParticipant) =>
    participant.imageUrl ||
    (participant.characterId
      ? characters.get(`${participant.kind}:${participant.characterId}`)?.imageUrl
      : null) ||
    null;
  const mayControlCurrent = mayControlEngineParticipant(current, { userId, isNarrator });
  const allInitiativesReady =
    !!session && session.state.participants.every((participant) => participant.initiative != null);

  if (engine.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-5 text-center">
        <Activity className="h-8 w-8 text-muted-foreground" />
        <div>
          <h3 className="font-bold">Motor indisponível neste banco</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {formatError(engine.error)}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void engine.refresh()}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Verificar novamente
        </Button>
      </div>
    );
  }

  if (engine.isLoading || tokensLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Preparando motor…</div>;
  }

  if (!session || session.status === "finished") {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="space-y-1 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold">Motor de encontro</h2>
              <p className="text-[11px] text-muted-foreground">{rules.label} · página atual</p>
            </div>
            <Badge variant="outline">Teste local</Badge>
          </div>
          {session?.status === "finished" && (
            <p className="pt-2 text-xs text-muted-foreground">
              O encontro anterior foi encerrado. Um novo encontro substituirá seu estado ativo.
            </p>
          )}
        </div>
        <Separator />
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {candidates.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Não há tokens na página atual.
            </p>
          ) : (
            <div className="space-y-1.5">
              {candidates.map((participant) => (
                <label
                  key={participant.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2 py-2 hover:bg-accent/50"
                >
                  <Checkbox
                    checked={selectedTokenIds.has(participant.id)}
                    onCheckedChange={(checked) =>
                      setSelectedTokenIds((previous) => {
                        const next = new Set(previous);
                        if (checked) next.add(participant.id);
                        else next.delete(participant.id);
                        return next;
                      })
                    }
                  />
                  {participant.imageUrl ? (
                    <img src={participant.imageUrl} alt="" className="h-8 w-8 object-contain" />
                  ) : (
                    <div className="h-8 w-8 rounded bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold">{participant.name}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">
                      {participant.kind}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {systemId === "pokerole" || systemId === "digirole"
                      ? `${participant.initiativePool}d6`
                      : `${participant.initiativeModifier >= 0 ? "+" : ""}${participant.initiativeModifier}`}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-border p-3">
          {isNarrator ? (
            <Button
              className="w-full"
              onClick={() => void startEncounter()}
              disabled={engine.isBusy || candidates.length === 0}
            >
              <Swords className="mr-1.5 h-4 w-4" /> Iniciar encontro
            </Button>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              O narrador inicia o encontro.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold">Motor de encontro</h2>
            <p className="text-[11px] text-muted-foreground">
              {rules.label} · versão {session.version}
            </p>
          </div>
          <Badge variant={session.status === "running" ? "default" : "secondary"}>
            {session.status === "setup"
              ? "Iniciativa"
              : session.status === "running"
                ? `Rodada ${session.state.round}`
                : "Pausado"}
          </Badge>
        </div>
        {session.page_id !== currentPageId && (
          <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-500">
            Este encontro pertence a outra página do mapa.
          </p>
        )}
      </div>
      <Separator />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {session.state.phase === "initiative" ? (
          <div className="space-y-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase text-muted-foreground">Iniciativa</h3>
                <p className="text-[11px] text-muted-foreground">{rules.initiativeLabel}</p>
              </div>
              {isNarrator && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void run(async () => {
                      const rolled = await rollNarratorInitiatives();
                      if (rolled > 0) toast.success(`${rolled} iniciativa(s) do narrador rolada(s).`);
                      else toast.info("Nenhuma iniciativa do narrador está pendente.");
                    })
                  }
                  disabled={engine.isBusy}
                >
                  <Dices className="mr-1 h-3.5 w-3.5" /> Rolar do mestre
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              {session.state.participants.map((participant) => {
                const mayRoll = mayControlEngineParticipant(participant, { userId, isNarrator: false });
                const imageUrl = participantImageUrl(participant);
                return (
                  <div
                    key={participant.id}
                    className="flex items-center gap-2 rounded-md border border-border px-2 py-2"
                  >
                    {imageUrl ? (
                      <img src={imageUrl} alt="" className="h-8 w-8 object-contain" />
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                      {participant.name}
                    </span>
                    {participant.initiative == null ? (
                      mayRoll ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7"
                          disabled={engine.isBusy}
                          onClick={() => void rollInitiative(participant)}
                        >
                          <Dices className="mr-1 h-3 w-3" /> Rolar
                        </Button>
                      ) : (
                        <span className="text-[10px] font-medium text-muted-foreground">
                          Aguardando jogador
                        </span>
                      )
                    ) : (
                      <button
                        className="min-w-9 rounded-md bg-primary/15 px-2 py-1 text-sm font-black text-primary disabled:cursor-default"
                        disabled={!mayRoll || engine.isBusy}
                        onClick={() => void rollInitiative(participant)}
                        title={mayRoll ? "Rolar novamente" : undefined}
                      >
                        {participant.initiative}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {isNarrator && (
              <Button
                className="w-full"
                disabled={!allInitiativesReady || engine.isBusy}
                onClick={() =>
                  void run(
                    () => engine.commit({ type: "start_turns" }),
                    "Ordem de turnos iniciada.",
                  )
                }
              >
                <CirclePlay className="mr-1.5 h-4 w-4" /> Começar turnos
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3 p-3">
            {current && (
              <section className="space-y-3">
                <div className="flex items-center gap-3">
                  {participantImageUrl(current) ? (
                    <img src={participantImageUrl(current)!} alt="" className="h-12 w-12 object-contain" />
                  ) : (
                    <div className="h-12 w-12 rounded bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold uppercase text-primary">Turno atual</div>
                    <div className="truncate text-base font-black">{current.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {rules.actionHint(current)}
                    </div>
                    {actionEntries(current).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {actionEntries(current).map((entry, index) => (
                          <Badge key={`${entry.type}-${entry.label}-${index}`} variant="outline" className="text-[9px]">
                            {entry.type === "move" ? "Move" : entry.type === "reaction" ? "Reação" : "Ação"}
                            {entry.label ? ` · ${entry.label}` : ""}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-black tabular-nums">{current.actionsUsed}</div>
                    <div className="text-[9px] uppercase text-muted-foreground">ações</div>
                  </div>
                </div>

                <div className="space-y-2 rounded-md border border-border p-2">
                  <Select
                    value={actionType}
                    onValueChange={setActionType}
                    disabled={!mayControlCurrent || session.status !== "running"}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {rules.actionTypes.map((action) => (
                        <SelectItem key={action.id} value={action.id}>
                          {action.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={actionLabel}
                    onChange={(event) => setActionLabel(event.target.value)}
                    placeholder="Descrição opcional"
                    className="h-8 text-xs"
                    disabled={!mayControlCurrent || session.status !== "running"}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!mayControlCurrent || session.status !== "running" || engine.isBusy}
                      onClick={() =>
                        void run(async () => {
                          await engine.commit({
                            type: "record_action",
                            participantId: current.id,
                            participantName: current.name,
                            actionType,
                            label: actionLabel,
                          });
                          setActionLabel("");
                        }, "Ação registrada.")
                      }
                    >
                      <Activity className="mr-1 h-3.5 w-3.5" /> Registrar ação
                    </Button>
                    <Button
                      size="sm"
                      disabled={!mayControlCurrent || session.status !== "running" || engine.isBusy}
                      onClick={() =>
                        void run(() => engine.commit({ type: "advance_turn" }), "Turno avançado.")
                      }
                    >
                      <FastForward className="mr-1 h-3.5 w-3.5" /> Passar turno
                    </Button>
                  </div>
                </div>
              </section>
            )}

            <Separator />
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase text-muted-foreground">Ordem</h3>
              <ol className="space-y-1">
                {session.state.participants.map((participant, index) => {
                  const imageUrl = participantImageUrl(participant);
                  return (
                    <li
                      key={participant.id}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${index === session.state.turnIndex ? "bg-primary/15 text-primary" : "bg-muted/40"}`}
                    >
                      <span className="w-4 text-center text-[10px] font-bold">{index + 1}</span>
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-md bg-background/60 object-contain"
                        />
                      ) : (
                        <div className="h-8 w-8 shrink-0 rounded-md bg-background/60" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {participant.name}
                      </span>
                      {participant.actionsUsed > 0 && (
                        <span
                          className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary"
                          title={actionEntries(participant)
                            .map((entry) => `${entry.type}: ${entry.label || "sem descrição"}`)
                            .join("\n")}
                        >
                          {participant.actionsUsed} ação(ões)
                        </span>
                      )}
                      <span className="text-muted-foreground">{participant.initiative ?? "-"}</span>
                    </li>
                  );
                })}
              </ol>
            </section>

            {isNarrator && (
              <div className="grid grid-cols-2 gap-2">
                {session.status === "paused" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={engine.isBusy}
                    onClick={() =>
                      void run(() => engine.commit({ type: "resume" }), "Motor retomado.")
                    }
                  >
                    <CirclePlay className="mr-1 h-3.5 w-3.5" /> Retomar
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={engine.isBusy}
                    onClick={() =>
                      void run(() => engine.commit({ type: "pause" }), "Motor pausado.")
                    }
                  >
                    <CirclePause className="mr-1 h-3.5 w-3.5" /> Pausar
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={engine.isBusy}
                  onClick={() =>
                    void run(() => engine.commit({ type: "finish" }), "Encontro encerrado.")
                  }
                >
                  <Flag className="mr-1 h-3.5 w-3.5" /> Encerrar
                </Button>
              </div>
            )}
          </div>
        )}

        {engine.events.length > 0 && (
          <section className="border-t border-border p-3">
            <h3 className="mb-2 flex items-center gap-1 text-xs font-bold uppercase text-muted-foreground">
              <History className="h-3.5 w-3.5" /> Histórico
            </h3>
            <div className="space-y-1">
              {engine.events.slice(0, 12).map((event) => (
                <div key={event.id} className="flex gap-2 text-[10px] text-muted-foreground">
                  <span className="shrink-0 tabular-nums">#{event.version}</span>
                  <span className="line-clamp-2">{eventLabel(event)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
