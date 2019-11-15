/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
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

import * as underscore from "underscore";
import * as immutable from "immutable";

// CoCalc libraries
import { is_different } from "smc-util/misc";
import { webapp_client } from "../../webapp-client";

// React libraries
import { React, ReactDOM, Component } from "../../app-framework";
import { Icon, SearchInput, SkinnyError } from "../../r_misc";
import {
  Button,
  ButtonToolbar,
  FormControl,
  FormGroup,
  Row,
  Col,
  Grid
} from "react-bootstrap";

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
// use on_change and search to control the search bar
// Coupled with Assignments Panel and Handouts Panel
class MultipleAddSearch extends Component<
  MultipleAddSearchProps,
  MultipleAddSearchState
> {
  constructor(props) {
    super(props);
    this.state = {
      selected_items: [], // currently selected options
      show_selector: false
    };
  }

  static defaultProps = { item_name: "result" };

  shouldComponentUpdate(newProps, newState) {
    return (
      is_different(this.props, newProps, [
        "search_results",
        "item_name",
        "is_searching",
        "none_found"
      ]) ||
      !underscore.isEqual(newState.selected_items, this.state.selected_items)
    );
  }

  componentWillReceiveProps(newProps) {
    return this.setState({
      show_selector:
        newProps.search_results != null && newProps.search_results.size > 0
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
        <Button onClick={e => (this.refs.search_input as any).submit(e)}>
          <Icon name="search" />
        </Button>
      );
    }
  }

  add_button_clicked = e => {
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

  change_selection = e => {
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
    this.props.search_results.map(item => {
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
        <ButtonToolbar style={{ marginTop: "15px" }}>
          {this.render_add_selector_button()}
          <Button onClick={this.clear_and_focus_search_input}>Cancel</Button>
        </ButtonToolbar>
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

  render() {
    return (
      <div>
        <SearchInput
          autoFocus={true}
          ref="search_input"
          default_value=""
          placeholder={`Add ${this.props.item_name} by folder name (enter to see available folders)...`}
          on_submit={this.props.do_search}
          on_clear={this.clear_and_focus_search_input}
          buttonAfter={this.search_button()}
          style={SEARCH_STYLE}
        />
        {this.props.none_found ? (
          <SkinnyError
            error_text="No matching folders were found"
            on_close={this.clear_and_focus_search_input}
          />
        ) : (
          undefined
        )}
        {this.state.show_selector ? this.render_add_selector() : undefined}
      </div>
    );
  }
}

// Filter directories based on contents of all_items
const filter_results = function(directories, search, all_items) {
  if (directories.length > 0) {
    // Omit any -collect directory (unless explicitly searched for).
    // Omit any currently assigned directory
    const paths_to_omit: string[] = [];

    const active_items = all_items.filter(val => !val.get("deleted"));
    active_items.map(val => {
      const path = val.get("path");
      if (path) {
        // path might not be set in case something went wrong (this has been hit in production)
        return paths_to_omit.push(path);
      }
    });

    const should_omit = path => {
      if (path.indexOf("-collect") !== -1 && search.indexOf("collect") === -1) {
        // omit assignment collection folders unless explicitly searched (could cause confusion...)
        return true;
      }
      return paths_to_omit.includes(path);
    };

    directories = directories.filter(x => !should_omit(x));
    directories.sort();
  }
  return directories;
};

interface FoldersToolbarProps {
  search?: string;
  search_change: (search_value: string) => void; // search_change(current_search_value)
  num_omitted?: number;
  project_id?: string;
  items: object;
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
  constructor(props) {
    super(props);
    this.state = {
      add_is_searching: false,
      add_search_results: immutable.List([]),
      none_found: false,
      last_add_search: "",
      err: undefined
    };
  }

  static defaultProps = {
    item_name: "item",
    plural_item_name: "items"
  };

  do_add_search = search => {
    search = search.trim();

    if (this.state.add_is_searching && search === this.state.last_add_search) {
      return;
    }

    this.setState({ add_is_searching: true, last_add_search: search });

    webapp_client.find_directories({
      project_id: this.props.project_id,
      query: `*${search}*`,
      cb: (err, resp) => {
        // Disregard the results of this search of a new one was already submitted
        if (this.state.last_add_search !== search) {
          return;
        }

        if (err) {
          this.setState({
            add_is_searching: false,
            err,
            add_search_results: undefined
          });
          return;
        }

        if (resp.directories.length === 0) {
          this.setState({
            add_is_searching: false,
            add_search_results: immutable.List([]),
            none_found: true
          });
          return;
        }

        return this.setState(function(state, props) {
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
            none_found: false
          };
        });
      }
    });
  };

  submit_selected = path_list => {
    if (path_list != null) {
      // If nothing is selected and the user clicks the button to "Add handout (etc)" then
      // path_list is undefined, hence don't do this.
      // (NOTE: I'm also going to make it so that button is disabled, which fits our
      // UI guidelines, so there's two reasons that path_list is defined here.)
      this.props.add_folders(path_list);
    }
    return this.clear_add_search();
  };

  clear_add_search = () => {
    return this.setState({
      add_search_results: immutable.List([]),
      none_found: false
    });
  };

  render() {
    return (
      <Grid fluid={true} style={{ width: "100%" }}>
        <Row>
          <Col md={3}>
            <SearchInput
              placeholder={`Find ${this.props.plural_item_name}...`}
              default_value={this.props.search}
              on_change={this.props.search_change}
              style={SEARCH_STYLE}
            />
          </Col>
          <Col md={4}>
            {this.props.num_omitted ? (
              <h5>
                (Omitting {this.props.num_omitted}{" "}
                {this.props.num_omitted > 1
                  ? this.props.plural_item_name
                  : this.props.item_name}
                )
              </h5>
            ) : (
              undefined
            )}
          </Col>
          <Col md={5}>
            <MultipleAddSearch
              add_selected={this.submit_selected}
              do_search={this.do_add_search}
              clear_search={this.clear_add_search}
              is_searching={this.state.add_is_searching}
              item_name={this.props.item_name}
              err={undefined}
              search_results={this.state.add_search_results}
              none_found={this.state.none_found}
            />
          </Col>
        </Row>
      </Grid>
    );
  }
}
