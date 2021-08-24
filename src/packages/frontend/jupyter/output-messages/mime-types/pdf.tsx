import React from "react";
import register from "./register";
import { PDF } from "../pdf";

/* NOTE: I have absolutely no clue how to actually get this
   to appear in a Python notebook.   Using
      https://ipython.readthedocs.io/en/stable/api/generated/IPython.display.html#IPython.display.display_pdf
   just seems to do nothing.
   I wouldn't be surprised if this implementation below is
   broken...
*/
register("application/pdf", 6, ({ value, project_id }) => {
  if (project_id == null || value == null) {
    console.warn("PDF: project_id and value must be specified");
    return <pre>Invalid PDF output</pre>;
  }
  return <PDF value={value} project_id={project_id} />;
});
