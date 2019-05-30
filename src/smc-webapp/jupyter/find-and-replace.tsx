/*
The find and replace modal dialog
*/

import { React, Component } from "../app-framework"; // TODO: this will move
import {
  Button,
  FormControl,
  FormGroup,
  InputGroup,
  Modal
} from "react-bootstrap";
import * as immutable from "immutable";
const { ErrorDisplay, Icon } = require("../r_misc");
const { find_matches } = require("./find");

interface FindAndReplaceProps {
  actions: any;
  find_and_replace?: boolean;
  cells: immutable.Map<any, any>;
  sel_ids?: immutable.Set<any>;
  cur_id?: string;
  cell_list?: immutable.List<any>;
}

interface FindAndReplaceState {
  all: boolean;
  case: boolean;
  regexp: boolean;
  find: string;
  replace: string;
}

export class FindAndReplace extends Component<
  FindAndReplaceProps,
  FindAndReplaceState
> {
  private findRef: HTMLInputElement;
  private replaceRef: HTMLInputElement;
  private _matches: any;
  constructor(props: FindAndReplaceProps, context: any) {
    super(props, context);
    this.state = {
      all: false,
      case: false,
      regexp: false,
      find: "",
      replace: ""
    };
  }
  shouldComponentUpdate(nextProps) {
    if (!nextProps.find_and_replace && !this.props.find_and_replace) {
      return false;
    }
    return true;
  }

  close = () => {
    this.props.actions.close_find_and_replace();
    return this.props.actions.focus(true);
  };

  focus = () => this.findRef.focus();

  render_case_button() {
    return (
      <Button
        onClick={() => {
          this.setState({ case: !this.state.case });
          this.focus();
        }}
        title="Match case"
        active={this.state.case}
      >
        Aa
      </Button>
    );
  }

  render_regexp_button() {
    return (
      <Button
        onClick={() => {
          this.setState({ regexp: !this.state.regexp });
          this.focus();
        }}
        title="Use regex (JavaScript regex syntax)"
        active={this.state.regexp}
      >
        .*
      </Button>
    );
  }

  render_all_button() {
    return (
      <Button
        onClick={() => {
          this.setState({ all: !this.state.all });
          this.focus();
        }}
        title="Replace in all cells"
        active={this.state.all}
      >
        <Icon name="arrows-v" />
      </Button>
    );
  }

  render_find() {
    let place = "Find";
    if (this.state.case) {
      place += " case sensitive";
    }
    if (this.state.regexp) {
      place += " regular expression";
    }
    return (
      <FormControl
        autoFocus={true}
        inputRef={node => (this.findRef = node)}
        type="text"
        placeholder={place}
        value={this.state.find}
        onChange={() => this.setState({ find: this.findRef.value })}
      />
    );
  }

  render_replace() {
    return (
      <FormControl
        style={{ marginTop: "15px" }}
        inputRef={node => (this.replaceRef = node)}
        type="text"
        placeholder="Replace"
        value={this.state.replace}
        onChange={() => this.setState({ replace: this.replaceRef.value })}
      />
    );
  }

  render_form() {
    return (
      <form>
        <FormGroup>
          <InputGroup>
            <InputGroup.Button>
              {this.render_case_button()}
              {this.render_regexp_button()}
              {this.render_all_button()}
            </InputGroup.Button>
            {this.render_find()}
          </InputGroup>
          {this.render_replace()}
        </FormGroup>
      </form>
    );
  }

  get_text() {
    const v: any = [];
    let sel: any = undefined;
    if (!this.state.all && this.props.sel_ids != null) {
      sel = this.props.sel_ids.add(this.props.cur_id);
    }
    if (this.props.cell_list != null) {
      this.props.cell_list.forEach((id: string) => {
        if (sel == null || sel.has(id)) {
          const cell = this.props.cells.get(id);
          v.push(cell.get("input", ""));
        }
      });
    }
    return v.join("\n");
  }

  get_matches() {
    const text = this.get_text();
    const x = find_matches(
      this.state.find,
      text,
      this.state.case,
      this.state.regexp
    );
    x.text = text;
    return x;
  }

  render_abort(n = 0) {
    return <div>Only showing first {n} matches</div>;
  }

  render_error(error: any) {
    return <ErrorDisplay error={error} style={{ margin: "1ex" }} />;
  }

  render_matches_title(n = 0) {
    let s: string;
    if (n === 0) {
      s = "No matches";
    } else {
      s = `${n} match${n !== 1 ? "es" : ""}`;
    }
    return <h5>{s}</h5>;
  }

  render_matches(matches, text) {
    if (matches == null) {
      return this.render_matches_title(
        matches != null ? matches.length : undefined
      );
    }
    const v: any[] = [];
    let i = 0;
    let line_start = 0;
    let key = 0;
    for (let line of text.split("\n")) {
      const line_stop = line_start + line.length;
      const w: any[] = []; // current line
      let s = 0;
      while (i < matches.length) {
        const { start, stop } = matches[i];
        if (start >= line_stop) {
          // done -- starts on next line (or later)
          break;
        }
        const b_start = Math.max(s, start - line_start);
        const b_stop = Math.min(line.length, stop - line_start);
        w.push(<span key={key}>{line.slice(s, b_start)}</span>);
        key += 1;
        w.push(
          <span key={key} style={{ backgroundColor: "#ffa" }}>
            {line.slice(b_start, b_stop)}
          </span>
        );
        key += 1;
        s = b_stop;
        if (b_stop <= line_stop) {
          // all on this line
          i += 1;
        } else {
          // spans multiple lines; but done with this line
          break;
        }
      }
      if (s < line.length) {
        w.push(<span key={key}>{line.slice(s)}</span>);
        key += 1;
      }
      v.push(<div key={key}>{w}</div>);
      key += 1;
      line_start = line_stop + 1;
    } // +1 for the newline

    return (
      <div>
        {this.render_matches_title(
          matches != null ? matches.length : undefined
        )}
        <pre style={{ color: "#666", maxHeight: "50vh" }}>{v}</pre>
      </div>
    );
  }

  replace(cnt?: number) {
    const matches = this._matches != null ? this._matches.matches : undefined;
    if (matches == null) {
      return;
    }
    let sel: any = undefined;
    if (!this.state.all) {
      sel =
        this.props.sel_ids != null
          ? this.props.sel_ids.add(this.props.cur_id)
          : undefined;
    }
    let i = 0;
    let cell_start = 0;
    const { replace } = this.state;
    let replace_count = 0;
    if (this.props.cell_list != null) {
      this.props.cell_list.forEach((id: string) => {
        if (sel != null && !sel.has(id)) {
          return;
        }
        if (cnt != null && replace_count >= cnt) {
          return false; // done
        }
        const cell = this.props.cells.get(id);
        const input = cell.get("input", "");
        const cell_stop = cell_start + input.length;
        let new_input = ""; // will be new input after replace
        let s = 0;
        while (i < matches.length) {
          if (cnt != null && replace_count >= cnt) {
            // done
            i = matches.length;
            break;
          }
          const { start, stop } = matches[i];
          if (start >= cell_stop) {
            // done -- starts in next cell
            break;
          }
          const b_start = Math.max(s, start - cell_start);
          const b_stop = Math.min(input.length, stop - cell_start);
          new_input += input.slice(s, b_start);
          new_input += replace;
          replace_count += 1;
          s = b_stop;
          if (b_stop <= cell_stop) {
            // all in this cell
            i += 1;
          } else {
            // spans multiple cells; but done with this cell
            break;
          }
        }
        if (s < input.length) {
          new_input += input.slice(s);
        }
        if (input !== new_input) {
          this.props.actions.set_cell_input(id, new_input, false);
        }
        cell_start = cell_stop + 1; // +1 for the final newline
      });
    }
    return this.props.actions._sync();
  }

  render_results() {
    const { matches, abort, error, text } = this._matches;
    if (error) {
      return this.render_error(error);
    }
    return (
      <div>
        {abort
          ? this.render_abort(matches != null ? matches.length : undefined)
          : undefined}
        {this.render_matches(matches, text)}
      </div>
    );
  }

  title() {
    let s = "Find and Replace in ";
    if (!this.props.find_and_replace) {
      return s;
    }
    if (this.state.all) {
      s += `All ${this.props.cells.size} Cells`;
    } else {
      if (
        (this.props.sel_ids == null ? 0 : this.props.sel_ids.size || 0) === 0
      ) {
        s += "the Current Cell";
      } else {
        const num =
          (this.props.sel_ids &&
            this.props.sel_ids.add(this.props.cur_id).size) ||
          1;
        s += `${num} Selected Cell${num > 1 ? "s" : ""}`;
      }
    }
    return s;
  }

  render_replace_one_button() {
    const num = this.num_matches();
    return (
      <Button
        onClick={() => this.replace(1)}
        bsStyle="primary"
        disabled={num === 0}
      >
        {this.replace_action()} First Match
      </Button>
    );
  }

  num_matches() {
    if (
      this._matches &&
      this._matches.matches &&
      this._matches.matches.length
    ) {
      return this._matches.matches.length || 0;
    }
    return 0;
  }

  replace_action() {
    if (this.state.replace) {
      return "Replace";
    } else {
      return "Delete";
    }
  }

  render_replace_all_button() {
    let s: string;
    const num = this.num_matches();
    if (num > 1) {
      s = `${num} Matches`;
    } else if (num > 0) {
      s = "One Match";
    } else {
      s = "All";
    }
    return (
      <Button
        onClick={() => this.replace()}
        bsStyle="primary"
        disabled={num === 0}
      >
        {this.replace_action()} {s}
      </Button>
    );
  }

  render() {
    if (!this.props.find_and_replace) return <span/>;
    this._matches = this.get_matches();
    return (
      <Modal
        show={this.props.find_and_replace}
        bsSize="large"
        onHide={this.close}
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <Icon name="search" /> {this.title()}{" "}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {this.render_form()}
          {this.render_results()}
        </Modal.Body>

        <Modal.Footer>
          {this.render_replace_one_button()}
          {this.render_replace_all_button()}
          <Button onClick={this.close}>Close</Button>
        </Modal.Footer>
      </Modal>
    );
  }
}
