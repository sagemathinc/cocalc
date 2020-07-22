/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Searching for tasks by full text search and done/deleted status.
*/

import { React, ReactDOM, useEffect, useRef } from "../../app-framework";

import { Icon } from "../../r_misc";
import {
  Button,
  FormControl,
  FormGroup,
  InputGroup,
} from "../../antd-bootstrap";
import { ShowToggle } from "./show-toggle";
import { EmptyTrash } from "./empty-trash";
import { TaskActions } from "./actions";
import { Counts, LocalViewStateMap } from "./types";

interface Props {
  actions: TaskActions;
  local_view_state: LocalViewStateMap;
  counts: Counts;
  focus_find_box?: boolean;
}

export const Find: React.FC<Props> = React.memo(
  ({ actions, local_view_state, counts, focus_find_box }) => {
    useEffect(() => {
      if (focus_find_box) {
        ReactDOM.findDOMNode(search_ref.current)?.focus();
      }
    }, [focus_find_box]);

    const search_ref = useRef(null);

    function render_toggle(type: "deleted" | "done") {
      const count = counts.get(type);
      const show = local_view_state.get(`show_${type}`);
      return (
        <div style={{ minWidth: "150px", padding: "2px 5px" }}>
          <ShowToggle actions={actions} type={type} show={show} count={count} />
          {show && type === "deleted" && count > 0 && (
            <EmptyTrash actions={actions} count={count} />
          )}
        </div>
      );
    }

    function key_down(evt) {
      if (evt.which === 27) {
        actions.set_local_view_state({ search: "" });
        ReactDOM.findDOMNode(search_ref.current).blur();
        return false;
      }
    }

    function clear_and_focus_search_input() {
      actions.set_local_view_state({ search: "" });
      ReactDOM.findDOMNode(search_ref.current)?.focus();
    }

    function render_search() {
      return (
        <FormGroup style={{ marginBottom: 0, marginRight: "20px" }}>
          <InputGroup>
            <FormControl
              type="text"
              ref={search_ref}
              componentClass="input"
              placeholder={"Search for tasks..."}
              value={local_view_state.get("search") ?? ""}
              onChange={() =>
                actions.set_local_view_state({
                  search: ReactDOM.findDOMNode(search_ref.current).value,
                })
              }
              onBlur={() => actions.blur_find_box()}
              onFocus={() => actions.disable_key_handler()}
              onKeyDown={key_down}
            />
            <InputGroup.Button>
              <Button onClick={clear_and_focus_search_input}>
                <Icon name="times-circle" />
              </Button>
            </InputGroup.Button>
          </InputGroup>
        </FormGroup>
      );
    }

    return (
      <div style={{ display: "flex", marginLeft: "5px" }}>
        {render_search()}
        {render_toggle("done")}
        {render_toggle("deleted")}
      </div>
    );
  }
);
