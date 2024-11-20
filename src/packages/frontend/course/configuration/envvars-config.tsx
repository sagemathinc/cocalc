/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// This configures the datastore configuration for student and the shared project.
// basically: if it is "true", the datastore config of the teacher project is looked up when the project starts
// and used to configure it in read-only mode. In the future, a natural extension is to explicitly list the datastores
// that should be inherited, or configure the readonly property. but for now, it's just true or false.

import { redux, useTypedRedux, TypedMap } from "@cocalc/frontend/app-framework";
import { useEffect, useState } from "react";
import { ConfigurationActions } from "./actions";
import { Card, Typography, Switch, Form, Button } from "antd";
import { EnvVars, EnvVarsRecord } from "@cocalc/frontend/projects/actions";
import {
  KUCALC_COCALC_COM,
  KUCALC_ON_PREMISES,
} from "@cocalc/util/db-schema/site-defaults";
import { Icon } from "@cocalc/frontend/components";
import { ENV_VARS_ICON } from "@cocalc/frontend/project/settings/environment";

const ENVVARS_DEFAULT = false;

interface Props {
  project_id: string;
  actions: ConfigurationActions;
  envvars?: EnvVars | TypedMap<EnvVarsRecord>;
  close?: Function;
}

function normalizeTypeAndValue(
  envvars: EnvVars | TypedMap<EnvVarsRecord>,
): NonNullable<EnvVars> {
  if (typeof (envvars as any)?.inherit === "boolean") {
    return envvars as NonNullable<EnvVars>;
  }
  if (typeof (envvars as any)?.toJS === "function") {
    return normalizeTypeAndValue((envvars as TypedMap<EnvVarsRecord>).toJS());
  }
  return { inherit: ENVVARS_DEFAULT };
}

export function EnvironmentVariablesConfig({
  actions,
  envvars,
  close,
  project_id,
}: Props) {
  const envvars1 = normalizeTypeAndValue(envvars);
  const customize_kucalc = useTypedRedux("customize", "kucalc");
  const [needSave, setNeedSave] = useState<boolean>(false);

  // By default, we inherit the environment variables.
  // As of this, we only support true/false.
  const inherit = envvars1.inherit ?? ENVVARS_DEFAULT;
  const [nextVal, setNextVal] = useState<boolean>(inherit);

  useEffect(() => {
    setNeedSave(nextVal != inherit);
  }, [nextVal, inherit]);

  useEffect(() => {
    // needed because of realtime collaboration, multiple frames, modal, etc!
    setNextVal(inherit);
  }, [inherit]);

  // this selector only make sense for cocalc.com and cocalc-onprem
  if (
    customize_kucalc !== KUCALC_COCALC_COM &&
    customize_kucalc !== KUCALC_ON_PREMISES
  )
    return null;

  function toggle() {
    return (
      <Form layout="inline">
        <Form.Item label="Inherit settings:" style={{ marginBottom: 0 }}>
          <Switch checked={nextVal} onChange={(val) => setNextVal(val)} />
        </Form.Item>
        <Form.Item>
          <Button
            disabled={!needSave}
            type={needSave ? "primary" : "default"}
            onClick={() => {
              actions.set_envvars(nextVal);
              close?.();
            }}
          >
            Save
          </Button>
        </Form.Item>
      </Form>
    );
  }

  return (
    <Card
      title={
        <>
          <Icon name={ENV_VARS_ICON} /> Inherit Environment Variables
        </>
      }
    >
      <p>
        If enabled, all student projects inherit the{" "}
        <Typography.Text strong>environment variables</Typography.Text> of this
        instructor project.
      </p>
      <p>
        To configure them, please check{" "}
        <a
          onClick={() => {
            redux.getProjectActions(project_id).set_active_tab("settings");
            close?.();
          }}
        >
          this project's settings
        </a>{" "}
        for more details. Changes to the configuration of this project will only
        be reflected after the next start of a student project.
      </p>
      <p>
        Note: environment variables from the instructor project overwrite
        anything configured in the student project, as you can confirm by
        looking at the settings of the student project after making this change
        and configuring all student projects.
      </p>
      {toggle()}
    </Card>
  );
}
