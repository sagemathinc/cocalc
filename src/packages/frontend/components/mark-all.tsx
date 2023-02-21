/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { capitalize } from "@cocalc/util/misc";
import { Button } from "antd";
import { SizeType } from "antd/lib/config-provider/SizeContext";
import React from "react";
import { Icon } from "./icon";

interface Props<T = string> {
  how: T;
  onClick: (how: T) => void;
  size?: SizeType;
}

export function MarkAll<T extends string>(
  props: Props<T>
): ReturnType<React.FC<Props<T>>> {
  const { how, onClick, size } = props;

  function icon() {
    switch (how) {
      case "read":
        return <Icon name="check-square" />;
      case "unread":
        return <Icon name="square" />;
      default:
        undefined;
    }
  }

  return (
    <Button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(how);
      }}
      size={size}
    >
      <>
        {icon()} Mark all {capitalize(how)}
      </>
    </Button>
  );
}
