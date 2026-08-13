import type { Rank } from "@/lib/pokerole";

export type ClassicSceneId =
  | "bedroom"
  | "player_house_1f"
  | "rival_house_1f"
  | "rival_bedroom"
  | "pallet"
  | "lab"
  | "route_1"
  | "viridian"
  | "route_2"
  | "route_22";
export type ClassicFacing = "up" | "down" | "left" | "right";

export type ClassicTileKind =
  | "floor"
  | "rug"
  | "wall"
  | "door"
  | "bed"
  | "desk"
  | "table"
  | "shelf"
  | "stairs"
  | "pc"
  | "tv"
  | "kitchen"
  | "mother"
  | "daisy"
  | "plant"
  | "grass"
  | "tall-grass"
  | "path"
  | "tree"
  | "water"
  | "flowers"
  | "building-home"
  | "building-lab"
  | "building-center"
  | "building-mart"
  | "building-gym"
  | "fence"
  | "ledge"
  | "mailbox"
  | "npc-mart"
  | "lab-floor"
  | "counter"
  | "machine"
  | "starter-pod"
  | "professor"
  | "sign";

export type ClassicTransition = {
  scene: ClassicSceneId;
  x: number;
  y: number;
  requiresStarter?: boolean;
};

export type ClassicInteraction =
  | { kind: "message"; message: string }
  | { kind: "pc-storage" }
  | { kind: "mother-heal" }
  | { kind: "pokemon-center-heal" };

export type ClassicPathStep = {
  dx: number;
  dy: number;
  facing: ClassicFacing;
};

export type ClassicNpcTrainer = {
  id: string;
  name: string;
  x: number;
  y: number;
  facing: ClassicFacing;
  sightRange: number;
  rank: Rank;
  defeatedFlag: string;
  team: Array<{ species: string; rank: Rank }>;
};

export type ClassicScene = {
  id: ClassicSceneId;
  label: string;
  width: number;
  height: number;
  spawn: { x: number; y: number };
  tiles: ClassicTileKind[][];
  transitions: Record<string, ClassicTransition>;
  starterZones?: Set<string>;
  routeEndZones?: Set<string>;
  interactions?: Record<string, ClassicInteraction>;
  npcTrainers?: ClassicNpcTrainer[];
};

export const CLASSIC_ROUTE_1_ENCOUNTERS = [
  "Pidgey",
  "Rattata",
] as const;

export const CLASSIC_ROUTE_ENCOUNTERS: Partial<Record<ClassicSceneId, readonly string[]>> = {
  route_1: CLASSIC_ROUTE_1_ENCOUNTERS,
  route_2: ["Pidgey", "Rattata", "Caterpie", "Weedle"],
  route_22: ["Rattata", "Spearow", "Mankey"],
};

export const CLASSIC_ENCOUNTER_CHANCE = 0.16;

const WALKABLE_TILES = new Set<ClassicTileKind>([
  "floor",
  "rug",
  "door",
  "stairs",
  "grass",
  "tall-grass",
  "path",
  "flowers",
  "lab-floor",
]);

function key(x: number, y: number) {
  return `${x},${y}`;
}

function makeGrid(width: number, height: number, fill: ClassicTileKind) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
}

function rect(
  grid: ClassicTileKind[][],
  x: number,
  y: number,
  width: number,
  height: number,
  tile: ClassicTileKind,
) {
  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) {
      if (grid[row]?.[col] !== undefined) grid[row][col] = tile;
    }
  }
}

function border(grid: ClassicTileKind[][], tile: ClassicTileKind) {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  rect(grid, 0, 0, width, 1, tile);
  rect(grid, 0, height - 1, width, 1, tile);
  rect(grid, 0, 0, 1, height, tile);
  rect(grid, width - 1, 0, 1, height, tile);
}

