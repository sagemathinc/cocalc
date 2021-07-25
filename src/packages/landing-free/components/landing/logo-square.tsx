import { logoSquareURL } from "lib/customize";

export default function SquareLogo({ style }: { style: React.CSSProperties }) {
  return <img src={logoSquareURL} style={style} />;
}
