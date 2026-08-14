import type { CSSProperties } from "react";
import { Check, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  defaultTrainerAppearance,
  resolveTrainerAppearance,
  trainerAppearancesForGender,
  type TrainerAppearanceId,
  type TrainerGender,
} from "@/lib/trainer-appearances";

type Facing = "up" | "down" | "left" | "right";

const FACING_ROW: Record<Facing, number> = {
  down: 0,
  right: 1,
  up: 2,
  left: 3,
};

export function TrainerAppearanceImage({
  value,
  alt,
  facing = "down",
  frame = 0,
  className = "",
}: {
  value: string | null | undefined;
  alt: string;
  facing?: Facing;
  frame?: number;
  className?: string;
}) {
  const appearance = resolveTrainerAppearance(value);
  if (!appearance) {
    return value ? (
      <img src={value} alt={alt} className={className} draggable={false} />
    ) : null;
  }

  const column = Math.max(0, Math.min(3, Math.floor(frame)));
  const row = FACING_ROW[facing];
  const backgroundPosition = `${column * (100 / 3)}% ${row * (100 / 3)}%`;

  return (
    <span
      role="img"
      aria-label={alt}
      className={`relative inline-block overflow-hidden ${className}`}
    >
      <span
        className="absolute inset-0"
        style={{
          backgroundImage: `url("${appearance.spriteSheet}")`,
          backgroundPosition,
          backgroundRepeat: "no-repeat",
          backgroundSize: "400% 400%",
          imageRendering: "pixelated",
        } as CSSProperties}
      />
    </span>
  );
}

export function TrainerIdentityFields({
  name,
  onNameChange,
  gender,
  onGenderChange,
  appearanceId,
  onAppearanceChange,
  disabled = false,
  idPrefix,
}: {
  name: string;
  onNameChange: (value: string) => void;
  gender: TrainerGender;
  onGenderChange: (value: TrainerGender) => void;
  appearanceId: TrainerAppearanceId;
  onAppearanceChange: (value: TrainerAppearanceId) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const appearances = trainerAppearancesForGender(gender);

  function selectGender(nextGender: TrainerGender) {
    onGenderChange(nextGender);
    onAppearanceChange(defaultTrainerAppearance(nextGender));
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>Nome</Label>
        <Input
          id={`${idPrefix}-name`}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Nome do treinador"
          maxLength={60}
          disabled={disabled}
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label>Personagem</Label>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Escolha do personagem">
          <Button
            type="button"
            variant={gender === "male" ? "default" : "outline"}
            className="justify-center"
            disabled={disabled}
            onClick={() => selectGender("male")}
          >
            <UserRound className="mr-2 h-4 w-4" /> Menino
          </Button>
          <Button
            type="button"
            variant={gender === "female" ? "default" : "outline"}
            className="justify-center"
            disabled={disabled}
            onClick={() => selectGender("female")}
          >
            <UserRound className="mr-2 h-4 w-4" /> Menina
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Visual</Label>
        <div className="grid grid-cols-3 gap-2">
          {appearances.map((appearance) => {
            const selected = appearance.id === appearanceId;
            return (
              <button
                key={appearance.id}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => onAppearanceChange(appearance.id)}
                className={`relative flex min-w-0 flex-col items-center gap-2 rounded-md border p-2 transition-colors ${
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground"
                }`}
              >
                <TrainerAppearanceImage
                  value={`d20-trainer:${appearance.id}`}
                  alt={appearance.label}
                  className="aspect-square w-full max-w-24 bg-muted/40"
                />
                <span className="w-full truncate text-center text-xs font-bold">{appearance.label}</span>
                {selected && (
                  <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
