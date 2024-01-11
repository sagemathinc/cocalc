/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Group headers of active files (editors) in the current project

import { Button, Flex, Space } from "antd";

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { FIXED_PROJECT_TABS } from "@cocalc/frontend/project/page/file-tab";
import { ActiveFlyoutToggleButton } from "../active-flyout-toggle-button";

export function ActiveHeader() {
  const { flipTabs, project_id } = useProjectContext();
  const [flipVal, setFlipVal] = flipTabs;
  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  const disabled = openFiles.size <= 1;

  function renderScroll() {
    return (
      <Space.Compact
        style={{
          margin: "10px",
          flex: "0",
        }}
      >
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

  function renderTitle() {
    return (
      <Flex style={{ flex: "1", fontWeight: "bold" }} align="center">
        <ActiveFlyoutToggleButton /> {FIXED_PROJECT_TABS.active.flyoutTitle}
      </Flex>
    );
  }

  return (
    <Flex flex={1} justify="space-between" align="center">
      {renderTitle()} {renderScroll()}
    </Flex>
  );
}
