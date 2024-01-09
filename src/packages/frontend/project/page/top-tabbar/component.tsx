/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
top right hand side in a project.
*/

import { throttle } from "lodash";

import {
  useLayoutEffect,
  useRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { useAppState } from "@cocalc/frontend/app/context";
import { useMeasureDimensions } from "@cocalc/frontend/hooks";
import { tab_to_path } from "@cocalc/util/misc";
import { useProjectContext } from "../../context";
import { TopTabBarActions } from "./tabbar";

interface TTBAProps {
  fullTabWidth: number;
}

export function TopTabBarActionsContainer(props: Readonly<TTBAProps>) {
  const { fullTabWidth } = props;
  const topRightRef = useRef<HTMLDivElement>(null);
  const actionstRef = useRef<HTMLDivElement>(null);
  const { active_project_tab: activeTab } = useProjectContext();
  const { pageWidthPx } = useAppState();
  const { width: topRightWidth } = useMeasureDimensions(topRightRef);
  const { width: actionsWidth } = useMeasureDimensions(actionstRef);

  // keep track of the breakPoint width to avoid flickering
  const [compact, setCompact] = useState<boolean>(isCompact());
  const refCompact = useRef<boolean>(compact);
  const breakPoint = useRef<number>(0);

  function isCompact() {
    if (pageWidthPx < 500) return true;
    if (fullTabWidth < 500) return true;
    if (fullTabWidth / 3 < topRightWidth) return true;
    return false;
  }

  const calcCompact = throttle(
    () => {
      if (fullTabWidth === 0) return; // no data
      if (topRightWidth === 0) return; // no data
      if (pageWidthPx === 0) return; // no data

      // uses isCompact() and the breakPoint to avoid flickering
      if (refCompact.current) {
        if (!isCompact() && breakPoint.current < fullTabWidth - 10) {
          setCompact(false);
          refCompact.current = false;
          breakPoint.current = fullTabWidth;
        }
      } else {
        if (
          isCompact() &&
          (breakPoint.current === 0 || breakPoint.current > fullTabWidth + 10)
        ) {
          setCompact(true);
          refCompact.current = true;
          breakPoint.current = fullTabWidth;
        }
      }
    },
    50,
    { leading: false, trailing: true },
  );

  useLayoutEffect(() => {
    calcCompact();
  }, [pageWidthPx, fullTabWidth, topRightWidth]);

  // console.log({
  //   compact,
  //   isCompact: isCompact(),
  //   fullTabWidth,
  //   breakPoint: breakPoint.current,
  //   topRightWidth,
  // });

  if (activeTab == null || !activeTab.startsWith("editor-")) return null;
  const path = tab_to_path(activeTab);
  if (path == null) return null;

  return (
    <div ref={topRightRef} className={"cc-project-tabs-top-right"}>
      <div className={"cc-project-tabs-top-right-slant"}></div>
      <div ref={actionstRef} className={"cc-project-tabs-top-right-actions"}>
        <TopTabBarActions path={path} compact={compact} width={actionsWidth} />
      </div>
    </div>
  );
}
