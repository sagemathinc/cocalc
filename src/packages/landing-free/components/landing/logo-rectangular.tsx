import customize from "lib/customize";

export default function RectangularLogo({ style }) {
  return <img src={customize.logoRectangularURL} style={style} />;
}
