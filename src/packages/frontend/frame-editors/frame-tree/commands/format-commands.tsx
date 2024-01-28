import { addEditorMenus } from "./editor-menus";

const FORMAT_SPEC = {
  equation: {
    label: "Inline Equation",
    title: "Insert inline LaTeX math equation.",
    icon: <span>$</span>,
  },
  display_equation: {
    label: "Displayed Equation",
    title: "Insert display LaTeX math equation.",
    icon: <span>$$</span>,
  },
  bold: { icon: "bold", title: "Make selected text bold" },
  italic: { icon: "italic", title: "Make selected text italics" },
  underline: { icon: "underline", title: "Underline selected text" },
  strikethrough: {
    icon: "strikethrough",
    title: "Strike through selected text",
  },
  code: { icon: "code", title: "Format selected text as code" },
  sub: {
    label: "Subscript",
    title: "Make selected text a subscript",
    icon: "subscript",
  },
  sup: { title: "Make selected text a superscript", icon: "superscript" },
  comment: {
    icon: "comment",
    title: "Comment out selected text so it is not visible in rendered view.",
    label: "Hide as Comment",
  },
};

const FORMAT_MENUS = {
  insert: {
    label: "Insert",
    pos: 1.3,
    math: ["equation", "display_equation"],
  },
  format: {
    label: "Format",
    pos: 1.5,
    font_text: [
      {
        icon: "bold",
        isVisible: "format_action",
        name: "font",
        label: "Font",
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
      "comment",
    ],
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