function bedroomScene(): ClassicScene {
  const tiles = makeGrid(12, 10, "floor");
  border(tiles, "wall");
  rect(tiles, 1, 2, 2, 4, "bed");
  tiles[1][4] = "pc";
  rect(tiles, 4, 2, 2, 1, "desk");
  tiles[1][7] = "tv";
  tiles[2][7] = "desk";
  rect(tiles, 4, 5, 4, 3, "rug");
  tiles[8][1] = "plant";
  tiles[1][10] = "stairs";
  return {
    id: "bedroom",
    label: "Seu quarto",
    width: 12,
    height: 10,
    spawn: { x: 6, y: 5 },
    tiles,
    transitions: { [key(10, 1)]: { scene: "player_house_1f", x: 10, y: 2 } },
    interactions: {
      [key(4, 1)]: { kind: "pc-storage" },
      [key(7, 1)]: { kind: "message", message: "Um videogame. É hora de começar a jornada!" },
    },
  };
}

function playerHouseScene(): ClassicScene {
  const tiles = makeGrid(12, 10, "floor");
  border(tiles, "wall");
  rect(tiles, 1, 1, 4, 2, "kitchen");
  tiles[1][7] = "tv";
  tiles[2][7] = "shelf";
  rect(tiles, 4, 4, 4, 2, "table");
  tiles[5][3] = "mother";
  tiles[1][10] = "stairs";
  tiles[9][5] = "door";
  return {
    id: "player_house_1f",
    label: "Sua casa",
    width: 12,
    height: 10,
    spawn: { x: 10, y: 2 },
    tiles,
    transitions: {
      [key(10, 1)]: { scene: "bedroom", x: 9, y: 1 },
      [key(5, 9)]: { scene: "pallet", x: 6, y: 8 },
    },
    interactions: {
      [key(3, 5)]: { kind: "mother-heal" },
      [key(7, 1)]: { kind: "message", message: "Está passando um filme na TV." },
    },
  };
}

function rivalHouseScene(): ClassicScene {
  const tiles = makeGrid(12, 10, "floor");
  border(tiles, "wall");
  rect(tiles, 1, 1, 4, 2, "kitchen");
  tiles[1][7] = "tv";
  rect(tiles, 4, 4, 4, 2, "table");
  tiles[5][3] = "daisy";
  tiles[1][10] = "stairs";
  tiles[9][5] = "door";
  return {
    id: "rival_house_1f",
    label: "Casa do rival",
    width: 12,
    height: 10,
    spawn: { x: 5, y: 8 },
    tiles,
    transitions: {
      [key(10, 1)]: { scene: "rival_bedroom", x: 9, y: 1 },
      [key(5, 9)]: { scene: "pallet", x: 15, y: 8 },
    },
    interactions: {
      [key(3, 5)]: { kind: "message", message: "Daisy: Meu irmão está no laboratório do vovô." },
    },
  };
}

function rivalBedroomScene(): ClassicScene {
  const tiles = makeGrid(12, 10, "floor");
  border(tiles, "wall");
  rect(tiles, 1, 2, 2, 4, "bed");
  rect(tiles, 4, 1, 3, 2, "desk");
  rect(tiles, 8, 4, 2, 3, "shelf");
  rect(tiles, 4, 5, 3, 3, "rug");
  tiles[1][10] = "stairs";
  return {
    id: "rival_bedroom",
    label: "Quarto do rival",
    width: 12,
    height: 10,
    spawn: { x: 9, y: 1 },
    tiles,
    transitions: { [key(10, 1)]: { scene: "rival_house_1f", x: 10, y: 2 } },
    interactions: {
      [key(5, 1)]: { kind: "message", message: "Há anotações sobre treinadores e mapas da região." },
    },
  };
}

