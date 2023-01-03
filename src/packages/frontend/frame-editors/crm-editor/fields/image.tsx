import { render } from "./register";
import { Image } from "antd";

// TODO: editable = true will have a upload and crop option...
// Will need to specify where the image goes: is it a blob reference
// or a base64 encoded data.

render({ type: "image", editable: false }, ({ field, obj }) => {
  const src = obj[field];
  if (!src) return null;
  return (
    <div style={{ textAlign: "center" }}>
      <Image src={src} />
    </div>
  );
});
