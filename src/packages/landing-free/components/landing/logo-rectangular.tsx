import { logoRectangularURL } from "lib/customize";

export default function RectangularLogo({
  style,
}: {
  style: React.CSSProperties;
}) {
  return <img src={logoRectangularURL} style={style} />;
}