function palletScene(): ClassicScene {
  const tiles = makeGrid(24, 20, "grass");
  rect(tiles, 0, 0, 24, 2, "tree");
  rect(tiles, 0, 0, 2, 20, "tree");
  rect(tiles, 22, 0, 2, 20, "tree");
  rect(tiles, 0, 19, 24, 1, "tree");

  // North gate to Route 1.
  rect(tiles, 12, 0, 2, 3, "grass");

  // Player home (west) and rival home (east).
  rect(tiles, 5, 4, 5, 4, "building-home");
  tiles[7][6] = "door";
  tiles[7][4] = "mailbox";
  rect(tiles, 14, 4, 5, 4, "building-home");
  tiles[7][15] = "door";
  tiles[7][13] = "mailbox";

  // Flower garden and town sign.
  rect(tiles, 5, 11, 4, 1, "fence");
  tiles[11][9] = "sign";
  rect(tiles, 5, 12, 4, 2, "flowers");
  tiles[14][5] = "sign";

  // Professor Oak's laboratory and its front fence.
  rect(tiles, 13, 9, 7, 5, "building-lab");
  tiles[13][16] = "door";
  rect(tiles, 13, 16, 3, 1, "fence");
  tiles[16][16] = "sign";
  rect(tiles, 17, 16, 2, 1, "fence");

  // Route 21 pond at the southwest edge of town.
  rect(tiles, 7, 17, 4, 3, "water");

  return {
    id: "pallet",
    label: "Pallet",
    width: 24,
    height: 20,
    spawn: { x: 6, y: 8 },
    tiles,
    transitions: {
      [key(6, 7)]: { scene: "player_house_1f", x: 5, y: 8 },
      [key(15, 7)]: { scene: "rival_house_1f", x: 5, y: 8 },
      [key(16, 13)]: { scene: "lab", x: 8, y: 11 },
      [key(12, 0)]: { scene: "route_1", x: 12, y: 38, requiresStarter: true },
      [key(13, 0)]: { scene: "route_1", x: 13, y: 38, requiresStarter: true },
    },
    interactions: {
      [key(4, 7)]: { kind: "message", message: "Sua casa." },
      [key(13, 7)]: { kind: "message", message: "Casa do seu rival." },
      [key(9, 11)]: { kind: "message", message: "Cidade de Pallet: uma cidade branca onde novas jornadas começam." },
      [key(5, 14)]: { kind: "message", message: "Jardim comunitário de Pallet." },
      [key(16, 16)]: { kind: "message", message: "Laboratório de Pesquisa Pokémon do Professor Oak." },
    },
  };
}

function labScene(): ClassicScene {
  const tiles = makeGrid(16, 13, "lab-floor");
  border(tiles, "wall");
  rect(tiles, 2, 1, 3, 2, "machine");
  rect(tiles, 11, 1, 3, 2, "machine");
  rect(tiles, 4, 3, 7, 1, "counter");
  tiles[3][5] = "starter-pod";
  tiles[3][7] = "starter-pod";
  tiles[3][9] = "starter-pod";
  tiles[1][8] = "professor";
  rect(tiles, 2, 7, 3, 2, "desk");
  rect(tiles, 11, 7, 3, 2, "desk");
  tiles[12][8] = "door";

  const starterZones = new Set<string>();
  for (let x = 4; x <= 10; x += 1) starterZones.add(key(x, 4));

  return {
    id: "lab",
    label: "Laboratório de Pallet",
    width: 16,
    height: 13,
    spawn: { x: 8, y: 11 },
    tiles,
    transitions: { [key(8, 12)]: { scene: "pallet", x: 16, y: 14 } },
    starterZones,
  };
}

