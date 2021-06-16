/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "smc-webapp/app-framework";
import { List } from "immutable";

interface UntrustedJavascriptProps {
  // TODO: not used now; however, we may show the untrusted javascript at some point.
  value?: string | List<string>;
}

export const UntrustedJavascript: React.FC<UntrustedJavascriptProps> = () => {
  return (
    <span style={{ color: "#888" }}>(not running untrusted Javascript)</span>
  );
};
