/*
Functionality and UI to ensure a user with given email (or account_id) is sync'd with stripe.
*/

import { Row, Col, FormGroup, FormControl, Button } from "react-bootstrap";

import { React, Component, Rendered } from "smc-webapp/app-framework";

import { User } from "smc-webapp/frame-editors/generic/client";

import { UserResult } from "./user";

interface UserSearchProps {
  state: "edit" | "running";
  status: string;
  query: string;
  result: User[];
  search: () => void;
  set_query: (value: string) => void;
  clear_status: () => void;
}

export class UserSearch extends Component<UserSearchProps> {
  on_submit_form(e): void {
    e.preventDefault();
    this.props.search();
  }

  temp_test(e): void {
    this.props.set_query(e.target.value)
  }

  render_form(): Rendered {
    return (
      <form onSubmit={e => this.on_submit_form(e)}>
        <Row>
          <Col md={6}>
            <FormGroup>
              <FormControl
                ref="input"
                type="text"
                value={this.props.query}
                placeholder="Part of first name, last name, or email address..."
                onChange={e => this.temp_test(e)}
              />
            </FormGroup>
          </Col>
          <Col md={6}>
            <Button
              bsStyle="warning"
              disabled={this.props.query == ""}
              onClick={() => this.props.search()}
            >
              Search for User
            </Button>
          </Col>
        </Row>
      </form>
    );
  }

  render_status(): Rendered {
    if (!this.props.status) {
      return;
    }
    return (
      <div>
        <pre>{this.props.status}</pre>
        <Button onClick={() => this.props.clear_status()}>Clear</Button>
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

  render_result(): Rendered[] | Rendered {
    if (this.props.result.length == 0) {
      return <div>No results</div>;
    }
    let user: User;
    let v: Rendered[] = [this.render_user_header()];
    for (user of this.props.result) {
      v.push(this.render_user(user));
    }
    return v;
  }

  render(): Rendered {
    return (
      <div>
        <h4>Search for a User</h4>
        <div style={{ color: "#666", marginBottom: "5px" }}>
          Search for a given user.
        </div>
        <div>
          {this.render_form()}
          {this.render_status()}
          {this.render_result()}
        </div>
      </div>
    );
  }
}
