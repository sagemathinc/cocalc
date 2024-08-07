/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";
import { Map } from "immutable";
import { STDERR_STYLE } from "./style";

interface NotImplementedProps {
  message: Map<string, any>;
}

function should_memoize(prev, next) {
  return prev.message.equals(next.message);
}

export const NotImplemented: React.FC<NotImplementedProps> = React.memo(
  (props: NotImplementedProps) => {
    return (
      <pre style={STDERR_STYLE}>{JSON.stringify(props.message.toJS())}</pre>
    );
  },
  should_memoize
);