function routeOneScene(): ClassicScene {
  const width = 24;
  const height = 40;
  const tiles = makeGrid(width, height, "grass");
  rect(tiles, 0, 0, 2, height, "tree");
  rect(tiles, 22, 0, 2, height, "tree");
  rect(tiles, 0, 0, width, 2, "tree");
  rect(tiles, 0, 38, width, 2, "tree");

  // FRLG road: the yellow trail winds through the route in an S shape.
  rect(tiles, 10, 0, 4, 5, "path");
  rect(tiles, 13, 3, 9, 2, "path");
  rect(tiles, 18, 4, 4, 2, "path");
  rect(tiles, 13, 11, 9, 3, "path");
  rect(tiles, 13, 12, 3, 7, "path");
  rect(tiles, 5, 18, 10, 3, "path");
  rect(tiles, 5, 20, 4, 4, "path");
  rect(tiles, 5, 21, 17, 3, "path");
  rect(tiles, 18, 23, 4, 8, "path");
  rect(tiles, 2, 29, 20, 3, "path");
  rect(tiles, 11, 30, 4, 5, "path");

  // The five encounter fields from the Generation III map.
  rect(tiles, 10, 6, 12, 5, "tall-grass");
  rect(tiles, 16, 13, 6, 5, "tall-grass");
  rect(tiles, 12, 24, 6, 5, "tall-grass");
  rect(tiles, 4, 32, 7, 4, "tall-grass");
  rect(tiles, 2, 34, 2, 2, "tall-grass");
  rect(tiles, 16, 32, 6, 4, "tall-grass");

  // Tree clusters that shape the one-way northbound path.
  rect(tiles, 8, 3, 2, 9, "tree");
  rect(tiles, 2, 14, 2, 3, "tree");
  rect(tiles, 10, 14, 6, 3, "tree");
  rect(tiles, 2, 24, 10, 3, "tree");

  // Ledges may only be jumped while moving south.
  rect(tiles, 2, 5, 6, 1, "ledge");
  rect(tiles, 2, 10, 6, 1, "ledge");
  rect(tiles, 4, 15, 6, 1, "ledge");
  rect(tiles, 2, 20, 7, 1, "ledge");
  rect(tiles, 10, 20, 12, 1, "ledge");
  rect(tiles, 18, 27, 4, 1, "ledge");
  rect(tiles, 2, 31, 9, 1, "ledge");
  rect(tiles, 14, 31, 8, 1, "ledge");

  // Pallet gate fence with a three-tile opening.
  rect(tiles, 2, 36, 9, 1, "fence");
  rect(tiles, 14, 36, 8, 1, "fence");
  rect(tiles, 11, 36, 3, 4, "grass");

  const flowers = [
    [19, 2], [21, 2], [3, 6], [7, 6], [2, 7], [6, 7], [3, 8], [7, 8],
    [2, 9], [6, 9], [3, 11], [2, 12], [3, 13], [19, 18], [21, 18],
    [18, 19], [20, 19], [3, 27], [5, 27], [2, 28], [4, 28], [10, 34],
    [9, 35], [20, 34], [21, 35],
  ] as const;
  flowers.forEach(([x, y]) => { tiles[y][x] = "flowers"; });

  tiles[31][9] = "sign";
  tiles[29][7] = "npc-mart";

  // Connections to Viridian (north) and Pallet (south).
  rect(tiles, 10, 0, 4, 2, "path");
  rect(tiles, 12, 38, 2, 2, "grass");

  return {
    id: "route_1",
    label: "Rota 1",
    width,
    height,
    spawn: { x: 12, y: 38 },
    tiles,
    transitions: {
      [key(12, 39)]: { scene: "pallet", x: 12, y: 1 },
      [key(13, 39)]: { scene: "pallet", x: 13, y: 1 },
      [key(10, 0)]: { scene: "viridian", x: 14, y: 25 },
      [key(11, 0)]: { scene: "viridian", x: 14, y: 25 },
      [key(12, 0)]: { scene: "viridian", x: 15, y: 25 },
      [key(13, 0)]: { scene: "viridian", x: 15, y: 25 },
    },
    interactions: {
      [key(9, 31)]: { kind: "message", message: "Rota 1: Cidade de Pallet — Cidade de Viridian." },
      [key(7, 29)]: { kind: "message", message: "Funcionário do Poké Mart: leve esta amostra grátis de Potion para sua jornada." },
    },
  };
}

function viridianScene(): ClassicScene {
  const width = 30;
  const height = 28;
  const tiles = makeGrid(width, height, "grass");
  border(tiles, "tree");

  rect(tiles, 13, 0, 4, height, "path");
  rect(tiles, 0, 13, width, 4, "path");
  rect(tiles, 2, 4, 7, 5, "building-center");
  tiles[8][5] = "door";
  rect(tiles, 21, 4, 6, 5, "building-mart");
  tiles[8][24] = "door";
  rect(tiles, 3, 19, 8, 6, "building-gym");
  rect(tiles, 20, 19, 6, 5, "building-home");
  tiles[23][23] = "door";
  rect(tiles, 10, 5, 3, 4, "flowers");
  rect(tiles, 17, 19, 2, 5, "water");
  tiles[12][11] = "sign";
  tiles[12][18] = "sign";

  return {
    id: "viridian",
    label: "Cidade de Viridian",
    width,
    height,
    spawn: { x: 15, y: 25 },
    tiles,
    transitions: {
      [key(14, 27)]: { scene: "route_1", x: 11, y: 1 },
      [key(15, 27)]: { scene: "route_1", x: 12, y: 1 },
      [key(14, 0)]: { scene: "route_2", x: 11, y: 27 },
      [key(15, 0)]: { scene: "route_2", x: 12, y: 27 },
      [key(0, 14)]: { scene: "route_22", x: 29, y: 9 },
      [key(0, 15)]: { scene: "route_22", x: 29, y: 10 },
    },
    interactions: {
      [key(11, 12)]: { kind: "message", message: "Cidade de Viridian: o eterno paraíso verde." },
      [key(18, 12)]: { kind: "message", message: "O caminho oeste leva à Rota 22. Ao norte fica a Rota 2." },
      [key(5, 8)]: { kind: "message", message: "Centro Pokémon de Viridian. O interior será adicionado em uma próxima etapa." },
      [key(24, 8)]: { kind: "message", message: "Poké Mart de Viridian." },
    },
  };
}

