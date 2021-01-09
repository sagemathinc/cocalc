/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../app-framework";
import { macros } from "../../../jquery-plugins/math-katex";
import { renderToString } from "katex";
import { startswith } from "smc-util/misc";
import * as LRU from "lru-cache";

const cache = new LRU({ max: 300 });

interface Props {
  value: string;
}

export const SlateMath: React.FC<Props> = React.memo(({ value }) => {
  let { html, err, displayMode } = (cache.get(value) ?? {}) as any;
  if (displayMode == null) {
    displayMode = startswith(value, "$$");
    const i = displayMode ? 2 : 1;
    try {
      html = renderToString(value.slice(i, value.length - i), {
        displayMode,
        macros,
      });
    } catch (error) {
      err = error.toString();
    }
    cache.set(value, { html, err, displayMode });
  }
  if (err) {
    return <pre>{err.toString()}</pre>;
  } else {
    return <span dangerouslySetInnerHTML={{ __html: html }}></span>;
  }
});
