import { FONT_SIZES } from "@cocalc/frontend/editors/editor-button-bar";
import { DropdownMenu, Icon, MenuItem } from "@cocalc/frontend/components";
import { CSSProperties } from "react";

interface Props {
  onClick: (family: string) => void;
  style?: CSSProperties;
}

export default function FontSizeMenu({ onClick, style }: Props) {
  const items: JSX.Element[] = [];
  for (const size of FONT_SIZES) {
    const item: JSX.Element = (
      <MenuItem key={size} eventKey={size}>
        <span style={{ fontSize: size }}>
          {size} {size === "medium" ? "(default)" : undefined}
        </span>
      </MenuItem>
    );
    items.push(item);
  }
  return (
    <DropdownMenu
      style={style}
      button={true}
      title={<Icon name={"text-height"} />}
      key={"font-size"}
      id={"font-size"}
      onClick={onClick}
    >
      {items}
    </DropdownMenu>
  );
}
