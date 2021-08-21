import { useCustomize } from "lib/customize";

export default function RectangularLogo({
  style,
}: {
  style: React.CSSProperties;
}) {
  const { logoRectangularURL } = useCustomize();
  return <img src={logoRectangularURL} style={style} />;
}
