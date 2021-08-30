import { join } from "path";
import useCustomize from "lib/use-customize";
import basePath from "lib/base-path";

export default function RectangularLogo({
  style,
}: {
  style: React.CSSProperties;
}) {
  const { logoRectangularURL } = useCustomize();
  if (logoRectangularURL == null) return null;
  const src = logoRectangularURL.includes("://")
    ? logoRectangularURL
    : join(basePath, logoRectangularURL);
  return <img src={src} style={{ ...style, maxWidth: "100%" }} />;
}
