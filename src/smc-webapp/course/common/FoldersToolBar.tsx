//##############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016 -- 2017, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

/*
BUG:

 - this code is buggy since the SearchInput component below is NOT controlled,
   but some of the code assumes it is, which makes no sense.
   E.g., there is a clear_search prop that is passed in, which is
   nonsense, because the state of the search is local to the
   SearchInput. That's why the calls to clear
   the search in all the code below are all broken.

*/

import * as underscore from "underscore";
import * as immutable from "immutable";

// CoCalc libraries
import { is_different } from "smc-util/misc";
import { webapp_client } from "../../webapp-client";

// React libraries
import { React, ReactDOM, Component, Rendered } from "../../app-framework";
import { Icon, SearchInput, Space } from "../../r_misc";
import {
  Button,
  ButtonGroup,
  FormControl,
  FormGroup,
} from "../../antd-bootstrap";

import { Card, Row, Col } from "antd";

import { callback2 } from "smc-util/async-utils";

const SEARCH_STYLE = { marginBottom: "0px" };

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
class MultipleAddSearch extends Component<
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
      !underscore.isEqual(newState.selected_items, this.state.selected_items)
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
          <Icon name="cc-icon-cocalc-ring" spin />
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
        <Button onClick={(e) => (this.refs.search_input as any).submit(e)}>
          <Icon name="search" />
        </Button>
      );
    }
  }

  add_button_clicked = (e) => {
    e.preventDefault();
    if (this.state.selected_items.length === 0) {
      const first_entry = ReactDOM.findDOMNode(this.refs.selector).firstChild
        .value;
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
      <Card style={{ margin: "15px 0" }} title={"Create assignment"}>
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
          ref="search_input"
          default_value=""
          placeholder={`Add ${this.props.item_name} by folder name (enter to see available folders)...`}
          on_submit={(search) => {
            this.props.do_search(search);
            this.search = search;
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

// Filter directories based on contents of all_items
function filter_results(
  directories: string[],
  search: string,
  all_items: immutable.Map<string, any>
): string[] {
  if (directories.length == 0) {
    return directories;
  }

  // Omit any -collect directory (unless explicitly searched for).
  // Omit any currently assigned directory or subdirectories of them.
  const paths_to_omit: string[] = [];

  const active_items = all_items.filter((val) => !val.get("deleted"));
  active_items.map((val) => {
    const path = val.get("path");
    if (path) {
      // path might not be set in case something went wrong (this has been hit in production)
      return paths_to_omit.push(path);
    }
  });

  function should_omit(path: string): boolean {
    if (path.indexOf("-collect") !== -1 && search.indexOf("collect") === -1) {
      // omit assignment collection folders unless explicitly searched (could cause confusion...)
      return true;
    }
    if (paths_to_omit.includes(path)) {
      return true;
    }
    // finally check if path is contained in any ommited path.
    for (const omit of paths_to_omit) {
      if (path.startsWith(omit + "/")) return true;
    }
    return false;
  }

  directories = directories.filter((x) => !should_omit(x));
  directories.sort();
  return directories;
}

interface FoldersToolbarProps {
  search?: string;
  search_change: (search_value: string) => void; // search_change(current_search_value)
  num_omitted?: number;
  project_id?: string;
  items: immutable.Map<string, any>;
  add_folders: (folders: string[]) => void; // add_folders (Iterable<T>)
  item_name: string;
  plural_item_name: string;
}

interface FoldersToolbarState {
  add_is_searching: boolean;
  add_search_results?: immutable.List<string>;
  none_found: boolean;
  last_add_search: string;
  err?: string;
}
// Definitely not a good abstraction.
// Purely for code reuse (bad reason..)
// Complects FilterSearchBar and AddSearchBar...
export class FoldersToolbar extends Component<
  FoldersToolbarProps,
  FoldersToolbarState
> {
  private is_unmounted: boolean;
  componentWillUnmount(): void {
    this.is_unmounted = true;
  }

  constructor(props) {
    super(props);
    this.state = {
      add_is_searching: false,
      add_search_results: immutable.List([]),
      none_found: false,
      last_add_search: "",
      err: undefined,
    };
  }

  static defaultProps = {
    item_name: "item",
    plural_item_name: "items",
  };

  private async do_add_search(search): Promise<void> {
    search = search.trim();

    if (this.state.add_is_searching && search === this.state.last_add_search) {
      return;
    }

    this.setState({ add_is_searching: true, last_add_search: search });

    let resp;
    try {
      resp = await callback2(webapp_client.find_directories, {
        project_id: this.props.project_id,
        query: `*${search}*`,
      });
      // Disregard the results of this search of a new one was already submitted
      if (this.is_unmounted || this.state.last_add_search !== search) {
        return;
      }
    } catch (err) {
      if (this.is_unmounted) return;
      this.setState({
        add_is_searching: false,
        err,
        add_search_results: undefined,
      });
    }

    if (resp.directories.length === 0) {
      this.setState({
        add_is_searching: false,
        add_search_results: immutable.List([]),
        none_found: true,
      });
      return;
    }

    this.setState(function (state, props) {
      let merged;
      const filtered_results = filter_results(
        resp.directories,
        search,
        props.items
      );

      // Merge to prevent possible massive list alterations
      if (
        state.add_search_results &&
        filtered_results.length === state.add_search_results.size
      ) {
        merged = state.add_search_results.merge(filtered_results);
      } else {
        merged = immutable.List(filtered_results);
      }

      return {
        add_is_searching: false,
        add_search_results: merged,
        none_found: false,
      };
    });
  }

  submit_selected = (path_list) => {
    if (path_list != null) {
      // If nothing is selected and the user clicks the button to "Add handout (etc)" then
      // path_list is undefined, hence don't do this.
      // (NOTE: I'm also going to make it so that button is disabled, which fits our
      // UI guidelines, so there's two reasons that path_list is defined here.)
      this.props.add_folders(path_list);
    }
    return this.clear_add_search();
  };

  private clear_add_search(): void {
    this.setState({
      add_search_results: immutable.List([]),
      none_found: false,
    });
  }

  render() {
    return (
      <div>
        <Row>
          <Col md={6}>
            <SearchInput
              placeholder={`Find ${this.props.plural_item_name}...`}
              default_value={this.props.search}
              on_change={this.props.search_change}
              style={SEARCH_STYLE}
            />
          </Col>
          <Col md={8}>
            {this.props.num_omitted ? (
              <h5
                style={{ textAlign: "center", color: "#666", marginTop: "5px" }}
              >
                (Omitting {this.props.num_omitted}{" "}
                {this.props.num_omitted > 1
                  ? this.props.plural_item_name
                  : this.props.item_name}
                )
              </h5>
            ) : undefined}
          </Col>
          <Col md={10}>
            <MultipleAddSearch
              add_selected={this.submit_selected.bind(this)}
              do_search={this.do_add_search.bind(this)}
              clear_search={this.clear_add_search.bind(this)}
              is_searching={this.state.add_is_searching}
              item_name={this.props.item_name}
              err={undefined}
              search_results={this.state.add_search_results}
              none_found={this.state.none_found}
            />
          </Col>
        </Row>
      </div>
    );
  }
}
