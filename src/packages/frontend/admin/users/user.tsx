/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Display of basic information about a user, with link to get more information about that user.
*/

import { useState } from "react";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { capitalize } from "@cocalc/util/misc";
import { Card, Space, Tag } from "antd";
import type { User } from "@cocalc/frontend/frame-editors/generic/client";
import { Projects } from "./projects";
import { Impersonate } from "./impersonate";
import { PasswordReset } from "./password-reset";
import { Ban } from "./ban";
import PayAsYouGoMinBalance from "@cocalc/frontend/frame-editors/crm-editor/users/pay-as-you-go-min-balance";
import { PurchasesButton } from "@cocalc/frontend/purchases/purchases";
import { PaymentsButton } from "@cocalc/frontend/purchases/payments";
import { CreatePaymentButton } from "./create-payment";
import { CopyToClipBoard } from "@cocalc/frontend/components";
import Money from "./money";

interface State {
  projects: boolean;
  purchases: boolean;
  activity: boolean;
  impersonate: boolean;
  password: boolean;
  ban: boolean;
}

type More =
  | "projects"
  | "purchases"
  | "activity"
  | "impersonate"
  | "password"
  | "ban";

export function UserResult({
  first_name,
  last_name,
  email_address,
  created,
  last_active,
  account_id,
  banned,
}: User) {
  const [details, setDetails] = useState<boolean>(false);
  const [state, setState] = useState<State>({
    projects: false,
    purchases: false,
    activity: false,
    impersonate: false,
    password: false,
    ban: false,
  });

  const renderCreated = () => {
    if (!created) {
      return <span>ancient times</span>;
    }
    return <TimeAgo date={created} />;
  };

  const renderLastActive = () => {
    if (!last_active) {
      return <span>never</span>;
    }
    return <TimeAgo date={last_active} />;
  };

  const renderMoreLink = (name: More) => {
    return (
      <Tag.CheckableTag
        style={{ fontSize: "11pt" }}
        checked={state[name]}
        onChange={() => setState({ ...state, [name]: !state[name] })}
      >
        {capitalize(name)}
      </Tag.CheckableTag>
    );
  };

  return (
    <Card
      style={{ margin: "15px 0", background: "#fafafa" }}
      styles={{
        body: { padding: "0 24px" },
        title: { padding: "0" },
      }}
      title={
        <div
          style={{ cursor: "pointer" }}
          onClick={details ? undefined : () => setDetails(true)}
        >
          <Icon
            onClick={() => setDetails(!details)}
            name={details ? "minus-square" : "plus-square"}
            style={{ marginRight: "15px" }}
          />
          <div style={{ float: "right", color: "#666" }}>
            Active {renderLastActive()} (Created {renderCreated()})
          </div>
          <Space style={{ color: "#666" }}>
            {first_name} {last_name}{" "}
            {email_address ? (
              <CopyToClipBoard
                style={{ color: "#666" }}
                value={email_address}
              />
            ) : (
              "NO Email"
            )}
          </Space>
        </div>
      }
    >
      {details && (
        <div>
          <div style={{ float: "right" }}>
            <CopyToClipBoard
              copyTip={"Copied account_id!"}
              style={{ color: "#666" }}
              value={account_id}
            />
            {banned && (
              <div
                style={{
                  fontSize: "10pt",
                  color: "white",
                  paddingLeft: "5px",
                  background: "red",
                }}
              >
                BANNED
              </div>
            )}
          </div>
          <Space style={{ marginTop: "5px" }}>
            {renderMoreLink("impersonate")}
            {renderMoreLink("password")}
            {renderMoreLink("ban")}
            {renderMoreLink("projects")}
            {renderMoreLink("purchases")}
          </Space>
          {state.impersonate && (
            <Impersonate
              account_id={account_id}
              first_name={first_name ?? ""}
              last_name={last_name ?? ""}
            />
          )}
          {state.password && email_address && (
            <Card title="Password">
              <PasswordReset
                account_id={account_id}
                email_address={email_address}
              />
            </Card>
          )}
          {state.ban && (
            <Card
              title={
                <>
                  Ban {first_name} {last_name} {email_address}
                </>
              }
            >
              <Ban
                account_id={account_id}
                banned={banned}
                name={`${first_name} ${last_name} ${email_address}`}
              />
            </Card>
          )}
          {state.projects && (
            <Projects
              account_id={account_id}
              title={`Recently active projects that ${first_name} ${last_name} collaborates on`}
            />
          )}
          {state.purchases && (
            <Card title="Purchases">
              <div style={{ margin: "15px 0" }}>
                <Money account_id={account_id} />
                <div style={{ height: "15px" }} />
                <PayAsYouGoMinBalance account_id={account_id} />
                <div style={{ height: "15px" }} />
                <PurchasesButton account_id={account_id} />
                <div style={{ height: "15px" }} />
                <PaymentsButton account_id={account_id} />
                <div style={{ height: "15px" }} />
                <CreatePaymentButton account_id={account_id} />
              </div>
            </Card>
          )}
        </div>
      )}
    </Card>
  );
}

export default UserResult;
