/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This configures the datastore configuration for student and the shared project.
// basically: if it is "true", the datastore config of the teacher project is looked up when the project starts
// and used to configure it in read-only mode. In the future, a natural extension is to explicitly list the datastores
// that should be inherited, or configure the readonly property. but for now, it's just true or false.

import { React, useTypedRedux, useState } from "../../app-framework";
import { ConfigurationActions } from "./actions";
import { Card, Typography, Switch, Form, Button } from "antd";
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
  const [need_save, set_need_save] = useState<boolean>(false);

  // by default, we inherit the datastore configuration
  // as of this, we also only support true/false
  const inherit = typeof datastore === "boolean" ? datastore : true;
  const [next_val, set_next_val] = useState<boolean>(inherit);

  function on_inherit_change(inherit: boolean) {
    set_next_val(inherit);
  }

  React.useEffect(() => {
    set_need_save(next_val != inherit);
  }, [next_val, inherit]);

  function save() {
    actions.set_datastore(next_val);
  }

  // this selector only make sense for cocalc.com
  if (customize_kucalc !== KUCALC_COCALC_COM) return null;

  function render_control() {
    return (
      <Form layout="inline">
        <Form.Item label="Inherit Datastores:" style={{ marginBottom: 0 }}>
          <Switch
            checked={next_val}
            onChange={(val) => on_inherit_change(val)}
          />
        </Form.Item>
        <Form.Item>
          <Button
            disabled={!need_save}
            type={need_save ? "primary" : "default"}
            onClick={save}
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
          <Icon name="database" /> Datstores
        </>
      }
    >
      <p>
        If enabled, all student projects will have{" "}
        <Typography.Text strong>read-only</Typography.Text> access to the same
        datastores as this instructor project. To configure datastores, please
        check this project's settings for more details. Any changes to the
        datastore configuration of this project will be reflected after the next
        start of a student project.
      </p>
      {render_control()}
    </Card>
  );
};
