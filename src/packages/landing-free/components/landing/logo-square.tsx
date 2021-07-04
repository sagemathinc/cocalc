import customize from "lib/customize";

export default function SquareLogo({ style }) {
  return <img src={customize.logoSquareURL} style={style} />;
}
