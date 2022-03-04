/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// BUG:
//
//  - this code is buggy since the SearchInput component below is NOT controlled,
//    but some of the code assumes it is, which makes no sense.
//    E.g., there is a clear_search prop that is passed in, which is
//    nonsense, because the state of the search is local to the
//    SearchInput. That's why the calls to clear
//    the search in all the code below are all broken.
//

import {
  Button,
  ButtonGroup,
  FormControl,
  FormGroup,
} from "@cocalc/frontend/antd-bootstrap";
import { Component, ReactDOM, Rendered } from "@cocalc/frontend/app-framework";
import { Icon, SearchInput, Space } from "@cocalc/frontend/components";
import { is_different } from "@cocalc/util/misc";
import { Card } from "antd";
import * as immutable from "immutable";
import { isEqual } from "lodash";
import { SEARCH_STYLE } from "./consts";

interface MultipleAddSearchProps {
  add_selected: (keys: string[]) => void; // Submit user selected results add_selected(['paths', 'of', 'folders'])
  do_search: (value: string) => void; // Submit search query, invoked as do_search(value)
  clear_search: () => void;
  is_searching: boolean; // whether or not it is asking the backend for the result of a search
  search_results?: immutable.List<string>; // contents to put in the selection box after getting search result back
  item_name: string;
  none_found: boolean;
  err?: string;
}

interface MultipleAddSearchState {
  selected_items: string[];
  show_selector: boolean;
}

// Multiple result selector
// use on_change and search to control the search bar.
// Coupled with Assignments Panel and Handouts Panel
export class MultipleAddSearch extends Component<
  MultipleAddSearchProps,
  MultipleAddSearchState
> {
  private search?: string;

  constructor(props) {
    super(props);
    this.state = {
      selected_items: [], // currently selected options
      show_selector: false,
    };
  }

  static defaultProps = { item_name: "result" };

  shouldComponentUpdate(newProps, newState) {
    return (
      is_different(this.props, newProps, [
        "search_results",
        "item_name",
        "is_searching",
        "none_found",
      ]) ||
      !isEqual(newState.selected_items, this.state.selected_items)
    );
  }

  componentWillReceiveProps(newProps) {
    return this.setState({
      show_selector:
        newProps.search_results != null && newProps.search_results.size > 0,
    });
  }

  clear_and_focus_search_input = () => {
    this.props.clear_search();
    return this.setState({ selected_items: [] });
  };

  search_button() {
    if (this.props.is_searching) {
      // Currently doing a search, so show a spinner
      return (
        <Button>
          <Icon name="cocalc-ring" spin />
        </Button>
      );
    } else if (this.state.show_selector) {
      // There is something in the selection box -- so only action is to clear the search box.
      return (
        <Button onClick={this.clear_and_focus_search_input}>
          <Icon name="times-circle" />
        </Button>
      );
    } else {
      // Waiting for user to start a search
      return (
        <Button onClick={() => this.props.do_search(this.search ?? "")}>
          <Icon name="search" />
        </Button>
      );
    }
  }

  add_button_clicked = (e) => {
    e.preventDefault();
    if (this.state.selected_items.length === 0) {
      const first_entry = ReactDOM.findDOMNode(this.refs.selector)?.firstChild
        .value;
      if (first_entry == null) return;
      this.props.add_selected([first_entry]);
    } else {
      this.props.add_selected(this.state.selected_items);
    }
    return this.clear_and_focus_search_input();
  };

  change_selection = (e) => {
    const v: string[] = [];
    for (const option of e.target.selectedOptions) {
      v.push(option.label);
    }
    return this.setState({ selected_items: v });
  };

  render_results_list() {
    if (this.props.search_results == undefined) {
      return;
    }
    const v: any[] = [];
    this.props.search_results.map((item) => {
      return v.push(
        <option key={item} value={item} label={item}>
          {item}
        </option>
      );
    });
    return v;
  }

  render_add_selector() {
    return (
      <FormGroup>
        <FormControl
          componentClass="select"
          multiple
          ref="selector"
          size={5}
          rows={10}
          onChange={this.change_selection}
          style={{ marginTop: "15px" }}
        >
          {this.render_results_list()}
        </FormControl>
        <ButtonGroup style={{ marginTop: "15px" }}>
          {this.render_add_selector_button()}
          <Button onClick={this.clear_and_focus_search_input}>Cancel</Button>
        </ButtonGroup>
      </FormGroup>
    );
  }

  render_add_selector_button() {
    const num_items_selected =
      this.state.selected_items.length != null
        ? this.state.selected_items.length
        : 0;
    const btn_text = (() => {
      if (this.props.search_results == undefined) {
        return "";
      }
      switch (this.props.search_results.size) {
        case 0:
          return `No ${this.props.item_name} found`;
        case 1:
          return `Add ${this.props.item_name}`;
        default:
          switch (num_items_selected) {
            case 0:
            case 1:
              return `Add selected ${this.props.item_name}`;
            default:
              return `Add ${num_items_selected} ${this.props.item_name}s`;
          }
      }
    })();
    return (
      <Button
        disabled={
          this.props.search_results == undefined ||
          this.props.search_results.size === 0
        }
        onClick={this.add_button_clicked}
      >
        <Icon name="plus" /> {btn_text}
      </Button>
    );
  }

  private render_create_new_assignment(): Rendered {
    if (!this.search) return;
    let target = this.search.trim();
    while (target[target.length - 1] == "/") {
      // strip trailing /'s; people's fingers may want to type them
      // if they think of assignments as directories (which they should).
      target = target.slice(0, target.length - 1);
    }
    if (!target) return;

    return (
      <Card
        style={{ margin: "15px 0" }}
        title={"Create assignment or handout folder"}
      >
        Create '{target}'?
        <br />
        <br />
        <Button onClick={() => this.clear_and_focus_search_input()}>
          Cancel
        </Button>
        <Space />
        <Button
          bsStyle="primary"
          onClick={() => {
            this.props.add_selected([target]);
            this.props.clear_search();
          }}
        >
          Yes, create it
        </Button>
      </Card>
    );
  }

  render() {
    return (
      <div>
        <SearchInput
          autoFocus={true}
          default_value=""
          placeholder={`Add or create ${this.props.item_name} by directory name...`}
          on_change={(search) => {
            this.search = search;
          }}
          on_submit={(search) => {
            this.props.do_search(search);
          }}
          on_clear={this.clear_and_focus_search_input}
          buttonAfter={this.search_button()}
          style={SEARCH_STYLE}
        />
        {this.props.none_found
          ? this.render_create_new_assignment()
          : undefined}
        {this.state.show_selector ? this.render_add_selector() : undefined}
      </div>
    );
  }
}
