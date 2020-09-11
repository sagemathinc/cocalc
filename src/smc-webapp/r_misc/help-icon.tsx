/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Display a ? "help" icon, which -- when clicked -- shows a help tip
*/

import { Popover } from "antd";
import { React, useState } from "../app-framework";
import { Icon } from "./icon";

interface Props {
  title;
  children;
}

export const HelpIcon: React.FC<Props> = ({ title, children }) => {
  const [visible, set_visible] = useState<boolean>(false);

  return (
    <Popover
      content={children}
      title={
        <>
          {title}
          <a style={{ float: "right" }} onClick={() => set_visible(false)}>
            Close
          </a>
        </>
      }
      trigger="click"
      visible={visible}
      onVisibleChange={set_visible}
    >
      <Icon style={{ color: "#5bc0de" }} name="question-circle" />
    </Popover>
  );
};
