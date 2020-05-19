/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { Space, Icon } from "../../../r_misc";
const { Button } = require("react-bootstrap");

export function PublicButton({ on_click }) {
  return (
    <span>
      <Space />
      <Button bsStyle="info" bsSize="xsmall" onClick={on_click}>
        <Icon name="bullhorn" /> <span className="hidden-xs">Public</span>
      </Button>
    </span>
  );
}
