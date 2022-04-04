/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Components for rendering input and output prompts.
*/

import React from "react";
import { INPUT_STYLE, InputPromptProps } from "./base";

export const InputPrompt: React.FC<InputPromptProps> = (props) => {
  if (props.type !== "code") {
    return <div style={{ ...INPUT_STYLE, ...props.style }} />;
  }
  return (
    <div style={{ ...INPUT_STYLE, ...props.style }}>
      In [{props.exec_count ?? " "}]:
    </div>
  );
};
