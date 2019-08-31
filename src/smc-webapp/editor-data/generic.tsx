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

const hdf_file =
  "Hierarchical Data Format (HDF file) -- you can open this file using a Python or R library.";
const excel =
  'Microsoft Excel file -- Create an ["X11" file](https://doc.cocalc.com/x11.html) and open the "Calc" application.';
const microsoft_word =
  'Microsoft Word file -- Create an ["X11" file](https://doc.cocalc.com/x11.html) and open the "Writer" application.';
const microsoft_ppt =
  'Microsoft PowerPoint -- Create an ["X11" file](https://doc.cocalc.com/x11.html) and open the "Impress" application.';

// ext: markdown string.
const INFO = {
  h4: hdf_file,
  h5: hdf_file,
  xlsx: excel,
  xls: excel,
  doc: microsoft_word,
  docx: microsoft_word,
  ppt: microsoft_ppt,
  pptx: microsoft_ppt,
  kmz:
    "Editing [KMZ files](https://developers.google.com/kml/documentation/kmzarchives) is not supported. You could `unzip` them in a [Terminal](https://doc.cocalc.com/terminal.html).",
  jar:
    "Run JAVA jar archives in a [Terminal](https://doc.cocalc.com/terminal.html) via `java -jar <filename.jar>`",
  raw:
    "You may be able to use this file via a Python library or use it in some other way.",
  tiff:
    'You may be able to use this file via a Python image manipulation library or via a tool like "Gimp" in an ["X11" file](https://doc.cocalc.com/x11.html).',
  fit:
    "You may be able to use this file from Python using the [fitparse](https://github.com/dtcooper/python-fitparse) library.",
  odt:
    'OpenDocument Text -- Create an ["X11" file](https://doc.cocalc.com/x11.html) and open the "Writer" application.',
  ods:
    'OpenDocument Spreadsheet -- Create an ["X11" file](https://doc.cocalc.com/x11.html) and open the "Calc" application.',
  odp:
    'OpenDocument Presentation -- Create an ["X11" file](https://doc.cocalc.com/x11.html) and open the "Impress" application.',
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
  icon: "question",
  component: DataGeneric
});
