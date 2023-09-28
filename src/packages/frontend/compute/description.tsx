import Configuration from "./configuration";
import Cloud from "./cloud";
import { User } from "@cocalc/frontend/users";
import type { Data } from "@cocalc/util/db-schema/compute-servers";
import { TimeAgo } from "@cocalc/frontend/components";
import { CopyToClipBoard } from "@cocalc/frontend/components";

interface Props {
  cloud;
  configuration;
  account_id: string;
  short?;
  data?: Data;
}

export default function Description({
  cloud,
  configuration,
  data,
  account_id,
  short,
}: Props) {
  return (
    <div>
      {!short && (
        <>
          <User account_id={account_id} />
          's compute server hosted on <Cloud height={15} cloud={cloud} />.
        </>
      )}
      <Configuration configuration={configuration} />
      <div style={{ display: "flex", textAlign: "center" }}>
        {data?.externalIp && (
          <div style={{ flex: "1", display: "flex" }}>
            <CopyToClipBoard
              value={data?.externalIp}
              size="small"
            />
          </div>
        )}
        {data?.lastStartTimestamp && (
          <div style={{ flex: "1", textAlign: "center" }}>
            Started:{" "}
            <TimeAgo date={data?.lastStartTimestamp} />
          </div>
        )}
      </div>
    </div>
  );
}
