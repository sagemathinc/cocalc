import { useCustomize } from "lib/customize";

export default function SquareLogo({ style }: { style: React.CSSProperties }) {
  const { logoSquareURL } = useCustomize();
  return <img src={logoSquareURL} style={style} />;
}
