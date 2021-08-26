import register from "./register";
import { Image } from "../image";

const SHA1_REGEXP = /^[a-f0-9]{40}$/;
function isSha1(s: string): boolean {
  return s.length === 40 && !!s.match(SHA1_REGEXP);
}

register("image/.*", 2, ({ project_id, message, value, type }) => {
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
      project_id={project_id}
      type={type}
      sha1={sha1}
      value={val}
      width={width}
      height={height}
    />
  );
});
