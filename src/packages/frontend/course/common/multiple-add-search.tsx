/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  Button,
  ButtonGroup,
  FormControl,
  FormGroup,
} from "@cocalc/frontend/antd-bootstrap";
import {
  React,
  ReactDOM,
  Rendered,
  useEffect,
  useRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { Icon, SearchInput, Space } from "@cocalc/frontend/components";
import { is_different } from "@cocalc/util/misc";
import { Card } from "antd";
import * as immutable from "immutable";
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

function isSame(prev, next): boolean {
  return !is_different(prev, next, [
    "search_results",
    "item_name",
    "is_searching",
    "none_found",
  ]);
}

// Multiple result selector
// use on_change and search to control the search bar.
// Coupled with Assignments Panel and Handouts Panel
export const MultipleAddSearch: React.FC<MultipleAddSearchProps> = React.memo(
  (props: MultipleAddSearchProps) => {
    const {
      add_selected,
      do_search,
      clear_search,
      is_searching,
      search_results,
      item_name = "result",
      none_found,
      // err,
    } = props;

    const selectorRef = useRef<FormControl>(null);

    const [search, setSearch] = useState<string>("");
    const [selected_items, set_selected_items] = useState<string[]>([]);
    const [show_selector, set_show_selector] = useState<boolean>(false);

    useEffect(() => {
      const num_search_results = search_results?.size ?? 0;
      set_show_selector(num_search_results > 0);
    }, [search_results]);

    function clear_and_focus_search_input() {
      clear_search();
      setSearch("");
      set_selected_items([]);
    }

    function search_button() {
      if (is_searching) {
        // Currently doing a search, so show a spinner
        return (
          <Button>
            <Icon name="cocalc-ring" spin />
          </Button>
        );
      } else if (show_selector) {
        // There is something in the selection box -- so only action is to clear the search box.
        return (
          <Button onClick={clear_and_focus_search_input}>
            <Icon name="times-circle" />
          </Button>
        );
      } else {
        // Waiting for user to start a search
        return (
          <Button onClick={() => do_search(search ?? "")}>
            <Icon name="search" />
          </Button>
        );
      }
    }

    function add_button_clicked(e): void {
      e.preventDefault();
      if (selected_items.length === 0) {
        const first_entry = ReactDOM.findDOMNode(selectorRef.current)
          ?.firstChild.value;
        if (first_entry == null) return;
        add_selected([first_entry]);
      } else {
        add_selected(selected_items);
      }
      clear_and_focus_search_input();
    }

    function change_selection(e): void {
      const v: string[] = [];
      for (const option of e.target.selectedOptions) {
        v.push(option.label);
      }
      return set_selected_items(v);
    }

    function render_results_list(): Rendered[] | undefined {
      if (search_results == undefined) {
        return;
      }
      return search_results
        .map((item) => (
          <option key={item} value={item} label={item}>
            {item}
          </option>
        ))
        .toArray();
    }

    function render_add_selector() {
      return (
        <FormGroup>
          <FormControl
            componentClass="select"
            multiple
            ref={selectorRef}
            size={5}
            rows={10}
            onChange={change_selection}
            style={{ marginTop: "15px" }}
          >
            {render_results_list()}
          </FormControl>
          <ButtonGroup style={{ marginTop: "15px" }}>
            {render_add_selector_button()}
            <Button onClick={clear_and_focus_search_input}>Cancel</Button>
          </ButtonGroup>
        </FormGroup>
      );
    }

    function render_add_selector_button() {
      const num_items_selected = selected_items?.length ?? 0;
      const btn_text = (() => {
        if (search_results == undefined) {
          return "";
        }
        switch (search_results.size) {
          case 0:
            return `No ${item_name} found`;
          case 1:
            return `Add ${item_name}`;
          default:
            switch (num_items_selected) {
              case 0:
              case 1:
                return `Add selected ${item_name}`;
              default:
                return `Add ${num_items_selected} ${item_name}s`;
            }
        }
      })();
      return (
        <Button
          disabled={search_results == undefined || search_results.size === 0}
          onClick={add_button_clicked}
        >
          <Icon name="plus" /> {btn_text}
        </Button>
      );
    }

    function render_create_new_assignment(): Rendered {
      if (!search) return;
      let target = search.trim();
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
          <Button onClick={() => clear_and_focus_search_input()}>Cancel</Button>
          <Space />
          <Button
            bsStyle="primary"
            onClick={() => {
              add_selected([target]);
              clear_search();
            }}
          >
            Yes, create it
          </Button>
        </Card>
      );
    }

    return (
      <div>
        <SearchInput
          autoFocus={true}
          default_value=""
          value={search}
          placeholder={`Add or create ${item_name} by directory name...`}
          on_change={(txt) => setSearch(txt)}
          on_submit={do_search}
          on_clear={clear_and_focus_search_input}
          buttonAfter={search_button()}
          style={SEARCH_STYLE}
        />
        {none_found ? render_create_new_assignment() : undefined}
        {show_selector ? render_add_selector() : undefined}
      </div>
    );
  },
  isSame
);
