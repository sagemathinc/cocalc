/*
This is not actually editable.  It just shows there references
and the hover text over the word "References" says that you need
to edit markdown source.  Also, you can't type [Sage][2]space and
have it autoformat as a reference (say), since there references
aren't known to the autoformatter.  Both of those are things
to do later.  The point of the below is just to not mangle content
that uses reference links.

Another point -- it's currently possible to move the cursor after the
references at the bottom of the document and delete them all.  Maybe that
is good, but it could be confusing.  Undo will put them back though.
*/

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
          <Tooltip title="The references below must be edited in the markdown source.">
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
