import { register } from "./register";
import CopyToClipBoard from "@cocalc/frontend/components/copy-to-clipboard";

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
