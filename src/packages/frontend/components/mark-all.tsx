/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { capitalize } from "@cocalc/util/misc";
import { Button } from "antd";
import { SizeType } from "antd/lib/config-provider/SizeContext";
import { Icon } from "./icon";

interface Props {
  how: string;
  onClick: (how: string) => void;
  size?: SizeType;
}

export function MarkAll({ how, onClick, size }: Props) {
  function icon() {
    switch (how) {
      case "read":
      case "seen":
        return <Icon name="check-square" />;
      case "unread":
      case "unseen":
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
      aria-label={`Mark all items as ${capitalize(how)}`}
    >
      <>
        {icon()} Mark all {capitalize(how)}
      </>
    </Button>
  );
}
