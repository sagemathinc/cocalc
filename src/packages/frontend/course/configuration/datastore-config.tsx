/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// This configures the datastore configuration for student and the shared project.
// basically: if it is "true", the datastore config of the teacher project is looked up when the project starts
// and used to configure it in read-only mode. In the future, a natural extension is to explicitly list the datastores
// that should be inherited, or configure the readonly property. but for now, it's just true or false.

import { Button, Card, Form, Switch, Typography } from "antd";
import { List } from "immutable";
import { useEffect, useState } from "react";
import { useIntl } from "react-intl";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { Datastore } from "@cocalc/frontend/projects/actions";
import {
  KUCALC_COCALC_COM,
  KUCALC_ON_PREMISES,
} from "@cocalc/util/db-schema/site-defaults";
import { ConfigurationActions } from "./actions";

interface Props {
  actions: ConfigurationActions;
  datastore?: Datastore | List<string>; // List<string> is not used yet
  project_id: string;
  close?: Function;
}

export function DatastoreConfig({
  actions,
  datastore,
  project_id,
  close,
}: Props) {
  const intl = useIntl();
  const customize_kucalc = useTypedRedux("customize", "kucalc");
  const customize_datastore = useTypedRedux("customize", "datastore");
  const [need_save, set_need_save] = useState<boolean>(false);

  // by default, we inherit the datastore configuration
  // as of this, we also only support true/false
  const inherit = typeof datastore === "boolean" ? datastore : true;
  const [next_val, set_next_val] = useState<boolean>(inherit);

  useEffect(() => {
    // needed because of realtime collaboration, multiple frames, modal, etc!
    set_next_val(inherit);
  }, [inherit]);

  function on_inherit_change(inherit: boolean) {
    set_next_val(inherit);
  }

  useEffect(() => {
    set_need_save(next_val != inherit);
  }, [next_val, inherit]);

  function save() {
    actions.set_datastore(next_val);
    close?.();
  }

  // this selector only make sense for cocalc.com or onprem with datastore enabled
  const showDatastore =
    customize_kucalc === KUCALC_COCALC_COM ||
    (customize_kucalc === KUCALC_ON_PREMISES && customize_datastore);

  if (!showDatastore) return null;

  function render_control() {
    return (
      <Form layout="inline">
        <Form.Item label="Inherit settings:" style={{ marginBottom: 0 }}>
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
    <>
      <br />
      <Card
        title={
          <>
            <Icon name="database" />{" "}
            {intl.formatMessage(labels.cloud_storage_remote_filesystems)}
          </>
        }
      >
        <p>
          If enabled, all student projects will have{" "}
          <Typography.Text strong>read-only</Typography.Text> access to the same
          cloud stores and remote file systems as this instructor project. To
          configure them, please check{" "}
          <a
            onClick={() => {
              redux.getProjectActions(project_id).set_active_tab("settings");
              close?.();
            }}
          >
            this project's settings
          </a>{" "}
          for more details. Any changes to the configuration of this project
          will be reflected after the next start of a student project.
        </p>
        {render_control()}
      </Card>
    </>
  );
}
