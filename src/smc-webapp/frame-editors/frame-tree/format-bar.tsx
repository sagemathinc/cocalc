/*
The format bar
*/

import { React, Component, Rendered, Fragment } from "../generic/react";

import { cmp } from "../generic/misc";

const css_colors = require("css-color-names");

const {
  ButtonGroup,
  Button,
  DropdownButton,
  MenuItem
} = require("react-bootstrap");

const buttonbar = require("smc-webapp/buttonbar");
const { Icon, Space } = require("smc-webapp/r_misc");

const FONT_SIZES = "xx-small x-small small medium large x-large xx-large".split(
  " "
);

interface Props {
  actions: any; // type of file being edited, which impacts what buttons are shown.
  extension: string; // store   : rtypes.immutable.Map      # state about format bar stored in external store
}

export class FormatBar extends Component<Props, {}> {
  shouldComponentUpdate(): boolean {
    return false;
  }

  render_button(
    name: string,
    title: string,
    label?: string | Rendered // if a string, the named icon; if a rendered
    // component for the button, show that in the button; if not given, use
    // icon with given name.
  ): Rendered {
    if (typeof label === "undefined") {
      label = <Icon name={name} />;
    } else if (typeof label === "string") {
      label = <Icon name={label} />;
    }

    return (
      <Button
        key={name}
        title={title}
        onClick={() => this.props.actions.format_action(name)}
      >
        {label}
      </Button>
    );
  }

  render_text_style_buttons(): Rendered {
    return (
      <ButtonGroup key={"text-style"}>
        {this.render_button("bold", "Make selected text bold")}
        {this.render_button("italic", "Make selected text italics")}
        {this.render_button("underline", "Underline selected text")}
        {this.render_button("strikethrough", "Strike through selected text")}
        {this.render_button("subscript", "Make selected text a subscript")}
        {this.render_button("superscript", "Make selected text a superscript")}
        {this.render_button("comment", "Comment out selected text")}
      </ButtonGroup>
    );
  }

  render_insert_buttons(): Rendered {
    return (
      <ButtonGroup key={"insert"}>
        {this.render_button(
          "equation",
          "Insert inline LaTeX math",
          <span>$</span>
        )}
        {this.render_button(
          "display_equation",
          "Insert displayed LaTeX math",
          <span>$$</span>
        )}
        {this.render_button(
          "insertunorderedlist",
          "Insert unordered list",
          "list"
        )}
        {this.render_button(
          "insertorderedlist",
          "Insert ordered list",
          "list-ol"
        )}
        {this.render_button(
          "quote",
          "Make selected text into a quotation",
          "quote-left"
        )}
        {this.render_button("table", "Insert table", "table")}
        {this.render_button(
          "horizontalRule",
          "Insert horizontal rule",
          <span>&mdash;</span>
        )}
      </ButtonGroup>
    );
  }

  render_insert_dialog_buttons(): Rendered {
    return (
      <ButtonGroup key={"insert-dialog"}>
        {this.render_button("link", "Insert link", "link")}
        {this.render_button("image", "Insert image", "image")}
        {this.props.extension !== "tex"
          ? this.render_button(
              "SpecialChar",
              "Insert special character...",
              <span>&Omega;</span>
            )
          : undefined}
      </ButtonGroup>
    );
  }

  render_format_buttons(): Rendered {
    return (
      <Fragment>
        <ButtonGroup key={"format"}>
          {this.render_button(
            "format_code",
            "Format selected text as code",
            "code"
          )}
          {this.render_button(
            "justifyleft",
            "Left justify current text",
            "align-left"
          )}
          {this.render_button(
            "justifycenter",
            "Center current text",
            "align-center"
          )}
          {this.render_button(
            "justifyright",
            "Right justify current text",
            "align-right"
          )}
          {this.render_button(
            "justifyfull",
            "Fully justify current text",
            "align-justify"
          )}
        </ButtonGroup>
        <Space />
        <ButtonGroup key={"format2"}>
          {this.render_button(
            "unformat",
            "Remove all formatting from selected text",
            "remove"
          )}
        </ButtonGroup>
      </Fragment>
    );
  }

