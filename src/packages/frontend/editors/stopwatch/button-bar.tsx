/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Some buttons
*/
import { HistoryOutlined, RedoOutlined, UndoOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { useIntl } from "react-intl";

import { Rendered } from "@cocalc/frontend/app-framework";
import { Gap } from "@cocalc/frontend/components/gap";
import { labels } from "@cocalc/frontend/i18n";
import { TimeActions } from "./actions";

export function ButtonBar({
  actions,
}: {
  actions: TimeActions;
}): React.JSX.Element {
  const intl = useIntl();
  return (
    <div style={{ margin: "1px" }}>
      {timeTravelButton(actions, intl)}
      <Gap />
      {undoRedoGroup(actions)}
    </div>
  );
}

function timeTravelButton(actions: TimeActions, intl): Rendered {
  return (
    <Button
      key={"time-travel"}
      onClick={() => actions.time_travel()}
      icon={<HistoryOutlined />}
    >
      {intl.formatMessage(labels.timetravel)}
    </Button>
  );
}

function undoRedoGroup(actions: TimeActions): Rendered {
  return (
    <Button.Group key={"undo-group"}>
      <Button
        key={"undo"}
        title={"Undo last thing you did"}
        onClick={() => actions.undo()}
        icon={<UndoOutlined />}
      >
        Undo
      </Button>
      <Button
        key={"redo"}
        title={"Redo last thing you did"}
        onClick={() => actions.redo()}
        icon={<RedoOutlined />}
      >
        Redo
      </Button>
    </Button.Group>
  );
}
