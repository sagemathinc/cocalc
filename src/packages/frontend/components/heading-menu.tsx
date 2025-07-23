/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { range } from "lodash";
import React, { CSSProperties, useMemo } from "react";

import { DropdownMenu, Icon } from "@cocalc/frontend/components";
import { MenuItems } from "./dropdown-menu";

interface Props {
  onClick: (heading: number) => void;
  style?: CSSProperties;
  markdown?: boolean; // if it is markdown we can document the shortcuts.
}

export default function HeadingMenu({ onClick, style, markdown }: Props) {
  const items = useMemo((): MenuItems => {
    return range(1, 7).map((heading) => {
      return {
        key: heading,
        onClick: () => onClick(heading),
        label: <HeadingContent heading={heading} markdown={markdown} />,
      };
    });
  }, [onClick, markdown]);

  return (
    <DropdownMenu
      button={true}
      title={<Icon name={"header"} />}
      key={"heading"}
      style={style}
      items={items}
    />
  );
}

export function HeadingContent({
  heading,
  markdown,
}: {
  heading: number;
  markdown?: boolean;
}): React.JSX.Element {
  const hashes = markdown
    ? range(heading)
        .map(() => "#")
        .join("")
    : "";

  const label =
    heading == 0
      ? "Paragraph"
      : `Heading ${heading}${
          markdown ? " (shortcut: " + hashes + "␣Foo…)" : ""
        }`;
  if (heading === 0) {
    return <span>{label}</span>;
  } else {
    return React.createElement(`h${heading}`, { style: { margin: 0 } }, label);
  }
}
