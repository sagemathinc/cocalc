/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Group headers of active files (editors) in the current project

import { Button, Space } from "antd";

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { useAppContext } from "@cocalc/frontend/app/context";
import { Icon } from "@cocalc/frontend/components";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { FIXED_PROJECT_TABS } from "@cocalc/frontend/project/page/file-tab";

export function ActiveHeader() {
  const { formatIntl } = useAppContext();
  const { flipTabs, project_id } = useProjectContext();
  const [flipVal, setFlipVal] = flipTabs;
  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  const disabled = openFiles.size <= 1;

  function renderScroll() {
    return (
      <Space.Compact style={{ float: "right", marginRight: "10px" }}>
        <Button
          size="small"
          onClick={() => setFlipVal(flipVal + 1)}
          icon={<Icon name="arrow-down" />}
          title={"Flip to the next open file"}
          disabled={disabled}
        />
        <Button
          size="small"
          onClick={() => setFlipVal(flipVal - 1)}
          icon={<Icon name="arrow-up" />}
          title={"Flip to the previous open file"}
          disabled={disabled}
        />
      </Space.Compact>
    );
  }

  return (
    <div style={{ flex: 1, fontWeight: "bold" }}>
      <Icon name={FIXED_PROJECT_TABS.active.icon} />{" "}
      {formatIntl(FIXED_PROJECT_TABS.active.label)} {renderScroll()}
    </div>
  );
}
