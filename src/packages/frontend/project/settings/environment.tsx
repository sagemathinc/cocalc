/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* environment.tsx -- this is just meant to be a quick easy UI for
people to configure extra environment variables for a particular
project.  We will likely spend more time on a more sophisticated
UI later.

NOTE: we haven't implemented deleting of keys in JSONB maps for
the database yet, so we complicate the code below by making *empty*
values be treated as deleted.
*/
import { Alert, Button } from "antd";
import jsonic from "jsonic";
import { useIntl } from "react-intl";

import {
  React,
  useActions,
  useIsMountedRef,
  useMemo,
  useRedux,
  useState,
} from "@cocalc/frontend/app-framework";
import { ErrorDisplay, Gap, SettingBox } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";

export const ENV_VARS_ICON = "bars";
interface Props {
  project_id: string;
  mode?: "project" | "flyout";
}

function process_env(env): object {
  if (typeof env != "object") return {};
  const obj: any = {};
  for (const key in env) {
    const v = `${env[key]}`;
    if (v != "") {
      obj[key] = v;
    }
  }
  return obj;
}

function to_json(env): string {
  return JSON.stringify(process_env(env), null, 2);
}

export const Environment: React.FC<Props> = ({
  project_id,
  mode = "project",
}: Props) => {
  const isFlyout = mode === "flyout";
  const intl = useIntl();
  const projectLabelLower = intl.formatMessage(labels.project).toLowerCase();
  const env = useRedux(["projects", "project_map", project_id, "env"]);
  const [focused, set_focused] = useState<boolean>(false);
  const [editing, set_editing] = useState<string>(to_json(env?.toJS()));
  const [error, set_error] = useState<string>("");
  const actions = useActions({ project_id });
  const is_mounted_ref = useIsMountedRef();
  const [saving, set_saving] = useState<boolean>(false);
  const disabled = useMemo(() => {
    return to_json(env?.toJS()) == editing;
  }, [env, editing]);

  async function save(): Promise<void> {
    let new_env;
    try {
      new_env = jsonic(editing);
    } catch (err) {
      set_error(err.toString());
      return;
    }
    set_editing(to_json(process_env(new_env)));
    set_saving(true);
    await actions?.set_environment(new_env);
    if (!is_mounted_ref.current) return;
    set_saving(false);
  }
  const instructions = focused ? (
    <>
      Enter custom environment variables as a JSON map from string to string,
      e.g., <code>{'{"foo":"bar","x":"y"}'}</code>. Unlike environment variables
      in .bashrc, these will be available to anything that runs in your{" "}
      {projectLabelLower} (e.g., Jupyter kernels). Delete a variable by setting
      it to the empty string. Restart your {projectLabelLower} for these changes
      to take effect.
      <br />
      Note: special care is taken for the <code>PATH</code> variable: your
      values are prepended to the existing <code>PATH</code>, unless your value
      contains <code>$PATH</code>, in which case the existing value of{" "}
      <code>PATH</code> is inserted, where <code>$PATH</code> is found.
    </>
  ) : (
    ""
  );

  function renderBody() {
    return (
      <div style={{ padding: "10px" }}>
        {error != "" ? <ErrorDisplay banner error={error} /> : undefined}
        <textarea
          spellCheck="false"
          onFocus={() => set_focused(true)}
          onBlur={() => set_focused(false)}
          disabled={saving}
          className="form-control"
          rows={4}
          style={{ width: "100%" }}
          value={editing}
          onChange={(event) => {
            set_editing(event.target.value);
            set_error("");
          }}
        />
        <br />
        <Button
          disabled={disabled}
          onClick={() => set_editing(to_json(env?.toJS()))}
        >
          {intl.formatMessage(labels.cancel)}
        </Button>
        <Gap />
        <Button disabled={disabled} onClick={save}>
          {saving ? "Saving..." : disabled ? "Saved" : "Save..."}
        </Button>
      </div>
    );
  }

  if (isFlyout) {
    return (
      <>
        {renderBody()}
        {instructions ? (
          <Alert
            style={{ marginTop: "10px" }}
            banner
            type="info"
            showIcon={false}
            message={instructions}
          />
        ) : undefined}
      </>
    );
  } else {
    return (
      <SettingBox title="Custom Environment Variables" icon={ENV_VARS_ICON}>
        {renderBody()}
        <br />
        {instructions}
      </SettingBox>
    );
  }
};
