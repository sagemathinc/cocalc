import { register } from "./register";
import { CopyToClipBoard } from "@cocalc/frontend/components";

// TODO: editable = true will have a upload and crop option...
// Will need to specify where the image goes: is it a blob reference
// or a base64 encoded data.

register({ type: "uuid", editable: false }, ({ field, obj }) => {
  const src = obj[field];
  if (!src) return null;
  return (
    <CopyToClipBoard
      value={src}
      style={{ width: "200px", marginRight: "15px" }}
    />
  );
});
