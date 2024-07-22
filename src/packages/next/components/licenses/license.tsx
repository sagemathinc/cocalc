/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Popover, Progress } from "antd";
import { CSSProperties } from "react";

import { describe_quota } from "@cocalc/util/licenses/describe-quota";
import { capitalize, stripeAmount } from "@cocalc/util/misc";
import { Paragraph } from "components/misc";
import A from "components/misc/A";
import Copyable from "components/misc/copyable";
import Timestamp from "components/misc/timestamp";
import Loading from "components/share/loading";
import useAPI from "lib/hooks/api";
import { EditableDescription, EditableTitle } from "./editable-license";

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

interface DetailsProps {
  license_id: string; // the license id
  style?: CSSProperties; // style for the outer div
  condensed?: boolean; // if true, only show a brief run_limit x quota description
  type?: "cost" | "all";
  plan?: { amount: number; currency: string };
}

export function Details(props: DetailsProps) {
  const { license_id, style, type = "all", condensed = false, plan } = props;
  const { result, error } = useAPI("licenses/get-license", { license_id }, 3); // 3s cache
  if (error) {
    return <Alert type="error" message={error} />;
  }
  if (!result) {
    return <Loading />;
  }

  function title() {
    if (condensed) return;
    return (
      (result.title || result.is_manager) && (
        <Paragraph style={{ fontWeight: "bold", fontSize: "13pt" }}>
          {result.is_manager ? (
            <EditableTitle license_id={license_id} title={result.title} />
          ) : (
            "Title: " + result.title
          )}
        </Paragraph>
      )
    );
  }

  function description() {
    if (condensed) return;
    return (
      (result.description || result.is_manager) && (
        <Paragraph>
          {result.is_manager ? (
            <EditableDescription
              license_id={license_id}
              description={result.description}
            />
          ) : (
            "Description: " + result.description
          )}
        </Paragraph>
      )
    );
  }

  function managers() {
    if (condensed) return;
    return (
      result.managers != null && (
        <Paragraph>You are a manager of this license.</Paragraph>
      )
    );
  }

  function date() {
    if (condensed) return;
    return (
      <Paragraph>
        <DateRange {...result} />
      </Paragraph>
    );
  }

  function lastUsed() {
    if (condensed) return;
    return (
      result.last_used != null && (
        <Paragraph>
          Last used: <Timestamp epoch={result.last_used} />
        </Paragraph>
      )
    );
  }

  function quota() {
    return (
      <Paragraph>
        {condensed ? `${result.run_limit ?? 1} x` : "Quota:"}{" "}
        <Quota quota={result.quota} upgrades={result.upgrades} />
      </Paragraph>
    );
  }

  function runLimit() {
    if (condensed) return null;
    return (
      result.run_limit != null && (
        <Paragraph style={{ width: "100%", display: "flex" }}>
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
        </Paragraph>
      )
    );
  }

  function copyId() {
    if (condensed) return;
    return (
      result.is_manager && (
        <Copyable label="ID:" value={license_id} style={{ marginTop: "5px" }} />
      )
    );
  }

  // this is a special case (fallback), used in billing/subscriptions. It loads additional license data
  // and combines that with the amount and currency, already known from the plan it looks at.
  if (type === "cost") {
    if (plan == null) {
      return <></>;
    }
    return (
      <div style={style}>
        Cost:{" "}
        {stripeAmount(
          plan.amount,
          plan.currency,
          result.info?.purchased.quantity ?? 1
        )}
      </div>
    );
  }

  return (
    <div style={style}>
      {title()}
      {description()}
      {managers()}
      {date()}
      {lastUsed()}
      {quota()}
      {runLimit()}
      {copyId()}
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
  const isExpired = expires && expires < Date.now();
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
