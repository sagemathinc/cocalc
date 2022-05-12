import { FONT_FACES } from "@cocalc/frontend/editors/editor-button-bar";
import { DropdownMenu, Icon, MenuItem } from "@cocalc/frontend/components";
import { CSSProperties } from "react";

interface Props {
  onClick: (family: string) => void;
  style?: CSSProperties;
}

export default function FontFamilyMenu({ onClick, style }: Props) {
  const items: JSX.Element[] = [];
  for (const family of FONT_FACES) {
    const item: JSX.Element = (
      <MenuItem key={family} eventKey={family}>
        <span style={{ fontFamily: family }}>{family}</span>
      </MenuItem>
    );
    items.push(item);
  }
  return (
    <DropdownMenu
      style={style}
      button={true}
      title={<Icon name={"font"} />}
      key={"font-family"}
      onClick={onClick}
    >
      {items}
    </DropdownMenu>
  );
}
