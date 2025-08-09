/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { debounce } from "lodash";
import {
  CSS,
  redux,
  useEffect,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import * as LS from "@cocalc/frontend/misc/local-storage-typed";
import { useProjectContext } from "../../context";
import { FIX_BORDER } from "../common";
import { FIXED_PROJECT_TABS, FixedTab } from "../file-tab";
import { FIXED_TABS_BG_COLOR } from "../activity-bar-tabs";
import { FLYOUT_PADDING } from "./consts";
import { LSFlyout, lsKey, storeFlyoutState } from "./state";

interface FlyoutBodyProps {
  flyout: FixedTab;
  flyoutWidth: number;
}

export function FlyoutBody({ flyout, flyoutWidth }: FlyoutBodyProps) {
  const { project_id } = useProjectContext();
  const hideActionButtons = useTypedRedux({ project_id }, "hideActionButtons");

  // No "Ref", because otherwise we don't trigger the useEffect below
  const [bodyDiv, setBodyDiv] = useState<HTMLDivElement | null>(null);
  const Body = FIXED_PROJECT_TABS[flyout].flyout;

  useEffect(() => {
    const state = LS.get<LSFlyout>(lsKey(project_id));
    const scroll = state?.scroll?.[flyout];
    if (!bodyDiv) return;
    if (scroll && !isNaN(scroll)) {
      bodyDiv.scrollTop = scroll;
    } else {
      bodyDiv.scrollTop = 0;
    }
  }, [project_id, flyout, bodyDiv]);

  const onScroll = debounce(
    () => {
      if (bodyDiv) {
        const scroll = bodyDiv.scrollTop;
        storeFlyoutState(project_id, flyout, { scroll });
      }
    },
    1000,
    { leading: false, trailing: true },
  );

  // use this *once* around a vertically scollable content div in the component, e.g. results in a search.
  // note: this won't work if the initial content is something else, e.g. a loading indicator.
  function wrap(content: React.ReactNode, style: CSS = {}) {
    return (
      <div
        ref={setBodyDiv}
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

  const padding = hideActionButtons
    ? `${FLYOUT_PADDING} 0 0 0`
    : `${FLYOUT_PADDING} 0 0 ${FLYOUT_PADDING}`;

  const style: CSS = {
    display: "flex",
    flexDirection: "column",
    padding,
    margin: 0,
    marginRight: "0",
    borderRight: FIX_BORDER,
    width: flyoutWidth,
    height: "100%",
    backgroundColor: FIXED_TABS_BG_COLOR,
    overflowY: "hidden",
    overflowX: "hidden",
  };

  return (
    <div
      style={style}
      onFocus={() => {
        // Remove any active key handler that is next to this side chat.
        // E.g, this is critical for task lists...
        redux.getActions("page").erase_active_key_handler();
      }}
    >
      {Body == null ? (
        <div style={{ textAlign: "center", marginTop: "50px" }}>
          <Loading />
        </div>
      ) : (
        <Body project_id={project_id} wrap={wrap} flyoutWidth={flyoutWidth} />
      )}
    </div>
  );
}
