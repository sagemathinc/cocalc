import Configuration from "./configuration";
import Cloud from "./cloud";
import { User } from "@cocalc/frontend/users";

export default function Description({ cloud, configuration, account_id }) {
  return (
    <div>
      <Configuration configuration={configuration} />
      <User account_id={account_id} />
      's compute server hosted on <Cloud height={15} cloud={cloud} />.{" "}
    </div>
  );
}
