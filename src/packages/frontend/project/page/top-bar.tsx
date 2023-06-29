/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Top tabs to switch editor + right hand side in a project.
*/

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import FileTabs from "./file-tabs";
import { TopTabBarActionsContainer } from "./top-tab-actions";

interface PTProps {
  project_id: string;
}

export function TopTabBar(props: PTProps) {
  const { project_id } = props;
  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  const activeTab = useTypedRedux({ project_id }, "active_project_tab");

  if (openFiles.size == 0) return <></>;

  return (
    <div
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
          <TopTabBarActionsContainer project_id={project_id} activeTab={activeTab} />
        </div>
      </div>
    </div>
  );
}
