import { Card, Col, Row, Typography } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import type { Host } from "@cocalc/conat/hub/api/hosts";
import { HostCard } from "./host-card";

type HostListProps = {
  hosts: Host[];
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  onDetails: (host: Host) => void;
};

export const HostList: React.FC<HostListProps> = ({
  hosts,
  onStart,
  onStop,
  onDelete,
  onDetails,
}) => {
  if (hosts.length === 0) {
    return (
      <Card
        style={{ maxWidth: 720, margin: "0 auto" }}
        title={
          <span>
            <Icon name="server" /> Project Hosts
          </span>
        }
      >
        <Typography.Paragraph>
          Dedicated project hosts let you run and share normal CoCalc projects
          on your own VMs (e.g. GPU or large-memory machines). Create one below
          to get started.
        </Typography.Paragraph>
      </Card>
    );
  }

  return (
    <Row gutter={[16, 16]}>
      {hosts.map((host) => (
        <Col xs={24} md={12} lg={8} key={host.id}>
          <HostCard
            host={host}
            onStart={onStart}
            onStop={onStop}
            onDelete={onDelete}
            onDetails={onDetails}
          />
        </Col>
      ))}
    </Row>
  );
};
