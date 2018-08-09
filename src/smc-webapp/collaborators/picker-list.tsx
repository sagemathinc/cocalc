import * as React from "react";

import {
  ListGroup,
  ListGroupItem,
  FormGroup,
  FormControl,
  HelpBlock,
  Button,
  Glyphicon
} from "react-bootstrap";

const { Loading, LabeledRow } = require("../r_misc");

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
      <LabeledRow label="Search">
        <FormGroup>
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
      </LabeledRow>
    );
  }
  render_results() {
    const { results, isLoading } = this.props;
    if (isLoading) {
      return <Loading />;
    }
    if (results === undefined || results.length === 0) {
      return;
    }
    return (
      <ListGroup
        style={{ maxHeight: "250px", overflow: "auto", margin: "15px" }}
      >
        {results.map(r => (
          <ListGroupItem
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
            key={r.key}
          >
            {r.label}
            <Button onClick={() => this.props.onSelect(r.value)}>
              <Glyphicon glyph="plus" /> Add to Invitation...
            </Button>
          </ListGroupItem>
        ))}
      </ListGroup>
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
