import { React, useTypedRedux } from "../app-framework";
import { APP_ICON } from "../art";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { A } from "@cocalc/frontend/components/A";
import { Tooltip } from "antd";

const STYLE: React.CSSProperties = {
  display: "inline-block",
  backgroundSize: "contain",
  backgroundRepeat: "no-repeat",
  height: "32px",
  width: "32px",
  position: "relative",
} as const;

export const AppLogo: React.FC = React.memo(() => {
  const logo_square: string | undefined = useTypedRedux(
    "customize",
    "logo_square"
  );

  const backgroundImage = `url('${logo_square ? logo_square : APP_ICON}')`;

  return (
    <A
      href={appBasePath}
      style={{
        height: "32px",
        width: "32px",
        margin: "2px",
        display: "inline-block",
      }}
    >
      <Tooltip title="Open the main website in a new tab." mouseEnterDelay={1} mouseLeaveDelay={0} placement="right">
        <div
          onClick={() => {
            console.log("click");
          }}
          style={{
            ...STYLE,
            backgroundImage,
          }}
        ></div>
      </Tooltip>
    </A>
  );
});
