import { useEffect, useMemo, useState, type ImgHTMLAttributes, type ReactNode } from "react";
import { pokemonSpriteCandidates, type PokemonSpriteStyle } from "@/lib/pokerole";

type PokemonSpriteImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  speciesName?: string | null;
  spriteUrl?: string | null;
  customUrl?: string | null;
  shiny?: boolean;
  spriteStyle?: PokemonSpriteStyle;
  emptyFallback?: ReactNode;
};

export function PokemonSpriteImage({
  speciesName,
  spriteUrl,
  customUrl,
  shiny = false,
  spriteStyle = "pixel",
  emptyFallback = null,
  onError,
  ...imageProps
}: PokemonSpriteImageProps) {
  const sources = useMemo(
    () => pokemonSpriteCandidates(speciesName, spriteUrl, shiny, spriteStyle, customUrl),
    [customUrl, shiny, speciesName, spriteStyle, spriteUrl],
  );
  const sourcesKey = sources.join("|");
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [sourcesKey]);

  const source = sources[sourceIndex];
  if (!source) return <>{emptyFallback}</>;

  return (
    <img
      loading="lazy"
      decoding="async"
      {...imageProps}
      src={source}
      onError={(event) => {
        onError?.(event);
        setSourceIndex((current) => current + 1);
      }}
    />
  );
}
