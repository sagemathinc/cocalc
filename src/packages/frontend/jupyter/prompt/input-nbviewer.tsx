/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Components for rendering input and output prompts.
*/

import React from "react";
import { INPUT_STYLE, InputPromptProps } from "./base";
import { HiddenXS } from "@cocalc/frontend/components/hidden-visible";

export const InputPrompt: React.FC<InputPromptProps> = (props) => {
  if (props.type !== "code") {
    return <div style={{ ...INPUT_STYLE, ...props.style }} />;
  }
  return (
    <HiddenXS>
      <div style={{ ...INPUT_STYLE, ...props.style }}>
        In [{props.exec_count ?? " "}]:
      </div>
    </HiddenXS>
  );
};
