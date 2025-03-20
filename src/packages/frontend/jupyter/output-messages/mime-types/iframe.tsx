import register from "./register";
import IFrame from "../iframe";

register("iframe", 7, ({ id, value, index, trust, actions }) => {
  if (value == null) {
    return <pre>iframe must specify sha1 value</pre>;
  }
  return (
    <IFrame
      cacheId={id}
      actions={actions}
      sha1={value}
      index={index}
      trust={trust}
    />
  );
});
