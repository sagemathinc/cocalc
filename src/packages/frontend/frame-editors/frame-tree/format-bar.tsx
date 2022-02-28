/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The format bar.
*/

import { React, Rendered } from "../../app-framework";
import { SetMap } from "./types";
import { DropdownMenu, MenuItem } from "../../components";
import { ButtonGroup, Button } from "../../antd-bootstrap";
import { FONT_FACES } from "../../editors/editor-button-bar";
import { Icon, isIconName, Space } from "@cocalc/frontend/components";
import { ColorButton } from "@cocalc/frontend/components/color-picker";

const FONT_SIZES = [
  "xx-small",
  "x-small",
  "small",
  "medium",
  "large",
  "x-large",
  "xx-large",
] as const;

interface Props {
  actions: any; // type of file being edited, which impacts what buttons are shown.
  extension: string; // store   : rtypes.immutable.Map      # state about format bar stored in external store
  exclude?: SetMap; // exclude buttons with these names
}

function shouldMemoize() {
  return true;
}

export const FormatBar: React.FC<Props> = React.memo((props: Props) => {
  const { actions, extension, exclude } = props;

  function render_button(
    name: string,
    title: string,
    label?: string | Rendered, // if a string, the named icon; if a rendered
    // component for the button, show that in the button; if not given, use
    // icon with given name.
    fontSize?: string
  ): Rendered {
    if (exclude?.[name]) {
      return;
    }
    if (label == null && isIconName(name)) {
      label = <Icon name={name} />;
    } else if (typeof label === "string" && isIconName(label)) {
      label = <Icon name={label} />;
    }

    return (
      <Button
        key={name}
        title={title}
        onClick={() => actions.format_action(name)}
        style={{ maxHeight: "30px", fontSize }}
      >
        {label}
      </Button>
    );
  }

  function render_text_style_buttons(): Rendered {
    return (
      <ButtonGroup key={"text-style"}>
        {render_button("bold", "Make selected text bold")}
        {render_button("italic", "Make selected text italics")}
        {render_button("underline", "Underline selected text")}
        {render_button("strikethrough", "Strike through selected text")}
        {render_button("code", "Format selected text as code")}
        {render_button("sub", "Make selected text a subscript", "subscript")}
        {render_button(
          "sup",
          "Make selected text a superscript",
          "superscript"
        )}
        {render_button("comment", "Comment out selected text")}
      </ButtonGroup>
    );
  }

  function render_insert_buttons(): Rendered {
    return (
      <ButtonGroup key={"insert"}>
        {render_button(
          "format_code",
          "Insert block of source code",
          "CodeOutlined"
        )}
        {render_button("insertunorderedlist", "Insert unordered list", "list")}
        {render_button("insertorderedlist", "Insert ordered list", "list-ol")}
        {render_button("equation", "Insert inline LaTeX math", <span>$</span>)}
        {render_button(
          "display_equation",
          "Insert displayed LaTeX math",
          <span>$$</span>
        )}
        {render_button(
          "quote",
          "Make selected text into a quotation",
          "quote-left"
        )}
        {render_button("table", "Insert table", "table")}
        {render_button(
          "horizontalRule",
          "Insert horizontal rule",
          <span>&mdash;</span>
        )}
      </ButtonGroup>
    );
  }

  function render_insert_dialog_buttons(): Rendered {
    return (
      <ButtonGroup key={"insert-dialog"}>
        {render_button("link", "Insert link", "link")}
        {render_button("image", "Insert image", "image", "12pt")}
        {extension !== "tex"
          ? render_button(
              "SpecialChar",
              "Insert special character...",
              <span style={{ fontSize: "larger" }}>&Omega;</span>
            )
          : undefined}
      </ButtonGroup>
    );
  }

  function render_format_buttons(): Rendered {
    if (exclude?.["format_buttons"]) {
      return;
    }
    return (
      <>
        <Space />
        <ButtonGroup key={"format"}>
          {render_button("format_code", "Format selected text as code", "code")}
          {render_button(
            "justifyleft",
            "Left justify current text",
            "align-left"
          )}
          {render_button(
            "justifycenter",
            "Center current text",
            "align-center"
          )}
          {render_button(
            "justifyright",
            "Right justify current text",
            "align-right"
          )}
          {render_button(
            "justifyfull",
            "Fully justify current text",
            "align-justify"
          )}
        </ButtonGroup>
        <Space />
        <ButtonGroup key={"format2"}>
          {render_button(
            "unformat",
            "Remove all formatting from selected text",
            "remove"
          )}
        </ButtonGroup>
      </>
    );
  }

  function render_font_family_dropdown(): Rendered {
    const items: Rendered[] = [];
    for (const family of FONT_FACES) {
      const item: Rendered = (
        <MenuItem key={family} eventKey={family}>
          <span style={{ fontFamily: family }}>{family}</span>
        </MenuItem>
      );
      items.push(item);
    }
    return (
      <DropdownMenu
        button={true}
        title={<Icon name={"font"} />}
        key={"font-family"}
        id={"font-family"}
        onClick={(family) => actions.format_action("font_family", family)}
      >
        {items}
      </DropdownMenu>
    );
  }

  function render_font_size_dropdown(): Rendered {
    const items: Rendered[] = [];
    for (const size of FONT_SIZES) {
      const item: Rendered = (
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
        button={true}
        title={<Icon name={"text-height"} />}
        key={"font-size"}
        id={"font-size"}
        onClick={(size) => actions.format_action("font_size_new", size)}
      >
        {items}
      </DropdownMenu>
    );
  }

  function heading_content(heading: number): JSX.Element {
    const label = heading == 0 ? "Paragraph" : `Heading ${heading}`;
    if (heading === 0) {
      return <span>{label}</span>;
    } else {
      return React.createElement(`h${heading}`, {}, label);
    }
  }

  function render_heading_dropdown(): Rendered {
    const items: Rendered[] = [];
    for (let heading = 0; heading <= 6; heading++) {
      items.push(
        <MenuItem key={heading} eventKey={heading}>
          {heading_content(heading)}
        </MenuItem>
      );
    }
    return (
      <DropdownMenu
        button={true}
        title={<Icon name={"header"} />}
        key={"heading"}
        id={"heading"}
        onClick={(heading) =>
          actions.format_action(`format_heading_${heading}`)
        }
      >
        {items}
      </DropdownMenu>
    );
  }

  function render_colors_dropdown(): Rendered {
    return (
      <ColorButton onChange={(code) => actions.format_action("color", code)} />
    );
  }

  function render_font_dropdowns(): Rendered {
    if (exclude?.["font_dropdowns"]) {
      return;
    }
    return (
      <ButtonGroup
        key={"font-dropdowns"}
        style={{ float: "right", marginRight: "1px" }}
      >
        {render_font_family_dropdown()}
        {render_font_size_dropdown()}
        {render_heading_dropdown()}
        {render_colors_dropdown()}
      </ButtonGroup>
    );
  }

  return (
    <div style={{ background: "#f8f8f8", margin: "0 1px" }}>
      {render_font_dropdowns()}
      <div className={"cc-frame-tree-format-bar"}>
        {render_text_style_buttons()}
        <Space />
        {render_insert_buttons()}
        <Space />
        {render_insert_dialog_buttons()}
        {render_format_buttons()}
        <Space />
      </div>
    </div>
  );
}, shouldMemoize);
