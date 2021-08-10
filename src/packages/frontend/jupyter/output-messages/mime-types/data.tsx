import React from "react";
import { DataProps, hasHandler, getHandler } from "./register";
import { all_fields_equal as allFieldsEqual } from "@cocalc/util/misc";

function shouldMemoize(prev, next) {
  return (
    prev.message.equals(next.message) &&
    allFieldsEqual(prev, next, ["project_id", "directory", "trust"])
  );
}

export const Data: React.FC<DataProps> = React.memo((props) => {
  const data = props.message.get("data");
  if (data == null || typeof data.forEach != "function") {
    return null;
  }

  const type = getTypeToRender(data.keySeq().toJS());
  const H = getHandler(type);
  return <H type={type} value={data.get(type)} data={data} {...props} />;
}, shouldMemoize);

function getTypeToRender(types: string[]): string {
  if (types.includes("text/plain")) {
    // Note about multiple representations; we should only render the "best one".
    // For us the algorithm should be: if the options are (a) anything
    // we know how to render, and (b) text/plain, then render the first
    // thing we know how to render that is not text/plain.
    // Probably much more can be done -- what exactly does JupyterLab do?
    for (const type of types) {
      if (type != "text/plain" && hasHandler(type)) {
        return type;
      }
    }
  }
  // "Best" is just the first one otherwise...
  for (const type of types) {
    if (hasHandler(type)) {
      return type;
    }
  }
  return "uknown";
}
