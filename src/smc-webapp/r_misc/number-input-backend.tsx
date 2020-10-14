/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";

interface Props {
  number: number;
  unit?: string;
}

export const NumberInput: React.FC<Props> = (props: Props) => {
  return (
    <span>
      {props.number}
      {props.unit}
    </span>
  );
};
