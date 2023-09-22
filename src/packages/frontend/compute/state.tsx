import { Icon } from "@cocalc/frontend/components";
import { STATE_INFO } from "@cocalc/util/db-schema/compute-servers";
import { Button, Popover } from "antd";
import getActions from "./action";
import { User } from "@cocalc/frontend/users";

export default function State({ state, id, editable, account_id }) {
  const { label, actions, icon, color } = STATE_INFO[state ?? "off"];
  console.log({ id, editable, state, color });

  return (
    <Popover
      title={<>Compute Server is {label}</>}
      content={() => {
        if (actions.length == 0) {
          return <div>Please wait for this to finish.</div>;
        } else {
          if (!editable) {
            return (
              <div>
                Only the owner of the compute server can change its state.
                <br />
                <User account_id={account_id} show_avatar />
              </div>
            );
          }
          return (
            <div>
              {getActions({ state, editable }).map((x) => (
                <Button style={{ marginRight: "5px" }}>{x}</Button>
              ))}
            </div>
          );
        }
        <div>You can {actions.join(", ")}</div>;
      }}
    >
      <span style={{ color }}>
        <Icon name={icon} /> {label}
      </span>
    </Popover>
  );
}
