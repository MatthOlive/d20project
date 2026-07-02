export const T20_SYSTEM_ID = "t20";

export type T20AttributeKey =
  | "forca"
  | "destreza"
  | "constituicao"
  | "inteligencia"
  | "sabedoria"
  | "carisma";

export const T20_ATTRIBUTES: { key: T20AttributeKey; label: string; short: string }[] = [
  { key: "forca", label: "Forca", short: "FOR" },
  { key: "destreza", label: "Destreza", short: "DES" },
  { key: "constituicao", label: "Constituicao", short: "CON" },
  { key: "inteligencia", label: "Inteligencia", short: "INT" },
  { key: "sabedoria", label: "Sabedoria", short: "SAB" },
  { key: "carisma", label: "Carisma", short: "CAR" },
];

export const T20_SKILLS = [
  "Acrobacia",
  "Adestramento",
  "Atletismo",
  "Atuacao",
  "Cavalgar",
  "Conhecimento",
  "Cura",
  "Diplomacia",
  "Enganacao",
  "Fortitude",
  "Furtividade",
  "Guerra",
  "Iniciativa",
  "Intimidacao",
  "Intuicao",
  "Investigacao",
  "Jogatina",
  "Ladinagem",
  "Luta",
  "Misticismo",
  "Nobreza",
  "Oficio",
  "Percepcao",
  "Pilotagem",
  "Pontaria",
  "Reflexos",
  "Religiao",
  "Sobrevivencia",
  "Vontade",
] as const;

export const T20_RACES = [
  "Humano",
  "Anao",
  "Dahllan",
  "Elfo",
  "Goblin",
  "Lefou",
  "Minotauro",
  "Qareen",
  "Golem",
  "Hynne",
  "Kliren",
  "Medusa",
  "Osteon",
  "Sereia/Tritao",
  "Silfide",
  "Suraggel",
  "Trog",
] as const;

export const T20_CLASSES = [
  "Arcanista",
  "Barbaro",
  "Bardo",
  "Bucaneiro",
  "Cacador",
  "Cavaleiro",
  "Clerigo",
  "Druida",
  "Guerreiro",
  "Inventor",
  "Ladino",
  "Lutador",
  "Nobre",
  "Paladino",
] as const;

export const T20_QUICK_ROLLS = [
  { label: "Iniciativa", skill: "Iniciativa" },
  { label: "Luta", skill: "Luta" },
  { label: "Pontaria", skill: "Pontaria" },
  { label: "Fortitude", skill: "Fortitude" },
  { label: "Reflexos", skill: "Reflexos" },
  { label: "Vontade", skill: "Vontade" },
] as const;

export const T20_MECHANICS: { title: string; body: string; category: string }[] = [
  {
    category: "Basico",
    title: "Teste d20",
    body: "Role 1d20, some o modificador do teste e compare com a dificuldade definida pelo narrador. A ficha salva os valores como modificadores prontos para somar.",
  },
  {
    category: "Basico",
    title: "Pericias na ficha",
    body: "Cada pericia guarda o bonus final que voce quer rolar. Isso deixa a primeira versao flexivel: voce pode incluir atributo, treino, nivel e outros ajustes no proprio numero.",
  },
  {
    category: "Combate",
    title: "Iniciativa",
    body: "Use a pericia Iniciativa. Quando a rolagem tem Iniciativa no nome, o personagem entra automaticamente na ordem de turnos usando o total do d20.",
  },
  {
    category: "Combate",
    title: "Ataques",
    body: "Use Luta para ataques corpo a corpo e Pontaria para ataques a distancia. O campo Ataques pode guardar dano, margem, alcance e observacoes de cada arma ou magia ofensiva.",
  },
  {
    category: "Combate",
    title: "Defesas",
    body: "A ficha acompanha PV, PM e Defesa. No mapa, o token T20 mostra PV/PM e permite alterar esses valores rapidamente.",
  },
  {
    category: "Resistencias",
    title: "Fortitude, Reflexos e Vontade",
    body: "Essas tres pericias aparecem como rolagens rapidas porque costumam ser chamadas com frequencia durante cenas perigosas.",
  },
  {
    category: "Personagem",
    title: "Raca, classe e origem",
    body: "A primeira versao guarda as escolhas centrais do personagem e deixa os efeitos mecanicos nos campos de atributos, pericias, poderes e notas.",
  },
  {
    category: "Personagem",
    title: "Poderes, magias e inventario",
    body: "Use os blocos de texto para registrar poderes, magias, equipamentos e recursos. A proxima etapa pode transformar esses blocos em listas com botoes de rolagem.",
  },
] as const;

export const T20_MECHANICS_CATEGORY_ORDER = ["Basico", "Combate", "Resistencias", "Personagem"];

export type T20RollResult = {
  system: "t20";
  die: number;
  modifier: number;
  total: number;
};

export function rollD20(modifier = 0): T20RollResult {
  const die = Math.floor(Math.random() * 20) + 1;
  return { system: "t20", die, modifier, total: die + modifier };
}

export function defaultT20Attributes(): Record<T20AttributeKey, number> {
  return {
    forca: 0,
    destreza: 0,
    constituicao: 0,
    inteligencia: 0,
    sabedoria: 0,
    carisma: 0,
  };
}

export function defaultT20Skills(): Record<string, number> {
  return Object.fromEntries(T20_SKILLS.map((skill) => [skill, 0]));
}

export function parseT20RollLines(text: string | null | undefined) {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.*?)(?:\s+([+-]?\d+))\s*$/);
      if (!match) return null;
      const label = match[1].trim();
      const modifier = Number(match[2]);
      if (!label || !Number.isFinite(modifier)) return null;
      return { label, modifier };
    })
    .filter((item): item is { label: string; modifier: number } => !!item);
}
