/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useTypedRedux } from "../../app-framework";
import { ConfigurationActions } from "./actions";
import { Card, Typography, Switch, Form } from "antd";
import { Datastore } from "../../projects/actions";
import { KUCALC_COCALC_COM } from "smc-util/db-schema/site-defaults";
import { Icon } from "../../r_misc";

interface Props {
  actions: ConfigurationActions;
  datastore?: Datastore;
}

export const DatastoreConfig: React.FC<Props> = (props: Props) => {
  const { actions, datastore } = props;
  const customize_kucalc = useTypedRedux("customize", "kucalc");

  // by default, we inherit the datastore configuration
  // as of this, we also only support true/false
  const inherit = typeof datastore === "boolean" ? datastore : true;

  function on_inherit_change(inherit: boolean) {
    actions.set_datastore(inherit);
  }

  // this selector only make sense for cocalc.com
  if (customize_kucalc !== KUCALC_COCALC_COM) return null;

  function render_control() {
    return (
      <Form.Item label="Inherit Datastores:" style={{ marginBottom: 0 }}>
        <Switch checked={inherit} onChange={(val) => on_inherit_change(val)} />
      </Form.Item>
    );
  }

  return (
    <Card
      title={
        <>
          <Icon name="database" /> Datstores
        </>
      }
    >
      <p>
        If enabled, all student projects will have{" "}
        <Typography.Text strong>read-only</Typography.Text> access to the same
        datastores as this instructor project. To configure datastores, please
        check the instructor project's settings for more details.
      </p>
      {render_control()}
    </Card>
  );
};
