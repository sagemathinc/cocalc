/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { List } from "immutable";
//declare const $: any;
const $ = require("jquery");
import { React, useState } from "smc-webapp/app-framework";
import { is_array } from "smc-util/misc";
import { javascript_eval } from "./javascript-eval";
import { STDERR_STYLE } from "./style";

interface JavascriptProps {
  value: string | List<string>;
}

// ATTN: better don't memoize this, since JS code evaluation happens when this is mounted
export const Javascript: React.FC<JavascriptProps> = (
  props: JavascriptProps
) => {
  const { value } = props;

  // ATTN don't make this an actual ref to the div. It's easy to break everything!
  // instead (before this was turned into an FC) keep the node undefined...
  // TODO here is certainly room for improvement.
  //const node = useRef<HTMLDivElement>(null);
  const node: HTMLElement | undefined = undefined;

  const [errors, set_errors] = useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (value == null) {
      return;
    }
    //const element = $(node.current);
    const element = $(node);
    element.empty();
    let blocks: string[];
    if (typeof value == "string") {
      blocks = [value];
    } else {
      const x = value.toJS();
      if (!is_array(x)) {
        console.warn("not evaluating javascript since wrong type:", x);
        return;
      } else {
        blocks = x;
      }
    }
    let block: string;
    let errors: string = "";
    for (block of blocks) {
      errors += javascript_eval(block, element);
      if (errors.length > 0) {
        set_errors(errors);
      }
    }
  }, [value]);

  if (errors) {
    // This conflicts with official Jupyter
    return (
      <div style={STDERR_STYLE}>
        <span>
          {errors}
          <br />
          See your browser Javascript console for more details.
        </span>
      </div>
    );
  } else {
    return <div /* ref={node} */ />;
  }
};
