/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// "Editor" (really a read-only simple viewer) for generic data files
//
// See https://github.com/sagemathinc/cocalc/issues/2462

import { React, Rendered, useActions } from "../app-framework";
import { register_file_editor } from "../project-file";
import { Markdown } from "../r_misc";
import { webapp_client } from "../webapp-client";
import { keys, filename_extension } from "smc-util/misc";
import { COLORS } from "../../smc-util/theme";
import { Button, Well } from "../antd-bootstrap";

const hdf_file =
  "Hierarchical Data Format (HDF file) -- you can open this file using a Python or R library.";
const excel =
  'Microsoft Excel file -- Create an ["X11" file](https://doc.cocalc.com/x11.html) and open the "Calc" application.';
const microsoft_word =
  'Microsoft Word file -- Create an ["X11" file](https://doc.cocalc.com/x11.html) and open the "Writer" application.';
const microsoft_ppt =
  'Microsoft PowerPoint -- Create an ["X11" file](https://doc.cocalc.com/x11.html) and open the "Impress" application.';
const windows_executable =
  "Windows Executable -- you must download this program and run it on a computer";
const python_pickle =
  "Python Pickle -- use Python's [pickle module](https://docs.python.org/3/library/pickle.html) to read this file.s";
const medical_imaging =
  "This is a medical image file.  You cannot open it directly in CoCalc, but you might be able to use it from a Python library.";

// ext: markdown string.
const INFO = {
  p: python_pickle,
  pkl: python_pickle,
  pickle: python_pickle,
  exe: windows_executable,
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
    "This is a binary executable, which you can run in a Terminal by typing ./a.out.",
  dcm: medical_imaging,
  fif: medical_imaging,
  nii: medical_imaging,
} as const;

interface Props {
  project_id: string;
  path: string;
}

const DataGeneric: React.FC<Props> = React.memo((props: Props) => {
  const { project_id, path } = props;
  const ext = filename_extension(path);
  const src = webapp_client.project_client.read_file({ project_id, path });
  const project_actions = useActions({ project_id });

  function render_hint(): Rendered {
    const hint = INFO[ext];
    if (hint) {
      return <Markdown value={`**Hint**: ${hint}`} />;
    }
    return (
      <span style={{ color: COLORS.GRAY }}>
        You may be able to use this file from another program, for example, as a
        data file that is manipulated using a Jupyter notebook.
      </span>
    );
  }

  function render_docx() {
    if (ext !== "docx") return;
    return (
      <>
        <br />
        <div>
          It is possible to{" "}
          <Button onClick={() => project_actions?.open_word_document(path)}>
            convert this file to text
          </Button>{" "}
          .
        </div>
      </>
    );
  }

  return (
    <Well style={{ margin: "15px", fontSize: "12pt" }}>
      <h2>Data File</h2>
      CoCalc does not have a special viewer or editor for{" "}
      <a href={src} target="_blank">
        {path}
      </a>
      .{render_docx()}
      <br />
      <br />
      {render_hint()}
    </Well>
  );
});

register_file_editor({
  ext: keys(INFO),
  icon: "question",
  component: DataGeneric,
});
