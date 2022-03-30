import useAPI from "lib/hooks/api";
import { Alert, Popover, Progress } from "antd";
import { CSSProperties } from "react";
import Loading from "components/share/loading";
import { capitalize } from "@cocalc/util/misc";
import { EditableDescription, EditableTitle } from "./editable-license";
import Timestamp from "components/misc/timestamp";
import Copyable from "components/misc/copyable";
import A from "components/misc/A";
import { describe_quota } from "@cocalc/util/db-schema/site-licenses";

interface Props {
  license_id: string;
  contrib?: { [project_id: string]: object };
  style?: CSSProperties;
}

export default function License({ license_id, style }: Props) {
  // TODO: do something with contrib
  return (
    <Popover
      content={() => <Details license_id={license_id} />}
      title={license_id}
      mouseEnterDelay={0.5}
    >
      <A
        style={{ cursor: "pointer", fontFamily: "monospace", ...style }}
        href={`/licenses/how-used?license_id=${license_id}`}
      >
        {license_id}
      </A>
    </Popover>
  );
}

/*
{
  "id": "cad2fe88-29d7-4f4e-987c-a3ae6143a25b",
  "title": "different business license for specific time",
  "description": "",
  "expires": 1642799517638,
  "activates": 1640121117638,
  "last_used": null,
  "managers": [
    "93620c6e-324a-4217-a60e-2ac436953174"
  ],
  "upgrades": null,
  "quota": {
    "cpu": 1,
    "ram": 1,
    "disk": 1,
    "user": "business",
    "member": true,
    "dedicated_cpu": 0,
    "dedicated_ram": 0,
    "always_running": true
  },
  "run_limit": 3,
  is_manager:true,
  number_running:2
}
*/

export function Details({
  license_id,
}: {
  license_id: string;
  style?: CSSProperties;
}) {
  const { result, error } = useAPI("licenses/get-license", { license_id }, 3); // 3s cache
  if (error) {
    return <Alert type="error" message={error} />;
  }
  if (!result) {
    return <Loading />;
  }
  return (
    <div>
      {(result.title || result.is_manager) && (
        <div style={{ fontWeight: "bold", fontSize: "13pt" }}>
          {result.is_manager ? (
            <EditableTitle license_id={license_id} title={result.title} />
          ) : (
            "Title: " + result.title
          )}
        </div>
      )}
      {(result.description || result.is_manager) && (
        <div>
          {result.is_manager ? (
            <EditableDescription
              license_id={license_id}
              description={result.description}
            />
          ) : (
            "Description: " + result.description
          )}
        </div>
      )}
      {result.managers != null && <div>You are a manager of this license.</div>}
      <div>
        <DateRange {...result} />
      </div>
      {result.last_used != null && (
        <div>
          Last used: <Timestamp epoch={result.last_used} />
        </div>
      )}
      <div>
        Quota: <Quota quota={result.quota} upgrades={result.upgrades} />
      </div>
      {result.run_limit != null && (
        <div style={{ width: "100%", display: "flex" }}>
          Run limit: {result.run_limit}
          {result.number_running != null
            ? `; Currently running: ${result.number_running}`
            : ""}
          {result.run_limit && result.number_running != null && (
            <Progress
              style={{
                marginLeft: "15px",
                flex: 1,
              }}
              percent={Math.round(
                (result.number_running / result.run_limit) * 100
              )}
            />
          )}
        </div>
      )}
      {result.is_manager && (
        <Copyable label="ID:" text={license_id} style={{ marginTop: "5px" }} />
      )}
    </div>
  );
}

export function Quota({ quota, upgrades }: { quota?: any; upgrades?: any }) {
  if (quota == null) {
    if (upgrades == null) {
      return <></>;
    } else {
      // These are very old, and we just do a little bit to display
      // something valid.
      quota = {
        cpu: upgrades.cores,
        ram: upgrades.memory / 1000,
      };
    }
  }

  const info = describe_quota(quota, true);
  return <span>{info}</span>;
}

export function DateRange({ activates, expires, info }) {
  const isExpired = expires && expires < new Date().valueOf();
  const sub = info?.purchased?.subscription;
  if (sub && sub != "no") {
    return (
      <span>
        {capitalize(sub)} subscription
        {isExpired && (
          <>
            <b> Expired </b> <Timestamp epoch={expires} absolute dateOnly />
          </>
        )}
      </span>
    );
  }
  const dates = (
    <>
      <Timestamp epoch={activates} absolute dateOnly /> &ndash;{" "}
      <Timestamp epoch={expires} absolute dateOnly />
    </>
  );
  return (
    <span>
      {isExpired ? (
        <>
          <b>Expired </b>(was valid {dates})
        </>
      ) : (
        <>Valid: {dates}</>
      )}
    </span>
  );
}
