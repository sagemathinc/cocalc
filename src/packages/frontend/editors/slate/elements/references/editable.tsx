import { register } from "../register";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import infoToMode from "../code-block/info-to-mode";
import { Tooltip } from "antd";

function fromSlate({ node }) {
  if (!node.value) return "";
  let v: string[] = [];
  for (const name in node.value) {
    const { title, href } = node.value[name];
    let line = `[${name}]: ${href ? href : "<>"}`;
    if (title) {
      line += ` '${title.replace(/'/g, "\\'")}'`;
    }
    v.push(line);
  }
  return "\n" + v.join("\n") + "\n";
}

register({
  slateType: "references",

  Element: ({ attributes, children, element }) => {
    if (element.type != "references") throw Error("references");
    return (
      <div {...attributes} contentEditable={false}>
        <hr />
        <div style={{ color: "#666", fontWeight: "bold", fontSize: "large" }}>
          <Tooltip title="The references below must be edited in the markdown source file.">
            References
          </Tooltip>
        </div>
        <CodeMirrorStatic
          no_border
          style={{ marginBottom: 0 }}
          options={{ mode: infoToMode("md"), lineWrapping: true }}
          value={fromSlate({ node: element })}
        />
        {children}
      </div>
    );
  },

  fromSlate,
});
