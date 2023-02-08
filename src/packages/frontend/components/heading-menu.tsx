/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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

export default function HeadingMenu(props: Props) {
  const { onClick, style, markdown } = props;

  const items = useMemo((): MenuItems => {
    return range(7).map((heading) => {
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

function HeadingContent(props: {
  heading: number;
  markdown?: boolean;
}): JSX.Element {
  const { heading, markdown } = props;
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
    // heading+1 is "wrong" but the menu is not so large
    return React.createElement(`h${heading + 1}`, {}, label);
  }
}
