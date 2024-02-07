/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// import { Tooltip } from "antd";

import { React, useTypedRedux } from "@cocalc/frontend/app-framework";
import { APP_ICON } from "@cocalc/frontend/art";
// import { A } from "@cocalc/frontend/components/A";
// import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { NavTab } from "./nav-tab";

const STYLE: React.CSSProperties = {
  display: "inline-block",
  backgroundSize: "contain",
  backgroundRepeat: "no-repeat",
  position: "relative",
} as const;

interface Props {
  size: number;
  active_top_tab?: string;
}

export const AppLogo: React.FC<Props> = React.memo((props: Props) => {
  const { size, active_top_tab } = props;
  const marginVal = Math.max(1, Math.round(size / 20));
  const margin = `${marginVal}px`;
  const dimension = `${size - 2 * marginVal}px`;

  const logo_square: string | undefined = useTypedRedux(
    "customize",
    "logo_square",
  );

  const backgroundImage = `url('${logo_square ? logo_square : APP_ICON}')`;

  return (
    <NavTab
      name={"home"}
      tooltip="Open the main overview page."
      label=""
      active_top_tab={active_top_tab}
      style={{
        margin: margin,
        ...STYLE,
        height: dimension,
        width: dimension,
        backgroundImage,
      }}
    />
  );

  // return (
  //   <div
  //     onClick={() => {

  //     }}
  //     style={{
  //       height: dimension,
  //       width: dimension,
  //       margin: margin,
  //       display: "inline-block",
  //     }}
  //   >
  //     <Tooltip
  //       title="Open the main website in a new tab."
  //       mouseEnterDelay={1}
  //       mouseLeaveDelay={0}
  //       placement="right"
  //     >
  //       <div
  //         style={{
  //           ...STYLE,
  //           height: dimension,
  //           width: dimension,
  //           backgroundImage,
  //         }}
  //       ></div>
  //     </Tooltip>
  //   </div>
  // );
});
