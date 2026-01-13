// SelectNewHost is a small, reusable block used when creating a project
// (and elsewhere) to choose which project-host the new project should run on.
// It shows a compact summary of the current selection plus a button that
// opens the HostPickerModal. Callers provide the current host (if any) and
// get notified via onChange when the user picks or resets a host.
import { useState } from "react";
import { Card, Col, Row, Tag, Button, Typography } from "antd";
import type { Host } from "@cocalc/conat/hub/api/hosts";
import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import { HostPickerModal } from "@cocalc/frontend/hosts/pick-host";

const { Paragraph } = Typography;

export function SelectNewHost({
  selectedHost,
  onChange,
  disabled,
  regionFilter,
  regionLabel,
}: {
  selectedHost?: Host;
  onChange: (host?: Host) => void;
  disabled?: boolean;
  regionFilter?: string;
  regionLabel?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <Row gutter={[30, 10]} style={{ paddingTop: 15 }}>
        <Col sm={12}>
          <Card size="small" bodyStyle={{ padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontWeight: 600,
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <Icon name="servers" /> Workspace host
                </div>
                <div style={{ color: COLORS.GRAY_D }}>
                  {selectedHost ? (
                    <>
                      <span style={{ marginRight: 8 }}>{selectedHost.name}</span>
                      {selectedHost.region && (
                        <Tag color="blue" style={{ marginRight: 6 }}>
                          {selectedHost.region}
                        </Tag>
                      )}
                      {regionLabel && (
                        <Tag color="geekblue" style={{ marginRight: 6 }}>
                          {regionLabel}
                        </Tag>
                      )}
                      {selectedHost.tier != null && (
                        <Tag color="purple" style={{ marginRight: 6 }}>
                          Tier {selectedHost.tier}
                        </Tag>
                      )}
                    </>
                  ) : (
                    `Auto (best available host${regionLabel ? ` in ${regionLabel}` : ""})`
                  )}
                </div>
              </div>
              <Button
                onClick={() => setPickerOpen(true)}
                disabled={disabled}
                size="small"
              >
                {selectedHost ? "Change..." : "Choose host..."}
              </Button>
              {selectedHost && (
                <Button
                  disabled={disabled}
                  onClick={() => onChange(undefined)}
                  type="text"
                  size="small"
                >
                  Reset
                </Button>
              )}
            </div>
          </Card>
        </Col>
        <Col sm={12}>
          <Paragraph type="secondary">
            Select where this project will run. Choose one of your project hosts,
            a collaborator’s host, or leave it on auto to use the shared pool in the
            nearest region.
          </Paragraph>
        </Col>
      </Row>
      <HostPickerModal
        open={pickerOpen}
        currentHostId={selectedHost?.id}
        regionFilter={regionFilter}
        lockRegion={Boolean(regionFilter)}
        onCancel={() => setPickerOpen(false)}
        onSelect={(_, host) => {
          setPickerOpen(false);
          onChange(host);
        }}
      />
    </>
  );
}
