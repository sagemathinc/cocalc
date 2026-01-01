import { Col, Row } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import { HostCreateCard } from "./components/host-create-card";
import { HostDrawer } from "./components/host-drawer";
import { HostEditModal } from "./components/host-edit-modal";
import { HostList } from "./components/host-list";
import { WRAP_STYLE } from "./constants";
import { useHostsPageViewModel } from "./hooks/use-hosts-page-view-model";


export const HostsPage: React.FC = () => {
  const { createVm, hostListVm, hostDrawerVm, editVm } = useHostsPageViewModel();

  return (
    <div className="smc-vfill" style={WRAP_STYLE}>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <HostCreateCard vm={createVm} />
        </Col>
        <Col xs={24} lg={12}>
          <HostList vm={hostListVm} />
        </Col>
      </Row>
      <HostDrawer vm={hostDrawerVm} />
      <HostEditModal {...editVm} />
    </div>
  );
};
