/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { React, useTypedRedux } from "../app-framework";
import { APP_ICON } from "../art";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { A } from "@cocalc/frontend/components/A";
import { Tooltip } from "antd";

const STYLE: React.CSSProperties = {
  display: "inline-block",
  backgroundSize: "contain",
  backgroundRepeat: "no-repeat",
  position: "relative",
} as const;

interface Props {
  size: number;
}

export const AppLogo: React.FC<Props> = React.memo((props: Props) => {
  const { size } = props;
  const marginVal = Math.max(1, Math.round(size / 20));
  const margin = `${marginVal}px`;
  const dimension = `${size - 2 * marginVal}px`;

  const logo_square: string | undefined = useTypedRedux(
    "customize",
    "logo_square",
  );

  const backgroundImage = `url('${logo_square ? logo_square : APP_ICON}')`;

  return (
    <A
      href={appBasePath}
      aria-label="CoCalc homepage"
      style={{
        height: dimension,
        width: dimension,
        margin: margin,
        display: "inline-block",
      }}
    >
      <Tooltip
        title="Open the main website in a new tab."
        mouseEnterDelay={1}
        mouseLeaveDelay={0}
        placement="right"
      >
        <div
          style={{
            ...STYLE,
            height: dimension,
            width: dimension,
            backgroundImage,
          }}
        ></div>
      </Tooltip>
    </A>
  );
});
