/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Popconfirm } from "antd";
import { useState } from "react";

import { redux, useRedux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { SiteName } from "@cocalc/frontend/customize";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";

interface Props {
  project_id: string;
}

export default function FirstSteps({ project_id }: Props) {
  const [starting, setStarting] = useState<boolean>(false);
  const kucalc = useTypedRedux("customize", "kucalc");
  const first_steps = useRedux(["account", "other_settings", "first_steps"]);
  if (!first_steps) return null;
  // we only show this on the main SaaS site
  if (kucalc !== KUCALC_COCALC_COM) return null;
  return (
    <div
      style={{
        padding: "5px 15px",
        color: "#666",
        fontSize: "11pt",
        background: "#fafafa",
        borderBottom: "1px solid #eee",
      }}
    >
      <Icon
        name={starting ? "cocalc-ring" : "cube"}
        spin={starting}
        style={{ marginRight: "15px" }}
      />
      <span>
        Are you new to <SiteName />?
      </span>{" "}
      <span>
        <a
          onClick={async () => {
            if (starting) return;
            try {
              setStarting(true);
              await redux.getActions("projects").start_project(project_id);
              // try to run the new cc-first-steps script; if that fails (e.g. old already running project),
              // try to copy from the library.
              try {
                await webapp_client.project_client.exec({
                  command: "cc-first-steps",
                  project_id,
                });
                await redux.getProjectActions(project_id).open_file({
                  path: "first-steps/first-steps.tasks",
                  foreground: true,
                });
              } catch (error) {
                console.log(
                  "cc-first-steps failed, so falling back to library"
                );
                await redux
                  .getProjectActions(project_id)
                  .copy_from_library({ entry: "first_steps" });
              }
            } catch (error) {
              console.warn("error getting first steps", error);
            } finally {
              setStarting(false);
            }
          }}
        >
          Start the <strong>First Steps Guide!</strong>
        </a>
      </span>{" "}
      <span>or</span>{" "}
      <span>
        <Popconfirm
          title="Don't Show First Steps Banner"
          description={
            <span>
              You can always re-enable First Steps via "Offer the First Steps
              guide" in{" "}
              <a
                onClick={() => {
                  redux.getActions("page").set_active_tab("account");
                  redux.getActions("account").set_active_tab("account");
                }}
              >
                Account Preferences
              </a>
              .
            </span>
          }
          onConfirm={() => {
            redux
              .getTable("account")
              .set({ other_settings: { first_steps: false } });
          }}
          okText="Dismiss message"
          cancelText="No"
        >
          <a>dismiss this message</a>.
        </Popconfirm>
      </span>
    </div>
  );
}
