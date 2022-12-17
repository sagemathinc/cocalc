import { render } from "./register";
import { A } from "@cocalc/frontend/components";

render({ type: "email_address" }, ({ field, obj, spec }) => {
  if (spec.type != "email_address") throw Error("bug");
  const address = obj[field];
  if (!address) return null;
  return (
    <A title="Click to send email" href={`mailto:${address}`}>
      {address}
    </A>
  );
});
