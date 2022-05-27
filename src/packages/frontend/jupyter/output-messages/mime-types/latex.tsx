/*
Note -- as illustrated at https://github.com/sagemathinc/cocalc/issues/5925
there are Jupyter kernels, e.g., R and Julia, that generate text/latex that is
only meant to be used by nbconvert on the backend as part of a full latex compiler
pipeline.  In particular, it can't be rendered with a live

I searched the nbformat docs and can find zero definitions or direction as
to what text/latex is supposed to be.  I'm thus giving this a very low priority,
and if it ever is the only format, it'll get rendered using our markdown processor,
which at least does math formulas.
*/

import register from "./register";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

register("text/latex", 3.5, ({ value }) => {
  return (
    <div style={{ margin: "5px 0" }}>
      <StaticMarkdown value={value} />
    </div>
  );
});
