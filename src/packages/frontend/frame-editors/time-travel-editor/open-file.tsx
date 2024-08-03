/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import { Icon } from "../../components";

export function OpenFile({ actions }) {
  // TODO: make the icon be the right one for the given type of file
  return (
    <Button
      onClick={() => actions.open_file()}
      title={"Open the file whose history you are viewing"}
    >
      <Icon name="file-code" /> Open
    </Button>
  );
}
