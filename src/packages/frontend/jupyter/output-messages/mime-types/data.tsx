import React from "react";
import { DataProps, hasHandler, getHandler, getPriority } from "./register";
import { all_fields_equal as allFieldsEqual } from "@cocalc/util/misc";
import useJupyterContext from "@cocalc/frontend/jupyter/jupyter-context";

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
  let type: string | undefined;
  if (kernelspec?.language === "r") {
    // very special case -- using an R kernel inside nbviewer (so with strong XSS prevention) -- prefer image, then plain text,
    // due to unfriendly markdown *and* complicated html that XSS mangles too much.
    // The output from markdown say is really weird, e.g., for c(1,2) it is "1. 1\n2. 2\n".
    for (const x of types) {
      if (x.startsWith("image")) {
        type = x;
        break;
      }
    }
    if (type === undefined && !trust && types.includes("text/plain")) {
      // untrusted so we use text/plain.  This will happen on share server and in cocalc
      // until the user trusts, in which case it will switch to html with no sanitization
      // and that looks good.  HTML with sanitization is really bad, e.g., because the
      // style for c(1,2,3) just looks like an enumerated list.
      type = "text/plain";
    }
    if (type == null) {
      type = getTypeToRender(types);
    }
  } else {
    type = getTypeToRender(types);
  }
  if (type == null) throw Error("bug");
  const H = getHandler(type);
  return <H type={type} value={data.get(type)} data={data} {...props} />;
}, shouldMemoize);

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
