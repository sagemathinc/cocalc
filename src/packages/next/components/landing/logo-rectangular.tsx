import React from "react";
import { useCustomize } from "lib/customize";
import { appBasePath } from "lib/base-path";
import { join } from "path";

export default function RectangularLogo({
  style,
}: {
  style: React.CSSProperties;
}) {
  const { logoRectangularURL } = useCustomize();
  if (logoRectangularURL == null) return null;
  const src = logoRectangularURL.includes("://")
    ? logoRectangularURL
    : join(appBasePath, logoRectangularURL);
  return <img src={src} style={{ ...style, maxWidth: "100%" }} />;
}
