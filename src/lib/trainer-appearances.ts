import maleUrban from "@/assets/trainer-male-urban.webp";
import maleResearcher from "@/assets/trainer-male-researcher.webp";
import maleExplorer from "@/assets/trainer-male-explorer.webp";
import femaleUrban from "@/assets/trainer-female-urban.webp";
import femaleResearcher from "@/assets/trainer-female-researcher.webp";
import femaleExplorer from "@/assets/trainer-female-explorer.webp";

export type TrainerGender = "male" | "female";

export type TrainerAppearanceId =
  | "male-urban"
  | "male-researcher"
  | "male-explorer"
  | "female-urban"
  | "female-researcher"
  | "female-explorer";

export type TrainerAppearance = {
  id: TrainerAppearanceId;
  gender: TrainerGender;
  label: string;
  spriteSheet: string;
};

export const TRAINER_APPEARANCE_PREFIX = "d20-trainer:";

export const TRAINER_APPEARANCES: readonly TrainerAppearance[] = [
  { id: "male-urban", gender: "male", label: "Urbano", spriteSheet: maleUrban },
  { id: "male-researcher", gender: "male", label: "Pesquisador", spriteSheet: maleResearcher },
  { id: "male-explorer", gender: "male", label: "Explorador", spriteSheet: maleExplorer },
  { id: "female-urban", gender: "female", label: "Urbana", spriteSheet: femaleUrban },
  { id: "female-researcher", gender: "female", label: "Pesquisadora", spriteSheet: femaleResearcher },
  { id: "female-explorer", gender: "female", label: "Exploradora", spriteSheet: femaleExplorer },
] as const;

export function trainerAppearancesForGender(gender: TrainerGender) {
  return TRAINER_APPEARANCES.filter((appearance) => appearance.gender === gender);
}

export function defaultTrainerAppearance(gender: TrainerGender): TrainerAppearanceId {
  return gender === "female" ? "female-urban" : "male-urban";
}

export function trainerAppearanceStorageValue(id: TrainerAppearanceId) {
  return `${TRAINER_APPEARANCE_PREFIX}${id}`;
}

export function resolveTrainerAppearance(value: string | null | undefined): TrainerAppearance | null {
  if (!value?.startsWith(TRAINER_APPEARANCE_PREFIX)) return null;
  const id = value.slice(TRAINER_APPEARANCE_PREFIX.length) as TrainerAppearanceId;
  return TRAINER_APPEARANCES.find((appearance) => appearance.id === id) ?? null;
}
