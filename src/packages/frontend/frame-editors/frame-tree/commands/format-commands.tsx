/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { range } from "lodash";
import { defineMessage } from "react-intl";

import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import ColorPicker from "@cocalc/frontend/components/color-picker";
import { HeadingContent } from "@cocalc/frontend/components/heading-menu";
import {
  FONT_FACES,
  FONT_SIZES,
} from "@cocalc/frontend/editors/editor-button-bar";
import { menu } from "@cocalc/frontend/i18n";
import { addEditorMenus } from "./editor-menus";

const FORMAT_SPEC = {
  equation: {
    button: defineMessage({
      id: "command.format.equation.button",
      defaultMessage: "Math",
    }),
    label: defineMessage({
      id: "command.format.equation.label",
      defaultMessage: "Inline Equation",
    }),
    title: defineMessage({
      id: "command.format.equation.title",
      defaultMessage: "Insert inline LaTeX math equation",
    }),
    icon: <span>$</span>,
  },
  display_equation: {
    button: defineMessage({
      id: "command.format.display_equation.button",
      defaultMessage: "Display",
    }),
    label: defineMessage({
      id: "command.format.display_equation.label",
      defaultMessage: "Displayed Equation",
    }),
    title: defineMessage({
      id: "command.format.display_equation.title",
      defaultMessage: "Insert display LaTeX math equation",
    }),
    icon: <span>$$</span>,
  },
  ai_formula: {
    button: defineMessage({
      id: "command.format.ai_formula.button",
      defaultMessage: "Formula",
    }),
    label: defineMessage({
      id: "command.format.ai_formula.label",
      defaultMessage: "AI Generated Formula",
    }),
    title: defineMessage({
      id: "command.format.ai_formula.title",
      defaultMessage: "Insert AI generated formula.",
    }),
    icon: <AIAvatar size={16} />,
  },
  bold: {
    icon: "bold",
    label: defineMessage({
      id: "command.format.font_text.bold.label",
      defaultMessage: "Bold",
      description: "format the font in a text document",
    }),
    title: defineMessage({
      id: "command.format.font_text.bold.tooltip",
      defaultMessage: "Make selected text bold",
      description: "format the font in a text document",
    }),
  },
  italic: {
    icon: "italic",
    label: defineMessage({
      id: "command.format.font_text.italic.label",
      defaultMessage: "Italic",
      description: "format the font in a text document",
    }),
    title: defineMessage({
      id: "command.format.font_text.italic.tooltip",
      defaultMessage: "Make selected text italics",
      description: "format the font in a text document",
    }),
  },
  underline: {
    icon: "underline",
    label: defineMessage({
      id: "command.format.font_text.underline.label",
      defaultMessage: "Underline",
      description: "format the font in a text document",
    }),
    title: defineMessage({
      id: "command.format.font_text.underline.tooltip",
      defaultMessage: "Underline selected text",
      description: "format the font in a text document",
    }),
  },
  strikethrough: {
    icon: "strikethrough",
    label: defineMessage({
      id: "command.format.font_text.strikethrough.label",
      defaultMessage: "Strikethrough",
      description: "format the font in a text document",
    }),
    title: defineMessage({
      id: "command.format.font_text.strikethrough.tooltip",
      defaultMessage: "Strike through selected text",
      description: "format the font in a text document",
    }),
  },
  code: {
    icon: "code",
    label: defineMessage({
      id: "command.format.font_text.code.label",
      defaultMessage: "Code",
      description: "format the font in a text document",
    }),
    title: defineMessage({
      id: "command.format.font_text.code.tooltip",
      defaultMessage: "Format selected text as code",
      description: "format the font in a text document",
    }),
  },
  sub: {
    icon: "subscript",
    label: defineMessage({
      id: "command.format.font_text.sub.label",
      defaultMessage: "Subscript",
      description: "format the font in a text document",
    }),
    title: defineMessage({
      id: "command.format.font_text.sub.tooltip",
      defaultMessage: "Make selected text a subscript",
      description: "format the font in a text document",
    }),
  },
  sup: {
    icon: "superscript",
    label: defineMessage({
      id: "command.format.font_text.sup.label",
      defaultMessage: "Supscript",
      description: "format the font in a text document",
    }),
    title: defineMessage({
      id: "command.format.font_text.sup.tooltip",
      defaultMessage: "Make selected text a superscript",
      description: "format the font in a text document",
    }),
  },
  comment: {
    icon: "comment",
    title: defineMessage({
      id: "command.format.font_text.comment.tooltip",
      defaultMessage:
        "Comment out selected text so it is not visible in rendered view.",
      description: "format the font in a text document",
    }),
    label: defineMessage({
      id: "command.format.font_text.comment.label",
      defaultMessage: "Hide Selection as Comment",
      description: "format the font in a text document",
    }),
  },
  format_code: {
    icon: "CodeOutlined",
    label: defineMessage({
      id: "command.format.format_code.label",
      defaultMessage: "Code Block",
      description: "a code block in a text document",
    }),
    title: defineMessage({
      id: "command.format.format_code.tooltip",
      defaultMessage:
        "Insert a block of source code or format selection as code",
      description: "a code block in a text document",
    }),
  },
  insertunorderedlist: {
    icon: "list",
    label: defineMessage({
      id: "command.format.insertunorderedlist.label",
      defaultMessage: "Unordered List",
      description: "a list in a text document",
    }),
    title: defineMessage({
      id: "command.format.insertunorderedlist.tooltip",
      defaultMessage: "Insert an unordered list",
      description: "a list in a text document",
    }),
  },
  insertorderedlist: {
    icon: "list-ol",
    label: defineMessage({
      id: "command.format.insertorderedlist.label",
      defaultMessage: "Ordered List",
      description: "a list in a text document",
    }),
    title: defineMessage({
      id: "command.format.insertorderedlist.tooltip",
      defaultMessage: "Insert an ordered list",
      description: "a list in a text document",
    }),
  },
  quote: {
    icon: "quote-left",
    label: defineMessage({
      id: "command.format.quote.label",
      defaultMessage: "Quote",
      description: "a quoted text in a text document",
    }),
    title: defineMessage({
      id: "command.format.quote.tooltip",
      defaultMessage: "Make selected text into a quotation",
      description: "a quoted text in a text document",
    }),
  },
  table: {
    icon: "table",
    label: defineMessage({
      id: "command.format.table.label",
      defaultMessage: "Table",
      description: "a table text in a text document",
    }),
    title: defineMessage({
      id: "command.format.table.tooltip",
      defaultMessage: "Insert a table",
      description: "a table text in a text document",
    }),
  },
  horizontalRule: {
    label: defineMessage({
      id: "command.format.horizontalRule.label",
      defaultMessage: "Horizontal Rule",
      description: "a horizontal rule line in a text document",
    }),
    title: defineMessage({
      id: "command.format.horizontalRule.tooltip",
      defaultMessage: "Insert a horizontal rule",
      description: "a horizontal rule line in a text document",
    }),
    icon: <span>&mdash;</span>,
  },
  link: {
    icon: "link",
    label: defineMessage({
      id: "command.format.link.label",
      defaultMessage: "Link",
      description: "a URL link in a text document",
    }),
    title: defineMessage({
      id: "command.format.link.tooltip",
      defaultMessage: "Insert a link to a URL, i.e., a website.",
      description: "a URL link in a text document",
    }),
  },
  image: {
    icon: "image",
    label: defineMessage({
      id: "command.format.image.label",
      defaultMessage: "Image",
      description: "an image embedded in a text document",
    }),
    title: defineMessage({
      id: "command.format.image.tooltip",
      defaultMessage:
        "Insert an image.  You can also just drag and drop or paste an image into your document in many cases.",
      description: "an image embedded in a text document",
    }),
  },
  SpecialChar: {
    icon: <span style={{ fontSize: "larger" }}>&Omega;</span>,
    label: defineMessage({
      id: "command.format.SpecialChar.label",
      defaultMessage: "Special Character",
      description: "insert a special character in a text document",
    }),
    title: defineMessage({
      id: "command.format.SpecialChar.tooltip",
      defaultMessage:
        "Insert non-English characters, emojis, and mathematical symbols.",
      description: "insert a special character in a text document",
    }),
  },
  justifyleft: {
    icon: "align-left",
    label: defineMessage({
      id: "command.format.justifyleft.label",
      defaultMessage: "Align Left",
      description: "format a paragraph in a text document",
    }),
    title: defineMessage({
      id: "command.format.justifyleft.tooltip",
      defaultMessage: "Left justify current text",
      description: "format a paragraph in a text document",
    }),
  },
  justifycenter: {
    icon: "align-center",
    label: defineMessage({
      id: "command.format.justifycenter.label",
      defaultMessage: "Align Center",
      description: "format a paragraph in a text document",
    }),
    title: defineMessage({
      id: "command.format.justifycenter.tooltip",
      defaultMessage: "Center current text",
      description: "format a paragraph in a text document",
    }),
  },
  justifyright: {
    icon: "align-right",
    label: defineMessage({
      id: "command.format.justifyright.label",
      defaultMessage: "Align Right",
      description: "format a paragraph in a text document",
    }),
    title: defineMessage({
      id: "command.format.justifyright.tooltip",
      defaultMessage: "Right justify current text",
      description: "format a paragraph in a text document",
    }),
  },
  justifyfull: {
    icon: "align-justify",
    label: defineMessage({
      id: "command.format.justifyfull.label",
      defaultMessage: "Justify",
      description: "format a paragraph in a text document",
    }),
    title: defineMessage({
      id: "command.format.justifyfull.tooltip",
      defaultMessage: "Fully justify current text",
      description: "format a paragraph in a text document",
    }),
  },
  unformat: {
    icon: "remove",
    label: defineMessage({
      id: "command.format.unformat.label",
      defaultMessage: "Remove Formatting",
      description: "format text in a text document",
    }),
    title: defineMessage({
      id: "command.format.unformat.tooltip",
      defaultMessage: "Remove all formatting from selected text",
      description: "format text in a text document",
    }),
  },
};

