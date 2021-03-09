/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Datastore (kucalc only!)
*/

import {
  React,
  // useActions,
  // useMemo,
  // useRedux,
  useState,
  useIsMountedRef,
} from "../../app-framework";
import { webapp_client } from "../../webapp-client";
import { useProjectState } from "../page/project-state-hook";
import { Button } from "antd";
import { ErrorDisplay, SettingBox, Space } from "../../r_misc";
// import * as jsonic from "jsonic";

interface Config {
  type: "s3" | "gcs";
  config: any;
}

interface Props {
  project_id: string;
}

export const Datastore: React.FC<Props> = (props: Props) => {
  const { project_id } = props;
  const state = useProjectState(project_id);
  const is_running = state.get("state") === "running";
  // const env = useRedux(["projects", "project_map", project_id, "env"]);
  const [focused, set_focused] = useState<boolean>(false);
  const [loading, set_loading] = useState<boolean>(false);
  const [error, set_error] = useState<string>("");
  // const actions = useActions({ project_id });
  const is_mounted_ref = useIsMountedRef();
  // const [saving, set_saving] = useState<boolean>(false);
  // const disabled = useMemo(() => {
  //   return to_json(env?.toJS()) == editing;
  // }, [env, editing]);
  const [configs, set_configs] = useState<Config[]>([]);

  async function add(): Promise<void> {
    if (!is_mounted_ref.current) return;
  }
  console.log("datastore add", add);

  const instructions = focused
    ? `Restart your project for these changes to take effect.`
    : "";

  async function get() {
    const query = {
      project_datastore: {
        project_id,
        addons: { datastore: null },
      },
    };
    return await webapp_client.query({ query });
  }

  async function reload() {
    try {
      set_loading(true);
      console.log("Datastore reload", project_id);
      const raw = await get();
      set_configs(raw);
    } catch (err) {
      if (err) set_error(err);
    } finally {
      set_loading(false);
    }
  }

  // reload once when mounting
  React.useEffect(() => {
    reload();
  }, []);

  return (
    <SettingBox title="Datastore" icon="bars">
      {error != "" ? <ErrorDisplay error={error} /> : undefined}
      <div onClick={() => set_focused(true)}>
        INFORMATION – loading: {JSON.stringify(loading)} – running: {JSON.stringify(is_running)}
      </div>
      <pre>{JSON.stringify(configs, null, 2)}</pre>
      <Space />
      <Button onClick={reload}>Reload</Button>
      <br />
      {instructions}
    </SettingBox>
  );
};