function routeTwoScene(): ClassicScene {
  const width = 24;
  const height = 30;
  const tiles = makeGrid(width, height, "grass");
  border(tiles, "tree");
  rect(tiles, 10, 0, 4, height, "path");
  rect(tiles, 2, 4, 7, 7, "tall-grass");
  rect(tiles, 15, 7, 7, 8, "tall-grass");
  rect(tiles, 2, 18, 7, 7, "tall-grass");
  rect(tiles, 15, 20, 7, 6, "tall-grass");
  rect(tiles, 2, 14, 6, 1, "ledge");
  rect(tiles, 16, 17, 6, 1, "ledge");
  tiles[24][8] = "sign";
  return {
    id: "route_2",
    label: "Rota 2",
    width,
    height,
    spawn: { x: 11, y: 27 },
    tiles,
    transitions: {
      [key(11, 29)]: { scene: "viridian", x: 14, y: 1 },
      [key(12, 29)]: { scene: "viridian", x: 15, y: 1 },
    },
    routeEndZones: new Set([key(10, 0), key(11, 0), key(12, 0), key(13, 0)]),
    interactions: {
      [key(8, 24)]: { kind: "message", message: "Rota 2: Cidade de Viridian — Floresta de Viridian." },
    },
    npcTrainers: [{
      id: "route2-youngster-ben",
      name: "Jovem Ben",
      x: 12,
      y: 16,
      facing: "down",
      sightRange: 5,
      rank: "beginner",
      defeatedFlag: "defeated_route2_youngster_ben",
      team: [
        { species: "Rattata", rank: "starter" },
        { species: "Spearow", rank: "beginner" },
      ],
    }],
  };
}

function routeTwentyTwoScene(): ClassicScene {
  const width = 32;
  const height = 20;
  const tiles = makeGrid(width, height, "grass");
  border(tiles, "tree");
  rect(tiles, 0, 8, width, 4, "path");
  rect(tiles, 4, 3, 8, 5, "tall-grass");
  rect(tiles, 14, 12, 8, 5, "tall-grass");
  rect(tiles, 24, 3, 6, 5, "tall-grass");
  rect(tiles, 2, 13, 9, 1, "ledge");
  rect(tiles, 21, 6, 8, 1, "ledge");
  tiles[7][27] = "sign";
  return {
    id: "route_22",
    label: "Rota 22",
    width,
    height,
    spawn: { x: 29, y: 9 },
    tiles,
    transitions: {
      [key(31, 9)]: { scene: "viridian", x: 1, y: 14 },
      [key(31, 10)]: { scene: "viridian", x: 1, y: 15 },
    },
    routeEndZones: new Set([key(0, 8), key(0, 9), key(0, 10), key(0, 11)]),
    interactions: {
      [key(27, 7)]: { kind: "message", message: "Rota 22: o caminho para a Liga Pokémon ainda está fechado." },
    },
  };
}

