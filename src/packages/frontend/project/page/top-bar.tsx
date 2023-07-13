/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Top tabs to switch editor + right hand side in a project.
*/

import { useRef, useTypedRedux } from "@cocalc/frontend/app-framework";
import { useMeasureDimensions } from "@cocalc/frontend/hooks";
import { useProjectContext } from "../context";
import FileTabs from "./file-tabs";
import { TopTabBarActionsContainer } from "./top-tab-actions";

export function TopTabBar() {
  const { project_id } = useProjectContext();

  const tabContainerRef = useRef<HTMLDivElement>(null);
  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  const activeTab = useTypedRedux({ project_id }, "active_project_tab");

  const { width: tabWidth } = useMeasureDimensions(tabContainerRef);

  if (openFiles.size == 0) return <></>;

  return (
    <div
      ref={tabContainerRef}
      className="smc-file-tabs"
      style={{
        width: "100%",
        height: "40px",
        padding: "2.5px",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex" }}>
        <div
          style={{
            display: "flex",
            overflow: "hidden",
            flex: 1,
          }}
        >
          <FileTabs
            openFiles={openFiles}
            project_id={project_id}
            activeTab={activeTab}
          />
        </div>
        <div
          style={{
            display: "flex",
            flex: "0 0 auto",
          }}
        >
          <TopTabBarActionsContainer fullTabWidth={tabWidth} />
        </div>
      </div>
    </div>
  );
}
