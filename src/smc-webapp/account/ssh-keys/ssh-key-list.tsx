import { Map } from "immutable";
import { React } from "../../app-framework";
import { HelpIcon, Icon, Space } from "../../r_misc";
const { OneSSHKey } = require("../../widget-ssh-keys/main");
import { cmp } from "smc-util/misc";
import { Panel } from "../../antd-bootstrap";

// Children are rendered above the list of SSH Keys
// Takes an optional Help string or node to render as a help modal
export const SSHKeyList: React.FC<{
  ssh_keys?: Map<string, any>;
  project_id?: string;
  help?: JSX.Element;
  children?: any;
}> = ({ ssh_keys, project_id, help, children }) => {
  function render_header() {
    return (
      <h3>
        <Icon name="list-ul" /> SSH keys <Space />
        {help && <HelpIcon title="Using SSH Keys">{help}</HelpIcon>}
      </h3>
    );
  }

  function render_keys() {
    if (ssh_keys == null || ssh_keys.size == 0) return;
    const v: { date?: Date; fp: string; component: JSX.Element }[] = [];

    ssh_keys?.forEach(
      (ssh_key: Map<string, any>, fingerprint: string): void => {
        if (!ssh_key) {
          return;
        }
        ssh_key = ssh_key.set("fingerprint", fingerprint);
        v.push({
          date: ssh_key.get("last_use_date"),
          fp: fingerprint,
          component: (
            <OneSSHKey
              ssh_key={ssh_key}
              key={fingerprint}
              project_id={project_id}
            />
          ),
        });
      }
    );
    // sort in reverse order by last_use_date, then by fingerprint
    v.sort(function (a, b) {
      if (a.date != null && b.date != null) {
        return -cmp(a.date, b.date);
      }
      if (a.date && b.date == null) {
        return -1;
      }
      if (b.date && a.date == null) {
        return +1;
      }
      return cmp(a.fp, b.fp);
    });
    return (
      <Panel style={{ marginBottom: "0px" }}>{v.map((x) => x.component)}</Panel>
    );
  }

  return (
    <Panel header={render_header()}>
      {children}
      {render_keys()}
    </Panel>
  );
};
