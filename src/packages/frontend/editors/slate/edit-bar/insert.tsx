import { BUTTON_STYLE } from "./marks-bar";
import {
  DropdownMenu,
  Icon,
  IconName,
  MenuItem,
} from "@cocalc/frontend/components";
import { formatAction } from "../format";

const ITEMS: [string, string, IconName | JSX.Element][] = [
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
  ["table", "Table", "table"],
];

interface Props {
  editor;
}

export default function InsertMenu({ editor }: Props) {
  const items: JSX.Element[] = [];
  for (const [command, description, icon] of ITEMS) {
    items.push(
      <MenuItem key={command} eventKey={command}>
        <div style={{ display: "inline-block", width: "24px" }}>
          {typeof icon == "string" ? <Icon name={icon} /> : icon}
        </div>{" "}
        {description}
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
