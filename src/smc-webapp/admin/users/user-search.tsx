/*
Functionality and UI to ensure a user with given email (or account_id) is sync'd with stripe.
*/

import { Row, Col, FormGroup, FormControl, Button } from "react-bootstrap";

import {
  React,
  Component,
  Rendered,
  ReactDOM
} from "smc-webapp/app-framework";

import { user_search, User } from "smc-webapp/frame-editors/generic/client";

import { UserResult } from "./user";

interface UserSearchState {
  state: "edit" | "running";
  status: string;
  query: string;
  result: User[];
}

export class UserSearch extends Component<{}, UserSearchState> {
  constructor(props) {
    super(props);
    this.state = {
      state: "edit",
      status: "",
      query: "",
      result: []
    };
  }

  status_mesg(s: string): void {
    this.setState({
      status: s
    });
  }

  async search(): Promise<void> {
    this.status_mesg("Searching...");
    const result: User[] = await user_search({
      query: this.state.query,
      admin: true,
      limit: 100,
      active: "1 year"
    });
    this.status_mesg("");
    this.setState({ result: result });
  }

  submit_form(e): void {
    e.preventDefault();
    this.search();
  }

  render_form(): Rendered {
    return (
      <form onSubmit={e => this.submit_form(e)}>
        <Row>
          <Col md={6}>
            <FormGroup>
              <FormControl
                ref="input"
                type="text"
                value={this.state.query}
                placeholder="Query"
                onChange={() =>
                  this.setState({
                    query: ReactDOM.findDOMNode(this.refs.input).value
                  })
                }
              />
            </FormGroup>
          </Col>
          <Col md={6}>
            <Button
              bsStyle="warning"
              disabled={this.state.query == ""}
              onClick={() => this.search()}
            >
              Search for User
            </Button>
          </Col>
        </Row>
      </form>
    );
  }

  render_status(): Rendered {
    if (!this.state.status) {
      return;
    }
    return (
      <div>
        <pre>{this.state.status}</pre>
        <Button onClick={() => this.setState({ status: "" })}>Clear</Button>
      </div>
    );
  }

  render_user(user: User): Rendered {
    return <UserResult key={user.account_id} {...user} />;
  }

  render_result(): Rendered[] | Rendered {
    if (this.state.result.length == 0) {
      return <div>No results</div>;
    }
    let user: User;
    let v: Rendered[] = [];
    for (user of this.state.result) {
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
