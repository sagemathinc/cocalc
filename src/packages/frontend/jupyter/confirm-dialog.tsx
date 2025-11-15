/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Confirmation dialog, for explicitly confirming dangerous actions.
*/

import { Modal } from "antd";
import { Map } from "immutable";

import { Button, ButtonStyle } from "@cocalc/frontend/antd-bootstrap";
import { Icon, IconName, Markdown } from "@cocalc/frontend/components";
import { JupyterActions } from "./browser-actions";

// This defines what data should be put in the confirm_dialog prop,
// which gets passed in as immutable data below.  Use it externally
// in whatever function is going to set that data in the first place.
export interface ConfirmDialogChoice {
  title: string;
  style?: ButtonStyle;
  default?: boolean;
}

export interface ConfirmDialogOptions {
  title: string;
  body: string;
  choices: ConfirmDialogChoice[];
  icon?: IconName;
}

interface ConfirmDialogProps {
  actions: JupyterActions;
  confirm_dialog: Map<string, any>;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = (
  props: ConfirmDialogProps,
) => {
  const { actions, confirm_dialog } = props;

  function close(): void {
    actions.close_confirm_dialog();
  }

  function renderButton(choice: ConfirmDialogChoice) {
    return (
      <Button
        key={choice.title}
        bsStyle={choice.style}
        autoFocus={choice.default}
        onClick={() => actions.close_confirm_dialog(choice.title)}
      >
        {choice.title}
      </Button>
    );
  }

  function renderButtons() {
    const choices = confirm_dialog.get("choices");
    if (choices != null) {
      return choices.map((choice) => renderButton(choice.toJS()));
    } else {
      return [];
    }
  }

  function renderTitleIcon() {
    const icon = confirm_dialog.get("icon");
    if (icon == null) return;
    return <Icon name={icon} />;
  }

  // Show only if the choice field is not set (which happens when user
  // makes a choice).
  return (
    <Modal
      width={700}
      open={confirm_dialog.get("choice") == null}
      onCancel={close}
      title={
        <>
          {renderTitleIcon()} {confirm_dialog.get("title")}
        </>
      }
      footer={renderButtons()}
    >
      <Markdown value={confirm_dialog.get("body")} />
    </Modal>
  );
};