function viridianSceneV2(): ClassicScene {
  const width = 30;
  const height = 28;
  const tiles = makeGrid(width, height, "grass");
  border(tiles, "tree");

  // FRLG road silhouette: Route 2 north, Route 22 west and Route 1 south.
  rect(tiles, 13, 0, 4, 28, "path");
  rect(tiles, 0, 10, 17, 5, "path");
  rect(tiles, 13, 10, 15, 4, "path");
  rect(tiles, 7, 13, 4, 12, "path");
  rect(tiles, 7, 22, 10, 3, "path");
  rect(tiles, 20, 12, 4, 8, "path");

  rect(tiles, 2, 2, 9, 1, "fence");
  rect(tiles, 2, 2, 1, 7, "fence");
  rect(tiles, 10, 2, 1, 7, "fence");
  rect(tiles, 2, 8, 9, 1, "fence");
  rect(tiles, 4, 4, 5, 4, "building-gym");

  rect(tiles, 20, 2, 7, 6, "building-gym");
  tiles[7][23] = "door";
  rect(tiles, 18, 2, 1, 7, "fence");

  rect(tiles, 3, 15, 6, 4, "building-home");
  tiles[18][6] = "door";
  rect(tiles, 3, 20, 6, 4, "building-home");
  tiles[23][6] = "door";
  rect(tiles, 21, 14, 6, 4, "building-mart");
  tiles[17][24] = "door";
  rect(tiles, 11, 19, 7, 5, "building-center");
  tiles[23][14] = "door";

  rect(tiles, 1, 20, 2, 6, "tree");
  rect(tiles, 3, 25, 7, 2, "water");
  rect(tiles, 24, 21, 3, 4, "flowers");
  rect(tiles, 18, 21, 2, 4, "flowers");
  tiles[9][12] = "sign";
  tiles[18][19] = "sign";

  return {
    id: "viridian",
    label: "Cidade de Viridian",
    width,
    height,
    spawn: { x: 15, y: 25 },
    tiles,
    transitions: {
      [key(14, 27)]: { scene: "route_1", x: 11, y: 1 },
      [key(15, 27)]: { scene: "route_1", x: 12, y: 1 },
      [key(14, 0)]: { scene: "route_2", x: 10, y: 34 },
      [key(15, 0)]: { scene: "route_2", x: 11, y: 34 },
      [key(0, 11)]: { scene: "route_22", x: 34, y: 10 },
      [key(0, 12)]: { scene: "route_22", x: 34, y: 11 },
    },
    interactions: {
      [key(12, 9)]: { kind: "message", message: "Cidade de Viridian: o eterno paraiso verde." },
      [key(19, 18)]: { kind: "message", message: "O caminho oeste leva a Rota 22. Ao norte fica a Rota 2." },
      [key(14, 23)]: { kind: "pokemon-center-heal" },
      [key(24, 17)]: { kind: "message", message: "Poke Mart de Viridian." },
      [key(23, 7)]: { kind: "message", message: "O Ginasio de Viridian esta fechado." },
    },
  };
}

function routeTwoSceneV2(): ClassicScene {
  const width = 24;
  const height = 36;
  const tiles = makeGrid(width, height, "grass");
  border(tiles, "tree");

  // Southern section and the eastern grass field outside Viridian.
  rect(tiles, 9, 27, 3, 9, "path");
  rect(tiles, 9, 23, 8, 5, "path");
  rect(tiles, 15, 27, 7, 6, "tall-grass");
  rect(tiles, 17, 33, 5, 2, "flowers");

  // Gate houses split the route into the same three recognizable sections.
  rect(tiles, 7, 21, 6, 3, "building-home");
  rect(tiles, 9, 21, 3, 3, "path");
  rect(tiles, 9, 18, 3, 4, "path");
  rect(tiles, 4, 14, 7, 4, "building-home");
  tiles[17][9] = "door";
  rect(tiles, 10, 14, 3, 5, "path");

  // Northern path winds west around the forest edge.
  rect(tiles, 10, 9, 3, 6, "path");
  rect(tiles, 5, 7, 8, 3, "path");
  rect(tiles, 4, 2, 3, 7, "path");
  rect(tiles, 2, 2, 6, 5, "tall-grass");
  rect(tiles, 13, 10, 8, 7, "tree");
  rect(tiles, 1, 11, 7, 3, "tree");
  rect(tiles, 15, 19, 7, 5, "tree");
  rect(tiles, 1, 24, 7, 7, "tree");
  rect(tiles, 1, 32, 7, 3, "tree");
  rect(tiles, 13, 33, 3, 2, "tree");
  tiles[26][8] = "sign";

  return {
    id: "route_2",
    label: "Rota 2",
    width,
    height,
    spawn: { x: 10, y: 34 },
    tiles,
    transitions: {
      [key(10, 35)]: { scene: "viridian", x: 14, y: 1 },
      [key(11, 35)]: { scene: "viridian", x: 15, y: 1 },
    },
    routeEndZones: new Set([key(4, 0), key(5, 0), key(6, 0)]),
    interactions: {
      [key(8, 26)]: { kind: "message", message: "Rota 2: Cidade de Viridian - Floresta de Viridian." },
    },
    npcTrainers: [{
      id: "route2-youngster-ben",
      name: "Jovem Ben",
      x: 10,
      y: 12,
      facing: "down",
      sightRange: 4,
      rank: "beginner",
      defeatedFlag: "defeated_route2_youngster_ben",
      team: [
        { species: "Rattata", rank: "starter" },
        { species: "Spearow", rank: "beginner" },
      ],
    }],
  };
}

