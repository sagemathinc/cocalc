import useAPI from "lib/hooks/api";
import { Alert, Popover } from "antd";
import { CSSProperties, ReactNode } from "react";
import Loading from "components/share/loading";
import { capitalize, plural } from "@cocalc/util/misc";
import { r_join } from "@cocalc/frontend/components/r_join";
import { EditableDescription, EditableTitle } from "./editable-license";

interface Props {
  license_id: string;
  contrib?: { [project_id: string]: object };
}

export default function License({ license_id }: Props) {
  // TODO: do something with contrib
  return (
    <Popover
      content={() => <Details license_id={license_id} />}
      title={license_id}
    >
      <span style={{ fontFamily: "monospace" }}>{license_id}</span>
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
  "run_limit": 3
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
      {result.is_manager && (
        <div>
          License id:{" "}
          <span style={{ fontFamily: "monospace" }}>{license_id}</span>
        </div>
      )}
      {result.managers != null && <div>You are a manager of this license.</div>}
      {result.expires != null && (
        <div>Expires: {new Date(result.expires).toLocaleString()}</div>
      )}
      {result.activates != null && (
        <div>Activates: {new Date(result.activates).toLocaleString()}</div>
      )}
      {result.last_used != null && (
        <div>Last used: {new Date(result.last_used).toLocaleString()}</div>
      )}
      {result.quota != null && (
        <div>
          <Quota quota={result.quota} />
        </div>
      )}
    </div>
  );
}

export function Quota({ quota }) {
  const v: ReactNode[] = [];
  if (quota.user) {
    v.push(capitalize(quota.user));
  }
  if (quota.cpu) {
    v.push(`${quota.cpu} ${plural(quota.cpu, "shared CPU")}`);
  }
  if (quota.dedicated_cpu) {
    v.push(
      `${quota.dedicated_cpu} ${plural(quota.dedicated_cpu, "dedicated CPU")}`
    );
  }
  if (quota.ram) {
    v.push(`${quota.ram} ${plural(quota.ram, "GB")} shared RAM`);
  }
  if (quota.dedicated_ram) {
    v.push(
      `${quota.dedicated_ram} ${plural(
        quota.dedicated_ram,
        "GB"
      )} dedicated RAM`
    );
  }
  if (quota.disk) {
    v.push(`${quota.disk} ${plural(quota.disk, "GB")} disk`);
  }
  if (quota.member) {
    v.push("member hosting");
  }
  if (quota.always_running) {
    v.push("always running");
  }
  return <span>{r_join(v)}</span>;
}
