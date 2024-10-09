import { serverURL, SPEC } from "@cocalc/frontend/project/named-server-panel";
import LinkRetry from "@cocalc/frontend/components/link-retry";
import { Alert, Button, Divider, Space } from "antd";
import { redux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";

export default function JupyterClassic({ project_id }) {
  return (
    <div>
      <Alert
        showIcon
        style={{ maxWidth: "800px", margin: "30px auto" }}
        type="warning"
        message={"Collaborative Jupyter Classic in CoCalc is Deprecated"}
        description={
          <div>
            Jupyter Classic as a Collaborative CoCalc editor is no longer
            available. You can launch JupyterLab or Jupyter classic from the
            servers panel or the buttons below, or open this notebook from
            there.
            <Divider />
            <Space wrap>
              <LinkRetry
                mode="button"
                href={serverURL(project_id, "jupyterlab")}
              >
                <Icon name={SPEC.jupyterlab.icon} /> Open JupyterLab...
              </LinkRetry>
              <LinkRetry mode="button" href={serverURL(project_id, "jupyter")}>
                <Icon name={SPEC.jupyter.icon} /> Open Jupyter Classic...
              </LinkRetry>
              <Button
                type="primary"
                onClick={() => {
                  redux
                    .getActions("account")
                    .set_editor_settings("jupyter_classic", false);
                }}
              >
                Use CoCalc Jupyter
              </Button>
            </Space>
          </div>
        }
      />
    </div>
  );
}
