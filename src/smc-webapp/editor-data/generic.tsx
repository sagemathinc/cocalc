/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
"Editor" (really a read-only simple viewer) for generic data files

See https://github.com/sagemathinc/cocalc/issues/2462
*/

import { React, Component, Rendered } from "../app-framework";
const { register_file_editor } = require("../project_file");

import { Well } from "react-bootstrap";

const { Markdown } = require("../r_misc");
const { webapp_client } = require("../webapp_client");

import { keys, filename_extension } from "smc-util/misc2";

// ext: markdown string.
const INFO = {
  h4:
    "Hierarchical Data Format (HDF file) -- you can open this file using a Python or R library.",
  h5:
    "Hierarchical Data Format (HDF file) -- you can open this file using a Python or R library.",
  xlsx:
    "Microsoft Excel file -- you may be able to use this file via a Python library or use it in some other way.",
  raw:
    "You may be able to use this file via a Python library or use it in some other way.",
  tiff:
    "You may be able to use this file via a Python image manipulation library or use it in some other way.",
  fit:
    "You may be able to use this file from Python using the [fitparse](https://github.com/dtcooper/python-fitparse) library.",
  odt:
    "Please download this file to your computer and open it using [OpenOffice Writer](https://www.openoffice.org/product/writer.html).",
  sobj:
    'You can load an sobj file into **SageMath** by typing `load("filename.sobj")`.',
  "noext-octave-workspace": `\
This is a data file that contains the state of your Octave workspace.
Read more: [Saving-Data-on-Unexpected-Exits](https://www.gnu.org/software/octave/doc/v4.2.1/Saving-Data-on-Unexpected-Exits.html).\
`,
  "noext-a.out":
    "This is a binary executable, which you can run in a Terminal by typing ./a.out."
};

interface Props {
  project_id: string;
  path: string;
}

class DataGeneric extends Component<Props, {}> {
  render_hint(): Rendered {
    const ext = filename_extension(this.props.path);
    const hint = INFO[ext];
    if (hint) {
      return <Markdown value={hint} />;
    }
    return (
      <span style={{ color: "#666" }}>
        You may be able to use this file from another program, for example, as a
        data file that is manipulated using a Jupyter notebook.
      </span>
    );
  }

  render() {
    const src = webapp_client.read_file_from_project({
      project_id: this.props.project_id,
      path: this.props.path
    });
    return (
      <Well style={{ margin: "15px", fontSize: "12pt" }}>
        <h2>Data File</h2>
        CoCalc does not have a special viewer or editor for{" "}
        <a href={src} target="_blank">
          {this.props.path}
        </a>
        .
        <br />
        <br />
        {this.render_hint()}
      </Well>
    );
  }
}

register_file_editor({
  ext: keys(INFO),
  icon: "table",
  component: DataGeneric
});
