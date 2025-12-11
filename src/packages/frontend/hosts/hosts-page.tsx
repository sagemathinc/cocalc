import { Card, Typography } from "antd";
import { CSS, React } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";

const WRAP_STYLE: CSS = {
  display: "flex",
  justifyContent: "center",
  padding: "24px",
  width: "100%",
  overflow: "auto",
};

export const HostsPage: React.FC = () => {
  return (
    <div className="smc-vfill" style={WRAP_STYLE}>
      <Card
        style={{ maxWidth: 640, width: "100%" }}
        title={
          <span>
            <Icon name="server" /> Project Hosts
          </span>
        }
      >
        <Typography.Paragraph>
          Dedicated project hosts let you run and share normal CoCalc projects
          on your own VMs (e.g. GPU or large-memory machines). This first
          version is a placeholder; more controls for creating, starting,
          stopping, and managing hosts will appear here soon.
        </Typography.Paragraph>
      </Card>
    </div>
  );
};
