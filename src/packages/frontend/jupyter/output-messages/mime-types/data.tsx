import React from "react";
import { DataProps, hasHandler, getHandler, getPriority } from "./register";
import { all_fields_equal as allFieldsEqual } from "@cocalc/util/misc";
import useJupyterContext from "@cocalc/frontend/jupyter/jupyter-context";
import type { KernelSpec } from "@cocalc/frontend/jupyter/nbviewer/parse";

function shouldMemoize(prev, next) {
  return (
    prev.message.equals(next.message) &&
    allFieldsEqual(prev, next, ["project_id", "directory", "trust"])
  );
}

export const Data: React.FC<DataProps> = React.memo((props) => {
  const { kernelspec, trust } = useJupyterContext();
  const data = props.message.get("data");
  if (data == null || typeof data.forEach != "function") {
    return null;
  }

  const types = data.keySeq().toJS();
  let type: string | undefined = undefined;
  if (!trust) {
    // When viewing a non-trusted notebook we do some heuristics to try to provide a better
    // experience for users, since what is useful to display depends a lot on the kernel.
    type = getUntrustedType(kernelspec, types);
  }
  if (type == null) {
    type = getTypeToRender(types);
  }
  if (type == null) throw Error("bug");
  const H = getHandler(type);
  return <H type={type} value={data.get(type)} data={data} {...props} />;
}, shouldMemoize);

function getUntrustedType(kernelspec: KernelSpec, types: string[]) {
  if (kernelspec.language == "r" || kernelspec.language == "julia") {
    // Using an R kernel with XSS prevention -- prefer image, then plain text,
    // due to unfriendly markdown *and* complicated html that XSS mangles too much.
    // The output from markdown say is really weird, e.g., for c(1,2) it is "1. 1\n2. 2\n".
    for (const type of types) {
      if (type.startsWith("image")) {
        return type;
      }
    }
    if (types.includes("text/plain")) {
      // untrusted so we use text/plain.  This will happen on share server and in cocalc
      // until the user trusts, in which case it will switch to html with no sanitization
      // and that looks good.  HTML with sanitization is really bad, e.g., because the
      // style for c(1,2,3) just looks like an enumerated list.
      return "text/plain";
    }
  }
  /* For Sage, the text/latex output is much more useful the text/html, if available.
  In Sage the show command outputs this, and text/html is useless, text/latex is nice, and text/plain is ok but just plain.
  I don't think anything in Sage outputs useless text/latex, so we use that in untrusted settings when both are available.
      "text/html": [
       "<html>\\[\\newcommand{\\Bold}[1]{\\mathbf{#1}}x^{2}\\]</html>"
      ],
      "text/latex": [
       "$$\\newcommand{\\Bold}[1]{\\mathbf{#1}}x^{2}$$"
      ],
  */
  if (kernelspec.language?.startsWith("sage")) {
    if (types.includes("text/html") && types.includes("text/latex")) {
      return "text/latex";
    }
  }
}

function getTypeToRender(types: string[]): string {
  // "Best" is just the first one otherwise?  Another heuristic seems to be
  // that text/html is better than image/*.
  const x: { priority: number; type: string }[] = [];
  for (const type of types) {
    if (hasHandler(type)) {
      x.push({ priority: getPriority(type), type });
    }
  }
  if (x.length == 0) return "unknown";
  x.sort((a, b) => b.priority - a.priority);
  return x[0].type;
}
