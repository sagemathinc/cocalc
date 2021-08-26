import { useCustomize } from "lib/customize";
import { appBasePath } from "lib/base-path";
import { join } from "path";

export default function SquareLogo({ style }: { style: React.CSSProperties }) {
  const { logoSquareURL } = useCustomize();
  if (logoSquareURL == null) return null;
  const src = logoSquareURL.includes("://")
    ? logoSquareURL
    : join(appBasePath, logoSquareURL);
  return <img src={src} style={{ ...style, maxWidth: "100%" }} />;
}
