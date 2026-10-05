import type { ImgHTMLAttributes } from "react";
import { useGameAssetUrl } from "@/hooks/use-game-asset-url";

type GameAssetImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
};

export function GameAssetImage({ src, ...props }: GameAssetImageProps) {
  const resolvedUrl = useGameAssetUrl(src);
  return <img {...props} src={resolvedUrl ?? undefined} />;
}
