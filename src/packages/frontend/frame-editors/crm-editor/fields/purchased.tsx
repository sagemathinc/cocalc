import { register } from "./register";
import { TimeAgo } from "@cocalc/frontend/components";

register({ type: "purchased" }, ({ field, obj }) => {
  const purchased = obj[field];
  if (!purchased) return null;
  return (
    <div>
      License id: {purchased.license_id}
      <br />
      <TimeAgo date={purchased.time} />
    </div>
  );
});
