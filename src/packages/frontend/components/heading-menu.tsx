import { DropdownMenu, Icon, MenuItem } from "@cocalc/frontend/components";
import React, { CSSProperties } from "react";

interface Props {
  onClick: (family: string) => void;
  style?: CSSProperties;
}

export default function HeadingMenu({ onClick, style }: Props) {
  const items: JSX.Element[] = [];
  for (let heading = 0; heading <= 6; heading++) {
    items.push(
      <MenuItem key={heading} eventKey={heading}>
        {headingContent(heading)}
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

function headingContent(heading: number): JSX.Element {
  const label = heading == 0 ? "Paragraph" : `Heading ${heading}`;
  if (heading === 0) {
    return <span>{label}</span>;
  } else {
    return React.createElement(`h${heading}`, {}, label);
  }
}
