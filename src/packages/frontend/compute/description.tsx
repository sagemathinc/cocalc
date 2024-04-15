import Configuration from "./configuration";
import Cloud from "./cloud";
import { User } from "@cocalc/frontend/users";
import type { Data, State } from "@cocalc/util/db-schema/compute-servers";
import { TimeAgo } from "@cocalc/frontend/components";
import { CopyToClipBoard } from "@cocalc/frontend/components";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { A } from "@cocalc/frontend/components/A";
import { Icon } from "@cocalc/frontend/components/icon";
import { Button, Input, Tooltip } from "antd";
import { useState } from "react";

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
          .{" "}
        </>
      )}
      <Configuration configuration={configuration} />
      {state == "running" && data != null && (
        <RuntimeInfo data={data} configuration={configuration} />
      )}
    </div>
  );
}

// TODO: "Stop then start the compute server for changes to ssh keys to take effect." is only
// because I haven't implemented something better through an api, similar to how sync works.
// It would not be hard.
function RuntimeInfo({ configuration, data }) {
  const [showToken, setShowToken] = useState<boolean>(false);
  return (
    <div style={{ display: "flex", textAlign: "center" }}>
      {data?.externalIp && (
        <Tooltip
          title={
            <>
              Setup{" "}
              <A href="https://doc.cocalc.com/account/ssh.html">
                ssh keys in your account or project
              </A>
              , then <code>ssh user@{data?.externalIp}</code> to connect to the
              remote compute server Docker container, and{" "}
              <code>ssh root@{data?.externalIp}</code> to connect to the host
              VM. Stop then start the compute server for changes to ssh keys to
              take effect.
            </>
          }
          placement="left"
        >
          <div style={{ flex: 0.7, display: "flex" }}>
            <CopyToClipBoard value={data?.externalIp} size="small" />
          </div>
        </Tooltip>
      )}
      <div style={{ flex: 1, display: "flex" }}>
        {data?.externalIp && configuration.dns ? (
          <DnsLink {...configuration} />
        ) : (
          <ExternalIpLink
            externalIp={data?.externalIp}
            authToken={configuration.authToken}
          />
        )}
        {configuration.authToken && (
          <div style={{ display: "flex", margin: "-1px 0 0 5px" }}>
            {!showToken && (
              <Button
                style={{ color: "#666" }}
                type="text"
                size="small"
                onClick={() => setShowToken(!showToken)}
              >
                Token...
              </Button>
            )}
            {showToken && (
              <Input.Password
                readOnly
                size="small"
                value={configuration.authToken}
                style={{ width: "125px", marginLeft: "5px", fontSize: "10px" }}
              />
            )}
          </div>
        )}
      </div>
      {data?.lastStartTimestamp && (
        <div style={{ flex: 0.7, textAlign: "center" }}>
          Started: <TimeAgo date={data?.lastStartTimestamp} />
        </div>
      )}
    </div>
  );
}

function DnsLink({ dns, authToken }) {
  const compute_servers_dns = useTypedRedux("customize", "compute_servers_dns");
  if (!compute_servers_dns || !dns) {
    return null;
  }
  const auth = getQuery(authToken);
  return (
    <A href={`https://${dns}.${compute_servers_dns}${auth}`}>
      <Icon name="external-link" /> https://{dns}.{compute_servers_dns}
    </A>
  );
}

function ExternalIpLink({ externalIp, authToken }) {
  if (!externalIp) {
    return null;
  }
  const auth = getQuery(authToken);
  return (
    <A href={`https://${externalIp}${auth}`}>
      <Icon name="external-link" /> https://{externalIp}
    </A>
  );
}

export function getQuery(authToken) {
  return authToken ? `?auth_token=${authToken}` : "";
}
