import { useState, type ImgHTMLAttributes } from "react";

type DigiRoleImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  speciesName?: string | null;
};

export function DigiRoleImage({ src, speciesName: _speciesName, style, ...props }: DigiRoleImageProps) {
  const [focusFace, setFocusFace] = useState(false);

  return (
    <img
      {...props}
      src={src}
      onLoad={(event) => {
        const image = event.currentTarget;
        setFocusFace(
          image.naturalHeight / Math.max(image.naturalWidth, 1) > 1.35 ||
            image.naturalWidth / Math.max(image.naturalHeight, 1) > 1.35,
        );
        props.onLoad?.(event);
      }}
      style={{
        ...style,
        backgroundColor: "#ffffff",
        border: "2px solid rgba(15, 23, 42, 0.35)",
        borderRadius: "9999px",
        objectFit: focusFace ? "cover" : "contain",
        objectPosition: focusFace ? "center 30%" : "center",
      }}
    />
  );
}
