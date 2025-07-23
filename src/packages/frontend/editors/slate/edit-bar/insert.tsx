/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useMemo } from "react";

import { DropdownMenu, Icon, IconName } from "@cocalc/frontend/components";
import { MenuItems } from "@cocalc/frontend/components/dropdown-menu";
import { formatAction } from "../format";
import { BUTTON_STYLE } from "./marks-bar";

const ITEMS: [string, string, IconName | React.JSX.Element][] = [
  ["link", "Link to a URL...", "link"],
  ["image", "Image...", "image"],
  ["SpecialChar", "Special symbol or emoji...", <span>Ω</span>],
  ["format_code", "Block of code (shortcut: ```␣)", "CodeOutlined"],
  ["insertunorderedlist", "Unordered list (shortcut: -␣)", "list"],
  ["insertorderedlist", "Ordered list (shortcut: 1.␣)", "list-ol"],
  ["equation", "Inline LaTeX math (shortcut: $x$␣)", <span>$</span>],
  [
    "display_equation",
    "Displayed LaTeX math  (shortcut: $$x$$␣)",
    <span>$$</span>,
  ],
  ["quote", "Quote selected text  (shortcut: >␣)", "quote-left"],
  ["horizontalRule", "Horizontal rule (shortcut: ---␣)", <span>&mdash;</span>],
  ["linebreak", "Line break (shortcut: <br/>␣)", <span>↵</span>],
  ["table", "Table", "table"],
];

interface Props {
  editor;
}

export default function InsertMenu({ editor }: Props) {
  const items: MenuItems = useMemo(() => {
    return ITEMS.map(([command, description, icon]) => {
      return {
        key: command,
        onClick: () => formatAction(editor, command, []),
        label: (
          <>
            <div style={{ display: "inline-block", width: "24px" }}>
              {typeof icon == "string" ? <Icon name={icon} /> : icon}
            </div>{" "}
            {description}
          </>
        ),
      };
    });
  }, [editor]);

  return (
    <DropdownMenu
      button={true}
      title={<Icon name={"plus-circle"} />}
      style={BUTTON_STYLE}
      items={items}
    />
  );
}
