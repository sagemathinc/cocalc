import { parse } from "@cocalc/frontend/node_modules/@unified-latex/unified-latex-util-parse";
import normalize from "../../slate/markdown-to-slate/normalize";
import { stripMathEnvironment } from "../../slate/elements/math";

export default function latexToSlate(source: string) {
  const node = parse(source);
  window.latex = { node, parse };
  return normalize(toSlate(node, { source }) ?? []);
}

function toSlate(node, state) {
  console.log({ node, state });
  if (node == null) {
    return;
  }

  if (Array.isArray(node)) {
    const children: any[] = [];
    for (const child of node) {
      const x = toSlate(child, state);
      if (x != null) {
        if (state.children != null) {
          for (const x of state.children) {
            children.push(x);
          }
          delete state.children;
        }
        for (const y of x) {
          children.push(y);
        }
      }
    }
    if (state.children != null) {
      for (const x of state.children) {
        children.push(x);
      }
      delete state.children;
    }
    return children;
  }

  let value: string;
  switch (node.type) {
    case "root":
    case "environment":
    case "argument":
      const children: any[] = [];
      for (const child of node.content) {
        const x = toSlate(child, state);
        if (x != null) {
          if (state.children != null) {
            children.push({ type: "paragraph", children: state.children });
            delete state.children;
          }
          for (const y of x) {
            children.push(y);
          }
        }
      }
      if (state.children != null) {
        children.push({ type: "paragraph", children: state.children });
        delete state.children;
      }
      return children;

    case "string":
      if (state.children == null) {
        state.children = [];
      }
      state.children.push({ text: node.content });
      return;

    case "whitespace":
      if (state.children == null) {
        state.children = [];
      }
      state.children.push({ text: " " });
      return;

    case "parbreak":
      const v = [
        { type: "paragraph", children: state.children ?? [{ text: "" }] },
      ];
      delete state.children;
      return v;

    case "displaymath":
      return [
        {
          type: "math_block",
          value: state.source
            .slice(node.position.start.offset, node.position.end.offset)
            .slice(2, -2),
          isVoid: true,
          children: [{ text: "" }],
        },
      ];

    case "inlinemath":
      value = state.source.slice(
        node.position.start.offset,
        node.position.end.offset
      );
      if (value.startsWith("\\(")) {
        value = value.slice(2, -2);
      } else {
        value = value.slice(1, -1);
      }
      if (state.children == null) {
        state.children = [];
      }
      state.children.push({
        type: "math_inline",
        value,
        isVoid: true,
        isInline: true,
        children: [{ text: "" }],
      });
      return;

    case "mathenv":
      // todo node.env.content
      value = stripMathEnvironment(
        state.source.slice(node.position.start.offset, node.position.end.offset)
      );
      if (node.env?.content == "displaymath") {
        return [
          {
            type: "math_block",
            value,
            isVoid: true,
            children: [{ text: "" }],
          },
        ];
      } else {
        if (state.children == null) {
          state.children = [];
        }
        state.children.push({
          type: "math_inline",
          value,
          isVoid: true,
          isInline: true,
          children: [{ text: "" }],
        });
        return;
      }

    case "macro":
      switch (node.content) {
        case "documentclass":
          state.documentclass = node.args[1].content[0].content;
          return;
        case "title":
          state.title = node;
          return;
        case "author":
          state.author = node;
          return;
        case "textbf":
          let text = "";
          for (const x of node.args[0]?.content ?? []) {
            if (x.type == "string") {
              text += x.content;
            } else if (x.type == "whitespace") {
              text += " ";
            }
          }
          state.children.push({ text, bold: true });
          return;
        case "maketitle":
          const v: any[] = [];
          if (state.title != null) {
            const x = toSlate(state.title.args, {});
            if (x != null) {
              for (const title of x) {
                title.type = "heading";
                title.level = 1;
                title.align = "center";
                v.push(title);
              }
            }
          }
          if (state.author != null) {
            const x = toSlate(state.author.args, {});
            if (x != null) {
              for (const author of x) {
                author.type = "heading";
                author.level = 3;
                author.align = "center";
                v.push(author);
              }
            }
          }
          v.push({
            type: "heading",
            level: 3,
            align: "center",
            children: [{ text: new Date().toLocaleDateString() }],
          });
          return v;
        default:
          return [
            {
              type: "paragraph",
              children: [{ text: `unknown macro ${node.content}` }],
            },
          ];
      }
  }
}
