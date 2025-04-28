/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { List } from "immutable";
import $ from "jquery";
import { useEffect, useRef, useState } from "react";
import { is_array } from "@cocalc/util/misc";
import { javascript_eval } from "./javascript-eval";
import ShowError from "@cocalc/frontend/components/error";

interface JavascriptProps {
  value: string | List<string>;
}

// ATTN: better don't memoize this, since JS code evaluation happens when this is mounted
export const Javascript: React.FC<JavascriptProps> = (
  props: JavascriptProps,
) => {
  const { value } = props;

  const node = useRef<HTMLDivElement>(null);

  const [errors, set_errors] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (value == null || node.current == null) {
      return;
    }
    const element = $(node.current);
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
    const doEval = () => {
      for (block of blocks) {
        errors += javascript_eval(block, element);
        if (errors.length > 0) {
          set_errors(errors);
        }
      }
    };
    // javascript maybe be run on something that gets rendered in the DOM, so give that
    // a chance to happen.  Bokeh randomly breaks without this.  **TODO: Obviously, this sucks.**
    setTimeout(doEval, 300);
  }, [value]);

  if (errors) {
    return <ShowError error={errors} style={{ margin: "10px 0" }} />;
  } else {
    return <div ref={node} />;
  }
};
