import { BUTTON_STYLE } from "./marks-bar";
import {
  DropdownMenu,
  Icon,
  IconName,
  MenuItem,
} from "@cocalc/frontend/components";
import { formatAction } from "../format";

const ITEMS: [string, string, IconName | JSX.Element][] = [
  ["format_code", "Block of code", "CodeOutlined"],
  ["insertunorderedlist", "Unordered list", "list"],
  ["insertorderedlist", "Ordered list", "list-ol"],
  ["equation", "Inline LaTeX math", <span>$</span>],
  ["display_equation", "Displayed LaTeX math", <span>$$</span>],
  ["quote", "Quote selected text", "quote-left"],
  ["table", "Table", "table"],
  ["horizontalRule", "Horizontal rule", <span>&mdash;</span>],
];

interface Props {
  editor;
}

export default function InsertMenu({ editor }: Props) {
  const items: JSX.Element[] = [];
  for (const [command, description, icon] of ITEMS) {
    items.push(
      <MenuItem key={command} eventKey={command}>
        {typeof icon == "string" ? <Icon name={icon} /> : icon} {description}
      </MenuItem>
    );
  }

  return (
    <DropdownMenu
      button={true}
      title={<Icon name={"plus-circle"} />}
      onClick={(command) => formatAction(editor, command, [])}
      style={BUTTON_STYLE}
    >
      {items}
    </DropdownMenu>
  );
}
