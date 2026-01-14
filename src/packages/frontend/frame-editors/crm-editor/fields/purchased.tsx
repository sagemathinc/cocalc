import { render } from "./register";
import { TimeAgo } from "@cocalc/frontend/components";

render({ type: "purchased" }, ({ field, obj }) => {
  const purchased = obj[field];
  if (!purchased) return null;
  return (
    <div>
      Purchased{" "}
      <TimeAgo date={purchased.time} />
    </div>
  );
});
