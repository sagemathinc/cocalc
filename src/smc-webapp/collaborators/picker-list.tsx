import * as React from "react";

import {
  ListGroup,
  ListGroupItem,
  FormGroup,
  FormControl,
  HelpBlock
} from "react-bootstrap";
import "./style.scss";

const { Loading } = require("../r_misc");

interface Item {
  key: any;
  label: any;
  value: any;
}

interface PickerListProps {
  inputValue: string;
  onInputChange(value: string): void;
  isLoading?: boolean;
  results?: Item[];
  onSelect(value: any): void;
}

export class PickerList extends React.Component<PickerListProps> {
  handleInputChange = (e: any) => this.props.onInputChange(e.target.value);
  render_input() {
    const { inputValue, results, isLoading } = this.props;
    return (
      <>
        <FormGroup style={{ margin: "15px" }}>
          <FormControl
            type="text"
            value={inputValue}
            placeholder="Search by name or email"
            onChange={this.handleInputChange}
          />
          {!isLoading &&
            inputValue &&
            Array.isArray(results) &&
            results.length === 0 && <HelpBlock>No results found.</HelpBlock>}
        </FormGroup>
      </>
    );
  }
  render_results() {
    const { results, isLoading } = this.props;
    if (isLoading) {
      return (
        <div style={{ textAlign: "center", margin: "5px" }}>
          <Loading />
        </div>
      );
    }
    if (results === undefined || results.length === 0) {
      return;
    }
    return (
      <>
        {results.length > 0
          ? "Click on a user below to invite them to this project."
          : undefined}
        <ListGroup
          style={{ maxHeight: "250px", overflow: "auto", margin: "15px" }}
        >
          {results.map(r => (
            <ListGroupItem
              className="webapp-collaborator-choice"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer"
              }}
              onClick={() => this.props.onSelect(r.value)}
              key={r.key}
            >
              {r.label}
            </ListGroupItem>
          ))}
        </ListGroup>
      </>
    );
  }
  render() {
    return (
      <>
        {this.render_input()}
        {this.render_results()}
      </>
    );
  }
}