function routeTwentyTwoSceneV2(): ClassicScene {
  const width = 36;
  const height = 22;
  const tiles = makeGrid(width, height, "grass");
  border(tiles, "tree");

  // The route bends west around a pond instead of using a straight corridor.
  rect(tiles, 28, 9, 8, 4, "path");
  rect(tiles, 23, 7, 7, 4, "path");
  rect(tiles, 18, 7, 6, 8, "path");
  rect(tiles, 10, 13, 10, 3, "path");
  rect(tiles, 3, 11, 9, 4, "path");

  rect(tiles, 12, 5, 5, 6, "water");
  rect(tiles, 13, 4, 3, 1, "water");
  rect(tiles, 4, 4, 7, 6, "tall-grass");
  rect(tiles, 23, 13, 8, 6, "tall-grass");
  rect(tiles, 30, 3, 4, 5, "tall-grass");
  rect(tiles, 2, 16, 10, 1, "ledge");
  rect(tiles, 21, 5, 8, 1, "ledge");
  rect(tiles, 1, 2, 2, 8, "tree");
  rect(tiles, 1, 17, 14, 4, "tree");
  rect(tiles, 16, 17, 6, 4, "tree");
  tiles[8][30] = "sign";

  return {
    id: "route_22",
    label: "Rota 22",
    width,
    height,
    spawn: { x: 34, y: 10 },
    tiles,
    transitions: {
      [key(35, 10)]: { scene: "viridian", x: 1, y: 11 },
      [key(35, 11)]: { scene: "viridian", x: 1, y: 12 },
    },
    routeEndZones: new Set([key(0, 11), key(0, 12), key(0, 13), key(0, 14)]),
    interactions: {
      [key(30, 8)]: { kind: "message", message: "Rota 22: o caminho para a Liga Pokemon ainda esta fechado." },
    },
  };
}

export const CLASSIC_SCENES: Record<ClassicSceneId, ClassicScene> = {
  bedroom: bedroomScene(),
  player_house_1f: playerHouseScene(),
  rival_house_1f: rivalHouseScene(),
  rival_bedroom: rivalBedroomScene(),
  pallet: palletScene(),
  lab: labScene(),
  route_1: routeOneScene(),
  viridian: viridianSceneV2(),
  route_2: routeTwoSceneV2(),
  route_22: routeTwentyTwoSceneV2(),
};

export function classicTileKey(x: number, y: number) {
  return key(x, y);
}

export function isClassicTileWalkable(scene: ClassicScene, x: number, y: number) {
  if (x < 0 || y < 0 || x >= scene.width || y >= scene.height) return false;
  if (scene.npcTrainers?.some((npc) => npc.x === x && npc.y === y)) return false;
  return WALKABLE_TILES.has(scene.tiles[y][x]);
}

