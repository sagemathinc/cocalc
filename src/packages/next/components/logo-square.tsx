import { join } from "path";
import useCustomize from "lib/use-customize";
import { basePath } from "lib/base-path";

export default function SquareLogo({ style }: { style: React.CSSProperties }) {
  const { logoSquareURL } = useCustomize();
  if (logoSquareURL == null) return null;
  const src = logoSquareURL.includes("://")
    ? logoSquareURL
    : join(basePath, logoSquareURL);
  return <img src={src} style={{ ...style, maxWidth: "100%" }} />;
}
