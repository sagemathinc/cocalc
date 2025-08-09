import register from "./register";
import { Image } from "../image";
import { isSha1 } from "@cocalc/util/misc";

register("image/.*", 2, ({ message, value, type, actions }) => {
  let height: any = undefined;
  let width: any = undefined;
  message.get("metadata", []).forEach((value, key) => {
    if (key === "width") {
      width = value;
    } else if (key === "height") {
      height = value;
    } else {
      // sometimes metadata is e.g., "image/png":{width:, height:}
      if (value && value.forEach) {
        value.forEach((value: any, key: any) => {
          if (key === "width") {
            width = value;
          } else if (key === "height") {
            height = value;
          }
        });
      }
    }
  });

  let sha1: string | undefined = undefined;
  let val: string | undefined = undefined;

  if (typeof value === "string") {
    if (isSha1(value)) {
      // use a heuristic to see if it sha1.  TODO: maybe we shouldn't.
      sha1 = value;
    } else {
      val = value;
    }
  } else if (typeof value === "object") {
    val = value.get?.("value");
  }
  return (
    <Image
      actions={actions}
      type={type}
      sha1={sha1}
      value={val}
      width={width}
      height={height}
    />
  );
});
