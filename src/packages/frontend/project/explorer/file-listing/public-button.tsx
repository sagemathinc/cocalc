/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button } from "antd";

import { Icon, VisibleLG } from "@cocalc/frontend/components";

export function PublicButton({ on_click }) {
  return (
    <Button size="small" onClick={on_click}>
      <Icon name="bullhorn" /> <VisibleLG>Published</VisibleLG>
    </Button>
  );
}
