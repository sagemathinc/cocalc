import { render } from "./register";
import CopyToClipBoard from "@cocalc/frontend/components/copy-to-clipboard";

render({ type: "uuid", editable: false }, ({ field, obj, viewOnly }) => {
  console.log("uuid renderer viewOnly = ", viewOnly);
  const src = obj[field];
  if (!src) return null;
  if (viewOnly) {
    return (
      <div
        style={{
          textOverflow: "ellipsis",
          overflow: "hidden",
          fontFamily: "monospace",
          maxWidth: "100%",
          whiteSpace: "nowrap",
        }}
      >
        {src}
      </div>
    );
  }
  return <CopyToClipBoard value={src} />;
});
