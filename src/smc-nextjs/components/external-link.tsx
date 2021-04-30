/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";

export default function ExternalLink(props) {
  return (
    <a {...props} target={"_blank"} rel={"noopener"}>
      {props.children}
    </a>
  );
}
