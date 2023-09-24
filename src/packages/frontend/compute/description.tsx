import Configuration from "./configuration";
import Cloud from "./cloud";
import { User } from "@cocalc/frontend/users";

interface Props {
  cloud;
  configuration;
  account_id: string;
  short?;
}

export default function Description({
  cloud,
  configuration,
  account_id,
  short,
}: Props) {
  return (
    <div>
      <Configuration configuration={configuration} />
      {!short && (
        <>
          <User account_id={account_id} />
          's compute server hosted on <Cloud height={15} cloud={cloud} />.
        </>
      )}
    </div>
  );
}