export function findNpcTrainerChallenge(
  scene: ClassicScene,
  x: number,
  y: number,
  storyFlags: Record<string, unknown> = {},
) {
  for (const npc of scene.npcTrainers ?? []) {
    if (storyFlags[npc.defeatedFlag] === true) continue;
    const direction = npc.facing === "up"
      ? { dx: 0, dy: -1 }
      : npc.facing === "down"
        ? { dx: 0, dy: 1 }
        : npc.facing === "left"
          ? { dx: -1, dy: 0 }
          : { dx: 1, dy: 0 };
    for (let distance = 1; distance <= npc.sightRange; distance += 1) {
      const sightX = npc.x + direction.dx * distance;
      const sightY = npc.y + direction.dy * distance;
      if (sightX === x && sightY === y) return npc;
      if (!isClassicTileWalkable({ ...scene, npcTrainers: [] }, sightX, sightY)) break;
    }
  }
  return null;
}

export function findClassicPath(
  scene: ClassicScene,
  start: { x: number; y: number },
  target: { x: number; y: number },
): ClassicPathStep[] | null {
  if (start.x === target.x && start.y === target.y) return [];

  const targetKey = key(target.x, target.y);
  const targetIsEndpoint = !!scene.transitions[targetKey]
    || !!scene.interactions?.[targetKey]
    || isClassicTileWalkable(scene, target.x, target.y);
  if (!targetIsEndpoint) return null;

  type PathNode = { x: number; y: number; steps: ClassicPathStep[] };
  const queue: PathNode[] = [{ ...start, steps: [] }];
  const visited = new Set([key(start.x, start.y)]);
  const directions: ClassicPathStep[] = [
    { dx: 0, dy: -1, facing: "up" },
    { dx: -1, dy: 0, facing: "left" },
    { dx: 1, dy: 0, facing: "right" },
    { dx: 0, dy: 1, facing: "down" },
  ];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    for (const direction of directions) {
      const adjacentX = current.x + direction.dx;
      const adjacentY = current.y + direction.dy;
      const adjacentKey = key(adjacentX, adjacentY);
      const isRequestedEndpoint = adjacentX === target.x && adjacentY === target.y;

      if (scene.transitions[adjacentKey] || scene.interactions?.[adjacentKey]) {
        if (isRequestedEndpoint) return [...current.steps, direction];
        continue;
      }

      let nextX = adjacentX;
      let nextY = adjacentY;
      if (scene.tiles[adjacentY]?.[adjacentX] === "ledge") {
        nextY = adjacentY + 1;
        if (direction.dx !== 0 || direction.dy !== 1 || !isClassicTileWalkable(scene, nextX, nextY)) continue;
      } else if (!isClassicTileWalkable(scene, nextX, nextY)) {
        continue;
      }

      const nextKey = key(nextX, nextY);
      if (visited.has(nextKey)) continue;
      const nextSteps = [...current.steps, direction];
      if (nextX === target.x && nextY === target.y) return nextSteps;
      visited.add(nextKey);
      queue.push({ x: nextX, y: nextY, steps: nextSteps });
    }
  }

  return null;
}

export function classicObjective(starterPokemonId: string | null | undefined, scene: ClassicSceneId) {
  if (scene === "bedroom") return "Confira o PC ou desça para o andar de baixo.";
  if (scene === "player_house_1f") return starterPokemonId
    ? "Sua mãe pode recuperar sua equipe. Saia para continuar a jornada."
    : "Saia de casa e visite o laboratório.";
  if (scene === "rival_house_1f") return "Explore a casa ou suba para o quarto.";
  if (scene === "rival_bedroom") return "Desça as escadas para voltar.";
  if (!starterPokemonId && scene === "pallet") return "Vá ao laboratório de Pallet.";
  if (!starterPokemonId && scene === "lab") return "Aproxime-se das Poké Bolas e escolha seu parceiro.";
  if (scene === "lab") return "Saia do laboratório e siga para o norte de Pallet.";
  if (scene === "pallet") return "Siga pela saída norte em direção à Rota 1.";
  if (scene === "route_1") return "Atravesse a Rota 1 e chegue a Viridian.";
  if (scene === "viridian") return "Explore Viridian ou siga para as Rotas 2 e 22.";
  if (scene === "route_2") return "Explore a Rota 2 e enfrente os treinadores do caminho.";
  return "Explore a Rota 22 e prepare-se para desafios futuros.";
}
