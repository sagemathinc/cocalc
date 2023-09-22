import { Icon } from "@cocalc/frontend/components";
import { capitalize } from "@cocalc/util/misc";

export default function State({ state, id, editable }) {
  console.log({ id, editable });
  return (
    <div>
      <Icon name="play" /> {capitalize(state ?? "Off")}
    </div>
  );
}
