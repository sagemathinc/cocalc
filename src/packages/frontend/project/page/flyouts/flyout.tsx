/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Tooltip } from "antd";
import { debounce } from "lodash";

import {
  CSS,
  useActions,
  useEffect,
  useRef,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import * as LS from "@cocalc/frontend/misc/local-storage-typed";
import { capitalize } from "@cocalc/util/misc";
import { PathNavigator } from "../../explorer/path-navigator";
import { FIXED_PROJECT_TABS, FixedTab } from "../file-tab";
import { FIX_BORDER } from "../page";
import { FIXED_TABS_BG_COLOR } from "../tabs";
import { FLYOUT_WIDTH_PX } from "./consts";

export function FlyoutHeader({
  flyout,
  project_id,
  narrowerPX = 0,
}: {
  project_id: string;
  flyout: FixedTab;
  narrowerPX: number;
}) {
  const actions = useActions({ project_id });

  function renderDefaultTitle() {
    const title = FIXED_PROJECT_TABS[flyout].flyoutTitle;
    if (title != null) {
      return title;
    } else {
      return capitalize(flyout);
    }
  }

  function renderIcon() {
    const iconName = FIXED_PROJECT_TABS[flyout].icon;
    if (iconName != null) {
      return <Icon name={iconName} />;
    } else {
      return null;
    }
  }

  function closeBtn() {
    return (
      <Tooltip title="Hide this action panel" placement="bottom">
        <Icon
          name="vertical-right-outlined"
          className="cc-project-fixedtab-close"
          style={{
            flex: "0",
            float: "right",
            padding: "5px",
            borderRadius: "2px",
            margin: "0",
          }}
          onClick={() => actions?.toggleFlyout(flyout)}
        />
      </Tooltip>
    );
  }

  function renderTitle() {
    switch (flyout) {
      case "files":
        return (
          <div style={{ display: "flex", flexDirection: "row" }}>
            <PathNavigator
              style={{ flex: 1 }}
              mode={"flyout"}
              project_id={project_id}
              className={"cc-project-flyout-path-navigator"}
            />
            {closeBtn()}
          </div>
        );
      default:
        return (
          <>
            {renderIcon()} {renderDefaultTitle()}
            {closeBtn()}
          </>
        );
    }
  }

  return (
    <div
      style={{
        borderRight: FIX_BORDER,
        borderTop: FIX_BORDER,
        borderLeft: FIX_BORDER,
        background: FIXED_TABS_BG_COLOR,
        borderRadius: "5px 5px 0 0",
        width: `${FLYOUT_WIDTH_PX - narrowerPX}px`,
        paddingLeft: "10px",
        paddingTop: "10px",
        fontSize: "1.2em",
        marginRight: "5px",
      }}
    >
      {renderTitle()}
    </div>
  );
}

export function Flyout({
  flyout,
  project_id,
}: {
  project_id: string;
  flyout: string;
}) {
  const refDiv = useRef<HTMLDivElement>(null);

  const lsKey = `flyout_${project_id}_${flyout}`;

  useEffect(() => {
    const storedScroll = LS.get<number>(lsKey);
    const div = refDiv.current;
    if (!div) return;
    if (storedScroll && !isNaN(storedScroll)) {
      div.scrollTop = storedScroll;
    } else {
      div.scrollTop = 0;
    }
  }, [project_id, flyout]);

  const onScroll = debounce(
    () => {
      const div = refDiv.current;
      if (div) {
        const val = div.scrollTop;
        console.log("scroll", val);
        if (val > 0) {
          LS.set(lsKey, val);
        } else {
          LS.del(lsKey);
        }
      }
    },
    100,
    { leading: true, trailing: true }
  );

  function wrap(content, style: CSS = {}) {
    return (
      <div
        ref={refDiv}
        onScroll={onScroll}
        style={{
          height: "100%",
          overflowY: "auto",
          ...style,
        }}
      >
        {content}
      </div>
    );
  }

  function renderBody(): JSX.Element {
    const Body = FIXED_PROJECT_TABS[flyout].flyout;

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "5px 0 0 5px",
          margin: 0,
          borderRight: FIX_BORDER,
          width: FLYOUT_WIDTH_PX,
          height: "100%",
          backgroundColor: FIXED_TABS_BG_COLOR,
          overflowY: "hidden",
          overflowX: "hidden",
        }}
      >
        {Body == null ? (
          <>Not available yet</>
        ) : (
          <Body project_id={project_id} wrap={wrap} />
        )}
      </div>
    );
  }

  return renderBody();
}
