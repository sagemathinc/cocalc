/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { COLORS } from "smc-util/theme";
import * as misc from "smc-util/misc";

interface Props {
  error?: string | object;
  error_component?: JSX.Element | JSX.Element[];
  title?: string;
  style?: React.CSSProperties;
}

export const ErrorDisplay: React.FC<Props> = (props: Props) => {
  const style = {
    ...props.style,
    ...{ backgroundColor: COLORS.ATND_BG_RED_L },
  };

  const title = props.title ?? "Error";
  const { error, error_component } = props;

  function description() {
    if (error != undefined) {
      if (typeof error === "string") {
        return error;
      } else {
        return misc.to_json(error);
      }
    } else {
      return error_component;
    }
  }

  return (
    <div style={style}>
      <p style={{ fontWeight: "bold" }}>{title}</p>
      <p>{description()}</p>
    </div>
  );
};
