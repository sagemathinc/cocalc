import Configuration from "./configuration";
import Cloud from "./cloud";
import { User } from "@cocalc/frontend/users";
import type { Data, State } from "@cocalc/util/db-schema/compute-servers";
import { TimeAgo } from "@cocalc/frontend/components";
import { CopyToClipBoard } from "@cocalc/frontend/components";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { A } from "@cocalc/frontend/components/A";
import { Icon } from "@cocalc/frontend/components/icon";

interface Props {
  cloud?;
  configuration;
  account_id?: string;
  short?;
  data?: Data;
  state?: State;
}

export default function Description({
  cloud,
  configuration,
  data,
  account_id,
  short,
  state,
}: Props) {
  return (
    <div>
      {!short && (
        <>
          {account_id != null && (
            <>
              <User account_id={account_id} />
              's
            </>
          )}{" "}
          compute server{" "}
          {cloud != null && (
            <>
              hosted on <Cloud height={15} cloud={cloud} />
            </>
          )}
          .
        </>
      )}
      <Configuration configuration={configuration} />
      {state == "running" && data != null && (
        <RuntimeInfo data={data} configuration={configuration} />
      )}
    </div>
  );
}

function RuntimeInfo({ configuration, data }) {
  return (
    <div style={{ display: "flex", textAlign: "center" }}>
      {data?.externalIp && (
        <div style={{ flex: "1", display: "flex" }}>
          <CopyToClipBoard value={data?.externalIp} size="small" />
        </div>
      )}
      {data?.externalIp && configuration.dns && (
        <div style={{ flex: "1", display: "flex" }}>
          <DnsLink dns={configuration.dns} />
        </div>
      )}
      {data?.lastStartTimestamp && (
        <div style={{ flex: "1", textAlign: "center" }}>
          Started: <TimeAgo date={data?.lastStartTimestamp} />
        </div>
      )}
    </div>
  );
}

function DnsLink({ dns }) {
  const compute_servers_dns = useTypedRedux("customize", "compute_servers_dns");
  if (!compute_servers_dns) {
    return null;
  }
  return (
    <A href={`https://${dns}.${compute_servers_dns}`}>
      <Icon name="external-link" /> https://{dns}.{compute_servers_dns}
    </A>
  );
}
