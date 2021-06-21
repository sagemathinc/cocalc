/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "smc-webapp/app-framework";
import { Map } from "immutable";
import { INPUT_STYLE, STDOUT_STYLE } from "./style";

interface InputDoneProps {
  message: Map<string, any>;
}

export const InputDone: React.FC<InputDoneProps> = React.memo(
  (props: InputDoneProps) => {
    const { message } = props;

    const prompt: string = message.getIn(["opts", "prompt"], "");
    const value: string = message.get("value", "");
    const type = message.getIn(["opts", "password"]) ? "password" : "text";

    return (
      <div style={STDOUT_STYLE}>
        {prompt}
        <input
          style={INPUT_STYLE}
          type={type}
          size={Math.max(47, value.length + 10)}
          readOnly={true}
          value={value}
        />
      </div>
    );
  }
);
