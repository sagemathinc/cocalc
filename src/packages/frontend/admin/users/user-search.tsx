/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Functionality and UI to ensure a user with given email (or account_id) is sync'd with stripe.
*/

import { List } from "immutable";
import { DebounceInput } from "react-debounce-input";
import { Button, Col, Row } from "@cocalc/frontend/antd-bootstrap";
import {
  Component,
  rclass,
  Rendered,
  rtypes,
} from "@cocalc/frontend/app-framework";
import { User } from "@cocalc/frontend/frame-editors/generic/client";
import { actions } from "./actions";
import { User as UserMap } from "./store";
import { UserResult } from "./user";

interface ReduxProps {
  state?: "edit" | "running";
  status?: string;
  query?: string;
  result?: List<UserMap>;
}

class UserSearch extends Component<ReduxProps> {
  static reduxProps() {
    return {
      "admin-users": {
        state: rtypes.string,
        status: rtypes.string,
        query: rtypes.string,
        result: rtypes.immutable.List,
      },
    };
  }

  render_form(): Rendered {
    return (
      <Row style={{ marginBottom: "15px" }}>
        <Col md={6}>
          <DebounceInput
            style={{
              border: "1px solid lightgrey",
              borderRadius: "3px",
              padding: "5px",
              width: "90%",
            }}
            value={this.props.query}
            placeholder="Search for users by partial name, email, account id or project id..."
            onChange={(e) => actions.set_query(e.target.value)}
            onKeyDown={(e) => {
              if (e.keyCode === 13) {
                actions.search();
              }
            }}
          />
        </Col>
        <Col md={6}>
          <Button
            disabled={this.props.query == ""}
            onClick={() => actions.search()}
          >
            Search for Users
          </Button>
        </Col>
      </Row>
    );
  }

  render_status(): Rendered {
    if (!this.props.status) {
      return;
    }
    return (
      <div>
        <pre>{this.props.status}</pre>
        <Button onClick={() => actions.clear_status()}>Clear</Button>
      </div>
    );
  }

  render_user(user: User): Rendered {
    return <UserResult key={user.account_id} {...user} />;
  }

  render_result() {
    if (!this.props.result || this.props.result.size == 0) {
      return null;
    }
    const v: Rendered[] = [];
    this.props.result.forEach((user) => {
      v.push(this.render_user(user.toJS()));
    });
    return v;
  }

  render(): Rendered {
    return (
      <div style={{ margin: "0 30px" }}>
        <div>
          {this.render_form()}
          {this.render_status()}
          {this.render_result()}
        </div>
      </div>
    );
  }
}

const c = rclass(UserSearch);
export { c as UserSearch };
