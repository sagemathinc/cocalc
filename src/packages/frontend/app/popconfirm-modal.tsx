/*
Easily show a global popconfirm modal at any point in cocalc by doing

   await redux.getActions("page").popconfirm(...open, title, cancelText, okText, description )

It will return true on OK and false on Cancel.

One twist is that the OK button is focused automatically, so the user can
just hit enter to select OK, without having to use the mouse.
*/

import { Modal } from "antd";
import {
  useActions,
  useEffect,
  useRedux,
  useRef,
} from "@cocalc/frontend/app-framework";

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

  const okButtonRef = useRef();
  useEffect(() => {
    if (popconfirm.open) {
      // @ts-ignore
      setTimeout(() => okButtonRef.current?.focus(), 1);
    }
  }, [popconfirm.open]);

  // destroyOnHidden so values in quota input, etc. get updated
  return (
    <Modal
      key="app-modal"
      width={"600px"}
      destroyOnHidden
      open={popconfirm.open}
      title={popconfirm.title}
      onCancel={handleCancel}
      onOk={handleOk}
      cancelText={popconfirm.cancelText ?? "No"}
      okText={popconfirm.okText ?? "Yes"}
      okButtonProps={{
        // @ts-ignore
        ref: okButtonRef,
      }}
    >
      {popconfirm.description}
    </Modal>
  );
}
