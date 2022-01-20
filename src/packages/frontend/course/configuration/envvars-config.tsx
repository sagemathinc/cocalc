/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This configures the datastore configuration for student and the shared project.
// basically: if it is "true", the datastore config of the teacher project is looked up when the project starts
// and used to configure it in read-only mode. In the future, a natural extension is to explicitly list the datastores
// that should be inherited, or configure the readonly property. but for now, it's just true or false.

import { React, useTypedRedux, useState, TypedMap } from "../../app-framework";
import { ConfigurationActions } from "./actions";
import { Card, Typography, Switch, Form, Button } from "antd";
import { EnvVars, EnvVarsRecord } from "../../projects/actions";
import {
  KUCALC_COCALC_COM,
  KUCALC_ON_PREMISES,
} from "@cocalc/util/db-schema/site-defaults";
import { Icon } from "../../components";
import { ENV_VARS_ICON } from "../../project/settings/environment";

const ENVVARS_DEFAULT = true;

interface Props {
  actions: ConfigurationActions;
  envvars?: EnvVars | TypedMap<EnvVarsRecord>;
}

function normalizeTypeAndValue(
  envvars: EnvVars | TypedMap<EnvVarsRecord>
): NonNullable<EnvVars> {
  if (typeof (envvars as any)?.inherit === "boolean") {
    return envvars as NonNullable<EnvVars>;
  }
  if (typeof (envvars as any)?.toJS === "function") {
    return normalizeTypeAndValue((envvars as TypedMap<EnvVarsRecord>).toJS());
  }
  return { inherit: ENVVARS_DEFAULT };
}

export const EnvironmentVariablesConfig: React.FC<Props> = (props: Props) => {
  const { actions } = props;
  const envvars = normalizeTypeAndValue(props.envvars);
  const customize_kucalc = useTypedRedux("customize", "kucalc");
  const [needSave, setNeedSave] = useState<boolean>(false);

  // by default, we inherit the environment variables
  // as of this, we only support true/false
  const inherit = envvars.inherit ?? ENVVARS_DEFAULT;
  const [nextVal, setNextVal] = useState<boolean>(inherit);

  React.useEffect(() => {
    setNeedSave(nextVal != inherit);
  }, [nextVal, inherit]);

  // this selector only make sense for cocalc.com and cocalc-cloud
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
            onClick={() => actions.set_envvars(nextVal)}
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
          <Icon name={ENV_VARS_ICON} /> Inherit environment variables
        </>
      }
    >
      <p>
        If enabled, all student projects inherit the{" "}
        <Typography.Text strong>environment variables</Typography.Text> of this
        instructor project.
      </p>
      <p>
        To configure them, please check this project's settings for more
        details. Any changes to the configuration of this project will be
        reflected after the next start of a student project.
      </p>
      <p>
        Node: inherited variables will take precedence over the ones defined in
        the student project with the same name.
      </p>
      {toggle()}
    </Card>
  );
};
