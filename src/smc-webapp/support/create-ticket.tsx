/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useActions, useTypedRedux } from "../app-framework";
import { Modal } from "react-bootstrap";
import { Icon } from "../r_misc";
import { SupportInfo } from "./info";
import { SupportForm } from "./form";
import { SupportFooter } from "./footer";

export const CreateSupportTicket: React.FC = () => {
  const show = useTypedRedux("support", "show");
  const actions = useActions("support");

  return (
    <Modal
      bsSize={"large"}
      show={show}
      onHide={() => actions.set_show(false)}
      animation={false}
    >
      <Modal.Header closeButton>
        <Modal.Title>
          <Icon name="medkit" /> Help
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {" "}
        <div style={{ color: "#333" }}>
          {<SupportInfo />}
          {<SupportForm />}
        </div>
      </Modal.Body>

      <SupportFooter />
    </Modal>
  );
};