const FORMAT_MENUS = {
  insert: {
    label: menu.insert,
    pos: 1.3,
    entries: {
      math: ["equation", "display_equation", "ai_formula"],
      lists: ["insertunorderedlist", "insertorderedlist"],
      objects: [
        "table",
        "link",
        "quote",
        "image",
        "horizontalRule",
        "format_code",
        "SpecialChar",
      ],
    },
  },
  format: {
    label: menu.format,
    pos: 1.5,
    entries: {
      font_text: [
        {
          icon: "bold",
          isVisible: "format_action",
          name: "font",
          label: defineMessage({
            id: "command.format.font_text.label",
            defaultMessage: "Font",
            description: "format the font in a text document",
          }),
          children: [
            "bold",
            "italic",
            "underline",
            "strikethrough",
            "code",
            "sub",
            "sup",
          ],
        },
        {
          icon: "text-height",
          isVisible: "format_action", // todo
          name: "font-size",
          label: defineMessage({
            id: "command.format.font_size.label",
            defaultMessage: "Size",
            description: "change the font size in a text document",
          }),
          children: FONT_SIZES.map((size) => {
            return {
              name: `${size}`,
              onClick: ({ props }) =>
                props.actions.format_action("font_size_new", size),
              label: (
                <span style={{ fontSize: size }}>
                  {size} {size === "medium" ? "(default)" : undefined}
                </span>
              ),
              icon: <span style={{ fontSize: size }}>A</span>,
            };
          }),
        },
        {
          icon: "font",
          isVisible: "format_action", // todo
          name: "font-family",
          label: defineMessage({
            id: "command.format.font_family.label",
            defaultMessage: "Family",
            description: "change the font family in a text document",
          }),
          children: FONT_FACES.map((family) => {
            return {
              name: family,
              onClick: ({ props }) =>
                props.actions.format_action("font_family", family),
              label: <span style={{ fontFamily: family }}>{family}</span>,
              icon: <span style={{ fontFamily: family }}>A</span>,
            };
          }),
        },
        {
          icon: "header",
          isVisible: "format_action", // todo
          name: "header",
          label: defineMessage({
            id: "command.format.font_heading.label",
            defaultMessage: "Heading",
            description: "change the heading in a text document",
          }),
          children: range(1, 7).map((heading) => {
            return {
              name: `heading-${heading}`,
              onClick: ({ props }) =>
                props.actions.format_action(`format_heading_${heading}`),
              label: <HeadingContent heading={heading} />,
            };
          }),
        },
        {
          icon: "colors",
          isVisible: "format_action",
          name: "color",
          label: defineMessage({
            id: "command.format.font_color.label",
            defaultMessage: "Color",
            description: "change the font color in a text document",
          }),
          children: [
            {
              stayOpenOnClick: true,
              label: ({ props }) => (
                <div
                  onClick={(e) => {
                    // hack so can select a color without picker closing.
                    e.stopPropagation();
                  }}
                >
                  <ColorPicker
                    radio
                    onChange={(code) => {
                      props.actions.format_action("color", code);
                    }}
                  />
                </div>
              ),
            },
          ],
        },
        {
          icon: "text",
          isVisible: "format_action",
          name: "text",
          label: defineMessage({
            id: "command.format.font_alignment.label",
            defaultMessage: "Alignment",
            description: "change the paragraph alignment in a text document",
          }),
          children: [
            "justifyleft",
            "justifycenter",
            "justifyright",
            "justifyfull",
          ],
        },
        "comment",
        "unformat",
      ],
    },
  },
};

addEditorMenus({
  prefix: "format",
  editorMenus: FORMAT_MENUS,
  getCommand: (name) => {
    const spec = FORMAT_SPEC[name];
    return {
      isVisible: "format_action",
      onClick: ({ props }) => props.actions.format_action(name),
      ...spec,
    };
  },
});
