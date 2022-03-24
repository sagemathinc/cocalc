import useCustomize from "lib/use-customize";
import logo from "public/cocalc-icon.svg";
import Image from "components/landing/image";

const alt = "Square CoCalc Logo";
export default function SquareLogo({
  style,
  priority,
}: {
  style: React.CSSProperties;
  priority?: boolean;
}) {
  const { logoSquareURL } = useCustomize();
  if (!logoSquareURL) {
    return (
      <Image
        alt={alt}
        src={logo}
        style={{ ...style, maxWidth: "100%" }}
        priority={priority}
      />
    );
  }

  return (
    <img alt={alt} src={logoSquareURL} style={{ ...style, maxWidth: "100%" }} />
  );
}
