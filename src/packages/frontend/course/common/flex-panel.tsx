/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { ReactNode } from "react";

export function FlexPanel({
  header,
  children,
}: {
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={"panel panel-default smc-vfill"}>
      <div className="panel-heading">{header}</div>
      <div className="panel-body smc-vfill">{children}</div>
    </div>
  );
}
