/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { debounce } from "lodash";

import { CSS, useEffect, useState } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import * as LS from "@cocalc/frontend/misc/local-storage-typed";
import { FIXED_PROJECT_TABS, FixedTab } from "../file-tab";
import { FIX_BORDER } from "../page";
import { FIXED_TABS_BG_COLOR } from "../tabs";
import { LSFlyout, lsKey, storeFlyoutState } from "./state";

export function FlyoutBody({
  flyout,
  project_id,
  flyoutWidth,
}: {
  project_id: string;
  flyout: FixedTab;
  flyoutWidth: number;
}) {
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
    { leading: false, trailing: true }
  );

  // use this *once* around a vertically scollable content div in the component, e.g. results in a search
  function wrap(content, style: CSS = {}) {
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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "5px 0 0 5px",
        margin: 0,
        marginRight: "0",
        borderRight: FIX_BORDER,
        width: flyoutWidth,
        height: "100%",
        backgroundColor: FIXED_TABS_BG_COLOR,
        overflowY: "hidden",
        overflowX: "hidden",
      }}
    >
      {Body == null ? (
        <Loading />
      ) : (
        <Body project_id={project_id} wrap={wrap} />
      )}
    </div>
  );
}
