import { Modal } from "antd";
import { useActions, useRedux } from "@cocalc/frontend/app-framework";

// Ensure the billing Actions and Store are created, which are needed for purchases, etc., to work...
import "@cocalc/frontend/billing/actions";

export default function PopconfirmModal({}) {
  const actions = useActions("page");
  const popconfirm = useRedux("page", "popconfirm")?.toJS() ?? {};

  const handleCancel = () => {
    actions.setState({ popconfirm: { open: false, ok: false } });
  };
  const handleOk = () => {
    actions.setState({ popconfirm: { open: false, ok: true } });
  };

  // destroyOnClose so values in quota input get updated
  return (
    <Modal
      width={"600px"}
      destroyOnClose
      open={popconfirm.open}
      title={popconfirm.title}
      onCancel={handleCancel}
      onOk={handleOk}
      cancelText={popconfirm.cancelText ?? "No"}
      okText={popconfirm.okText ?? "Yes"}
    >
      {popconfirm.description}
    </Modal>
  );
}
