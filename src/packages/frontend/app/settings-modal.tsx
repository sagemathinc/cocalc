/*
Easily show a global settings modal at any point in cocalc by doing

   await redux.getActions("page").settings(name)

This should be used only for various types of configuration that is not
specific to a particular project.  E.g., many of the panels in the Account
tab could also be accessed this way.
*/

import { Modal } from "antd";
import { useActions, useRedux } from "@cocalc/frontend/app-framework";

import { TerminalSettings } from "@cocalc/frontend/account/terminal-settings";

// Ensure the billing Actions and Store are created, which are needed for purchases, etc., to work...
import "@cocalc/frontend/billing/actions";

export default function SettingsModal({}) {
  const actions = useActions("page");
  const name = useRedux("page", "settingsModal");

  if (!name) {
    return null;
  }

  const { Component, title } = getDescription(name);

  const close = () => {
    actions.settings("");
  };

  // destroyOnClose so values in quota input, etc. get updated
  return (
    <Modal
      key="settings-modal"
      width={"600px"}
      destroyOnClose
      open
      title={title}
      onOk={close}
      onCancel={close}
      cancelButtonProps={{ style: { display: "none" } }}
      okText="Close"
    >
      <br />
      {Component != null ? <Component /> : undefined}
    </Modal>
  );
}

function getDescription(name: string): { Component?; title? } {
  switch (name) {
    case "terminal-settings":
      return { Component: TerminalSettings };
    default:
      return {
        title: <div>Unknown component {name}</div>,
      };
  }
}
