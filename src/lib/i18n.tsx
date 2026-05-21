// Tiny i18n: no external dep. Loads per-game language, falls back to en.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "pt-BR" | "en" | "es";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

type Dict = Record<string, string>;

const EN: Dict = {
  "yourGames": "Your games",
  "yourGamesSubtitle": "Create a new campaign as Narrator, or join one with an invite link.",
  "createNewGame": "Create New Game",
  "campaignName": "Campaign name",
  "narrator": "Narrator",
  "narratedByPerson": "Narrated by a person (you)",
  "narratedByAi": "Narrated by AI",
  "language": "Language",
  "create": "Create",
  "delete": "Delete",
  "deleteSelected": "Delete selected",
  "select": "Select",
  "cancel": "Cancel",
  "noGamesYet": "No games yet",
  "loading": "Loading…",
  "player": "Player",
  "members": "members",
  "member": "member",
  "chat": "Chat",
  "compendium": "Compendium",
  "files": "Files",
  "characters": "Characters",
  "trainer": "Trainer",
  "pokemon": "Pokémon",
  "turnOrder": "Turn Order",
  "scenario": "Scenario",
  "scenarios": "Scenarios",
  "invite": "Invite",
  "setBackground": "Set background",
  "dropSheetHere": "Drop a sheet here.",
  "noCharacters": "No characters yet. Create one to get started.",
  "tipDrag": "Tip: drag a character onto the map to place a token, or onto a folder to organize.",
  "newFolderName": "New folder name…",
  "add": "Add",
  "confirmDeleteGame": "Delete this game? This cannot be undone.",
  "confirmDeleteSelected": "Delete the selected games? This cannot be undone.",
  "darkMode": "Dark mode",
  "lightMode": "Light mode",
};

const PT: Dict = {
  "yourGames": "Seus jogos",
  "yourGamesSubtitle": "Crie uma nova campanha como Narrador, ou entre em uma com um link de convite.",
  "createNewGame": "Criar Novo Jogo",
  "campaignName": "Nome da campanha",
  "narrator": "Narrador",
  "narratedByPerson": "Narrado por uma pessoa (você)",
  "narratedByAi": "Narrado pela IA",
  "language": "Idioma",
  "create": "Criar",
  "delete": "Excluir",
  "deleteSelected": "Excluir selecionados",
  "select": "Selecionar",
  "cancel": "Cancelar",
  "noGamesYet": "Nenhum jogo ainda",
  "loading": "Carregando…",
  "player": "Jogador",
  "members": "membros",
  "member": "membro",
  "chat": "Chat",
  "compendium": "Compêndio",
  "files": "Fichas",
  "characters": "Personagens",
  "trainer": "Treinador",
  "pokemon": "Pokémon",
  "turnOrder": "Ordem de Turno",
  "scenario": "Cenário",
  "scenarios": "Cenários",
  "invite": "Convidar",
  "setBackground": "Definir fundo",
  "dropSheetHere": "Arraste uma ficha aqui.",
  "noCharacters": "Nenhum personagem ainda. Crie um para começar.",
  "tipDrag": "Dica: arraste um personagem para o mapa para criar um token, ou para uma pasta para organizar.",
  "newFolderName": "Nome da nova pasta…",
  "add": "Adicionar",
  "confirmDeleteGame": "Excluir este jogo? Esta ação não pode ser desfeita.",
  "confirmDeleteSelected": "Excluir os jogos selecionados? Esta ação não pode ser desfeita.",
  "darkMode": "Modo escuro",
  "lightMode": "Modo claro",
};

const ES: Dict = {
  "yourGames": "Tus partidas",
  "yourGamesSubtitle": "Crea una nueva campaña como Narrador, o únete a una con un enlace de invitación.",
  "createNewGame": "Crear Nueva Partida",
  "campaignName": "Nombre de la campaña",
  "narrator": "Narrador",
  "narratedByPerson": "Narrada por una persona (tú)",
  "narratedByAi": "Narrada por IA",
  "language": "Idioma",
  "create": "Crear",
  "delete": "Eliminar",
  "deleteSelected": "Eliminar seleccionados",
  "select": "Seleccionar",
  "cancel": "Cancelar",
  "noGamesYet": "Aún no hay partidas",
  "loading": "Cargando…",
  "player": "Jugador",
  "members": "miembros",
  "member": "miembro",
  "chat": "Chat",
  "compendium": "Compendio",
  "files": "Fichas",
  "characters": "Personajes",
  "trainer": "Entrenador",
  "pokemon": "Pokémon",
  "turnOrder": "Orden de Turno",
  "scenario": "Escenario",
  "scenarios": "Escenarios",
  "invite": "Invitar",
  "setBackground": "Establecer fondo",
  "dropSheetHere": "Suelta una ficha aquí.",
  "noCharacters": "Aún no hay personajes. Crea uno para empezar.",
  "tipDrag": "Sugerencia: arrastra un personaje al mapa para crear una ficha, o a una carpeta para organizar.",
  "newFolderName": "Nombre de la nueva carpeta…",
  "add": "Añadir",
  "confirmDeleteGame": "¿Eliminar esta partida? Esta acción no se puede deshacer.",
  "confirmDeleteSelected": "¿Eliminar las partidas seleccionadas? Esta acción no se puede deshacer.",
  "darkMode": "Modo oscuro",
  "lightMode": "Modo claro",
};

const DICTS: Record<Lang, Dict> = { en: EN, "pt-BR": PT, es: ES };

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: "pt-BR", setLang: () => {},
});

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLang] = useState<Lang>(() => {
    if (initial) return initial;
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("lang") as Lang | null;
      if (saved && DICTS[saved]) return saved;
    }
    return "pt-BR";
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("lang", lang);
  }, [lang]);
  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}

export function useT() {
  const { lang, setLang } = useContext(LangCtx);
  const dict = DICTS[lang] ?? EN;
  const t = (key: keyof typeof EN) => dict[key] ?? EN[key] ?? key;
  return { t, lang, setLang };
}
