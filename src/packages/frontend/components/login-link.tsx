/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, redux } from "../app-framework";
import { Alert } from "../antd-bootstrap";
import { Icon } from "./icon";
import { Space } from "./space";

export const LoginLink: React.FC = () => {
  return (
    <Alert bsStyle="info" style={{ margin: "15px" }}>
      <Icon name="sign-in" style={{ fontSize: "13pt", marginRight: "10px" }} />{" "}
      Please
      <Space />
      <a
        style={{ cursor: "pointer" }}
        onClick={() => redux.getActions("page").set_active_tab("account")}
      >
        login or create an account...
      </a>
    </Alert>
  );
};