  render_font_family_dropdown(): Rendered {
    const items: Rendered[] = [];
    for (let family of buttonbar.FONT_FACES) {
      const item: Rendered = (
        <MenuItem
          key={family}
          eventKey={family}
          onSelect={family =>
            this.props.actions.format_action("font_family", family)
          }
        >
          <span style={{ fontFamily: family }}>{family}</span>
        </MenuItem>
      );
      items.push(item);
    }
    return (
      <DropdownButton
        pullRight
        title={<Icon name={"font"} />}
        key={"font-family"}
        id={"font-family"}
      >
        {items}
      </DropdownButton>
    );
  }

  render_font_size_dropdown(): Rendered {
    const items: Rendered[] = [];
    for (let size of FONT_SIZES) {
      const item: Rendered = (
        <MenuItem
          key={size}
          eventKey={size}
          onSelect={size =>
            this.props.actions.format_action("font_size_new", size)
          }
        >
          <span style={{ fontSize: size }}>
            {size} {size === "medium" ? "(default)" : undefined}
          </span>
        </MenuItem>
      );
      items.push(item);
    }
    return (
      <DropdownButton
        pullRight
        title={<Icon name={"text-height"} />}
        key={"font-size"}
        id={"font-size"}
      >
        {items}
      </DropdownButton>
    );
  }

  render_heading_dropdown(): Rendered {
    const items: Rendered[] = [];
    for (let heading = 1; heading <= 6; heading++) {
      var c;
      const label = `Heading ${heading}`;
      switch (heading) {
        case 1:
          c = <h1>{label}</h1>;
          break;
        case 2:
          c = <h2>{label}</h2>;
          break;
        case 3:
          c = <h3>{label}</h3>;
          break;
        case 4:
          c = <h4>{label}</h4>;
          break;
        case 5:
          c = <h5>{label}</h5>;
          break;
        case 6:
          c = <h6>{label}</h6>;
          break;
      }
      const item = (
        <MenuItem
          key={heading}
          eventKey={heading}
          onSelect={heading =>
            this.props.actions.format_action(`format_heading_${heading}`)
          }
        >
          {c}
        </MenuItem>
      );
      items.push(item);
    }
    return (
      <DropdownButton
        pullRight
        title={<Icon name={"header"} />}
        key={"heading"}
        id={"heading"}
      >
        {items}
      </DropdownButton>
    );
  }

  render_colors_dropdown(): Rendered {
    let color, code;
    const items: Rendered[] = [];
    const v = (() => {
      const result: any[] = [];
      for (color in css_colors) {
        code = css_colors[color];
        result.push([color, code]);
      }
      return result;
    })();
    v.sort((a, b) => cmp(a.code, b.code));
    for (let x of v) {
      color = x[0];
      code = x[1];
      const item = (
        <MenuItem
          key={color}
          eventKey={code}
          onSelect={code => this.props.actions.format_action("color", code)}
        >
          <span style={{ background: code }}>
            <Space />
            <Space />
            <Space />
            <Space />
          </span>{" "}
          {color}
        </MenuItem>
      );
      items.push(item);
    }
    return (
      <DropdownButton
        pullRight
        title={<Icon name={"paint-brush"} />}
        key={"font-color"}
        id={"font-color"}
      >
        {items}
      </DropdownButton>
    );
  }

  render_font_dropdowns(): Rendered {
    if (this.props.extension === "tex") {
      // these are mostly not implemented for latex... yet!
      return;
    }
    return (
      <ButtonGroup
        key={"font-dropdowns"}
        style={{ float: "right", marginRight: "1px" }}
      >
        {this.render_font_family_dropdown()}
        {this.render_font_size_dropdown()}
        {this.render_heading_dropdown()}
        {this.render_colors_dropdown()}
      </ButtonGroup>
    );
  }

  render(): Rendered {
    return (
      <div
        style={{ background: "#f8f8f8", margin: "0 1px" }}
        className="cc-frame-tree-format-bar"
      >
        {this.render_font_dropdowns()}
        <div style={{ maxHeight: "34px", overflow: "hidden" }}>
          {this.render_text_style_buttons()}
          <Space />
          {this.render_insert_buttons()}
          <Space />
          {this.render_insert_dialog_buttons()}
          <Space />
          {this.render_format_buttons()}
          <Space />
        </div>
      </div>
    );
  }
}
