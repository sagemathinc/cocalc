import { React, useRedux } from "../app-framework";
import { APP_ICON } from "../art";

const STYLE: React.CSSProperties = {
  display: "inline-block",
  backgroundSize: "contain",
  backgroundRepeat: "no-repeat",
  height: "32px",
  width: "32px",
  position: "relative",
  margin: "2px",
} as const;

export const AppLogo: React.FC = React.memo(() => {
  const logo_square: string | undefined = useRedux([
    "customize",
    "logo_square",
  ]);

  const backgroundImage = `url('${logo_square ? logo_square : APP_ICON}')`;

  return (
    <div
      style={{
        ...STYLE,
        backgroundImage,
      }}
    ></div>
  );
});
