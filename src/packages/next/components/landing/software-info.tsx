/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// A small banner on top of the list of packages, surfacing information about the executable.

import { Tabs } from "antd";
const { TabPane } = Tabs;

export type ExecInfo = { [name: string]: string | undefined };

export const VERSION_STYLE: React.CSSProperties = {
  maxHeight: "8em",
  backgroundColor: "rgba(150, 150, 150, 0.1)",
  fontSize: "12px",
  padding: "10px",
  overflow: "auto",
  marginBottom: "20px",
} as const;

export const VERSION_STYLE_PARENT: React.CSSProperties = {
  clear: "both",
} as const;

export default function SoftwareInfo({
  info,
  showHeader = true,
}: {
  info?: ExecInfo;
  showHeader?: boolean;
}) {
  if (info == null) return null;

  function renderInfoTabs() {
    if (info == null) return null;
    return Object.entries(info).map(([k, v]) => {
      if (v == null) return null;
      return (
        <TabPane tab={k} key={k}>
          <div style={VERSION_STYLE}>
            <pre style={VERSION_STYLE_PARENT}>{v}</pre>
          </div>
        </TabPane>
      );
    });
  }

  function renderInfo() {
    return <Tabs>{renderInfoTabs()}</Tabs>;
  }

  return (
    <div style={VERSION_STYLE_PARENT}>
      {showHeader && <h4>Executable information</h4>}
      {renderInfo()}
    </div>
  );
}
