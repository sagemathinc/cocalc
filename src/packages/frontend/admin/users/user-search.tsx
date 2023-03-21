/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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
import { Icon, Title } from "@cocalc/frontend/components";
import { User } from "@cocalc/frontend/frame-editors/generic/client";
import { actions } from "./actions";
import { User as UserMap } from "./store";
import { UserResult } from "./user";

interface ReduxProps {
  view?: boolean;
  state?: "edit" | "running";
  status?: string;
  query?: string;
  result?: List<UserMap>;
}

class UserSearch extends Component<ReduxProps> {
  static reduxProps() {
    return {
      "admin-users": {
        view: rtypes.bool,
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
            placeholder="Search for users by first name, last name, or email address..."
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

  render_user_header(): Rendered {
    return (
      <UserResult
        key={"header"}
        header={true}
        first_name="First"
        last_name="Last"
        email_address="Email"
        created="Created"
        last_active="Active"
        account_id="Account ID"
      />
    );
  }

  render_user(user: User): Rendered {
    return <UserResult key={user.account_id} {...user} />;
  }

  render_result() {
    if (!this.props.result || this.props.result.size == 0) {
      return null;
    }
    const v: Rendered[] = [this.render_user_header()];
    this.props.result.forEach((user) => {
      v.push(this.render_user(user.toJS()));
    });
    return v;
  }

  private render_header_toggle(): Rendered {
    return (
      <Title
        level={4}
        onClick={() => actions.set_view(!this.props.view)}
        style={{ cursor: "pointer" }}
      >
        <Icon
          style={{ width: "20px" }}
          name={this.props.view ? "caret-down" : "caret-right"}
        />{" "}
        Users
      </Title>
    );
  }

  private render_body(): Rendered {
    if (!this.props.view) return;
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

  render(): Rendered {
    return (
      <div>
        {this.render_header_toggle()}
        {this.render_body()}
      </div>
    );
  }
}

const c = rclass(UserSearch);
export { c as UserSearch };
