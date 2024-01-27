/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Radio } from "antd";

import {
  useActions,
  useEffect,
  useState,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { FIXED_PROJECT_TABS } from "../file-tab";
import { FlyoutLogMode, getFlyoutLogMode, isFlyoutLogMode } from "./state";

export function LogHeader(): JSX.Element {
  const { project_id } = useProjectContext();

  const [mode, setModeState] = useState<FlyoutLogMode>(
    getFlyoutLogMode(project_id),
  );

  function setMode(mode: FlyoutLogMode) {
    if (isFlyoutLogMode(mode)) {
      setModeState(mode);
    } else {
      console.warn(`Invalid flyout log mode: ${mode}`);
    }
  }

  // any mode change triggers an action to compute it
  const actions = useActions({ project_id });
  useEffect(() => actions?.setFlyoutLogMode(mode), [mode]);

  function renderToggle() {
    return (
      <Radio.Group
        value={mode}
        onChange={(val) => setMode(val.target.value)}
        size="small"
      >
        <Radio.Button value="files">Files</Radio.Button>
        <Radio.Button value="history">Activity</Radio.Button>
      </Radio.Group>
    );
  }

  return (
    <div style={{ flex: 1, fontWeight: "bold" }}>
      <Icon name={FIXED_PROJECT_TABS.log.icon} /> Recent {renderToggle()}
    </div>
  );
}
