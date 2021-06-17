/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button } from "react-bootstrap";
import { Icon } from "../../r_misc/icon";
import { React } from "smc-webapp/app-framework";
import { Map } from "immutable";
import { JupyterActions } from "../actions";
import { all_fields_equal } from "smc-util/misc";

interface MoreOutputProps {
  message: Map<string, any>;
  id: string;
  actions?: JupyterActions; // if not set, then can't get more output (button disabled)
}

function should_memoize(prev, next) {
  return all_fields_equal(prev, next, ["message", "id"]);
}

export const MoreOutput: React.FC<MoreOutputProps> = React.memo(
  (props: MoreOutputProps) => {
    const { id, message, actions } = props;

    function show_more_output(): void {
      actions?.fetch_more_output(id);
    }

    if (actions == null || message.get("expired")) {
      return (
        <Button bsStyle="info" disabled>
          <Icon name="eye-slash" /> Additional output not available
        </Button>
      );
    } else {
      return (
        <Button onClick={show_more_output} bsStyle="info">
          <Icon name="eye" /> Fetch additional output...
        </Button>
      );
    }
  },
  should_memoize
);
