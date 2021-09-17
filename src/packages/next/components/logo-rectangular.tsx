import useCustomize from "lib/use-customize";
import logo from "public/cocalc-icon.svg";
import Image from "components/landing/image";

const alt = "Rectangular CoCalc Logo";
export default function RectangularLogo({
  style,
}: {
  style: React.CSSProperties;
}) {
  const { logoRectangularURL } = useCustomize();
  if (!logoRectangularURL) {
    return (
      <Image alt={alt} src={logo} style={{ ...style, maxWidth: "100%" }} />
    );
  }
  return (
    <img
      alt={alt}
      src={logoRectangularURL}
      style={{ ...style, maxWidth: "100%" }}
    />
  );
}
