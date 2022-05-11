import { DropdownMenu, Icon, MenuItem } from "@cocalc/frontend/components";
import React, { CSSProperties } from "react";

interface Props {
  onClick: (family: string) => void;
  style?: CSSProperties;
  markdown?: boolean; // if it is markdown we can document the shortcuts.
}

export default function HeadingMenu({ onClick, style, markdown }: Props) {
  const items: JSX.Element[] = [];
  for (let heading = 0; heading <= 6; heading++) {
    items.push(
      <MenuItem key={heading} eventKey={heading}>
        {headingContent(heading, markdown)}
      </MenuItem>
    );
  }
  return (
    <DropdownMenu
      button={true}
      title={<Icon name={"header"} />}
      key={"heading"}
      onClick={onClick}
      style={style}
    >
      {items}
    </DropdownMenu>
  );
}

function headingContent(heading: number, markdown?: boolean): JSX.Element {
  let hashes = "";
  if (markdown) {
    for (let i = 0; i < heading; i++) {
      hashes += "#";
    }
  }
  const label =
    heading == 0
      ? "Paragraph"
      : `Heading ${heading}${
          markdown ? " (shortcut: " + hashes + " Foo␣)" : ""
        }`;
  if (heading === 0) {
    return <span>{label}</span>;
  } else {
    return React.createElement(`h${heading}`, {}, label);
  }
}
