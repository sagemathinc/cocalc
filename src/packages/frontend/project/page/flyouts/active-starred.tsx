/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Active files (editors) in the current project
// Note: there is no corresponding full page – instead, this is based on the "editor tabs"

import { Button } from "antd";

import { HelpIcon, Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import { FIX_BORDER } from "../common";
import { FLYOUT_PADDING } from "./consts";
import { GROUP_STYLE } from "./utils";

interface StarredInTabsProps {
  showStarred: boolean;
  showStarredTabs: boolean;
  setShowStarredTabs: (show: boolean) => void;
  starredRendered: React.JSX.Element[];
}

export function StarredInTabs({
  showStarred,
  setShowStarredTabs,
  showStarredTabs,
  starredRendered,
}: StarredInTabsProps) {
  if (!showStarred || starredRendered.length === 0) return null;
  return (
    <div
      style={{
        flex: "1 1 auto",
        display: "flex",
        flexDirection: "column",
        maxHeight: "30vh",
        borderTop: FIX_BORDER,
      }}
    >
      <div
        style={{
          flex: "1 0 auto",
          padding: FLYOUT_PADDING,
          ...GROUP_STYLE,
        }}
      >
        <Icon name="star-filled" style={{ color: COLORS.STAR }} /> Starred{" "}
        <HelpIcon title={"Starred files are like bookmarks."}>
          These files are not opened, but you can quickly access them.
          <br />
          Use the <Icon
            name="star-filled"
            style={{ color: COLORS.STAR }}
          />{" "}
          icon to star/unstar a file.
          <br />
          The star above the list of active files toggles if starred files are
          shown.
        </HelpIcon>
        <Button
          size="small"
          style={{ float: "right", color: COLORS.FILE_EXT }}
          onClick={() => setShowStarredTabs(!showStarredTabs)}
        >
          {showStarredTabs ? (
            <>
              <Icon name="eye-slash" /> Hide
            </>
          ) : (
            <>
              <Icon name="eye" /> Show
            </>
          )}
        </Button>
      </div>
      {showStarredTabs ? (
        <div style={{ flex: "1 1 auto", overflowY: "auto" }}>
          {starredRendered}
        </div>
      ) : null}
    </div>
  );
}
