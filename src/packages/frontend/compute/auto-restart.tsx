import { Alert, Checkbox, Switch } from "antd";
import { useEffect, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { A } from "@cocalc/frontend/components/A";

export default function AutoRestart({ setConfig, configuration, loading }) {
  const [autoRestart, setAutoRestart] = useState<boolean>(
    !!configuration.autoRestart,
  );
  const [help, setHelp] = useState<boolean>(false);
  useEffect(() => {
    setAutoRestart(configuration.autoRestart);
  }, [configuration]);
  return (
    <div>
      <div style={{ color: "#666", marginBottom: "5px" }}>
        <div>
          <b>
            <Switch
              size="small"
              checkedChildren={"Help"}
              unCheckedChildren={"Help"}
              style={{ float: "right" }}
              checked={help}
              onChange={(val) => setHelp(val)}
            />
            <Icon name="run" /> Automatically Restart
          </b>
        </div>
        {help && (
          <Alert
            showIcon
            style={{ margin: "15px 0" }}
            type="info"
            message={"Automatically Restart Compute Server"}
            description={
              <div>
                <p>
                  Select this option and CoCalc will automatically restart your
                  compute server if it is killed, crashes or otherwise stops
                  pinging CoCalc.
                </p>
                {!!configuration["spot"] && (
                  <p>
                    This is useful if you are running a web server on a spot
                    instances, since spot instances will get killed when there
                    is a surge of usage by other people. Your compute server may
                    then automatically get started somewhere else in the data
                    center.
                  </p>
                )}
                <p>
                  You can use the{" "}
                  <A href="https://help.ubuntu.com/community/CronHowto">
                    standard crontab command line tool
                  </A>{" "}
                  (which is installed and fully supported for compute servers)
                  to start scripts or processes running whenever your server
                  restarts, or to periodically run a script.
                </p>
              </div>
            }
          />
        )}
        <Checkbox
          style={{ marginTop: "5px" }}
          disabled={loading}
          checked={autoRestart}
          onChange={() => {
            setConfig({ autoRestart: !autoRestart });
            setAutoRestart(!autoRestart);
          }}
        >
          Automatically Restart: restart compute server if it stops responding
        </Checkbox>
      </div>
    </div>
  );
}
