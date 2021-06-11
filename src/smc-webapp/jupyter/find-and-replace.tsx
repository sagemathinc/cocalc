/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The find and replace modal dialog
*/

import { React, Rendered, useState, useRef } from "../app-framework";
import {
  Button,
  FormControl,
  FormGroup,
  InputGroup,
  Modal,
} from "react-bootstrap";
import * as immutable from "immutable";
import { ErrorDisplay, Icon } from "../r_misc";
import { find_matches } from "./find";
import { JupyterActions } from "./browser-actions";

interface FindAndReplaceProps {
  actions: JupyterActions;
  find_and_replace?: boolean;
  cells: immutable.Map<string, any>;
  cur_id: string;
  sel_ids?: immutable.Set<string>;
  cell_list?: immutable.List<string>;
}

function should_memoize(prev, next) {
  return !next.find_and_replace && !prev.find_and_replace;
}

export const FindAndReplace: React.FC<FindAndReplaceProps> = React.memo(
  (props: FindAndReplaceProps) => {
    const {
      actions,
      find_and_replace,
      cells,
      cur_id,
      sel_ids,
      cell_list,
    } = props;

    const [all, set_all] = useState<boolean>(false);
    const [case_sensitive, set_case_sensitive] = useState<boolean>(false);
    const [regexp, set_regexp] = useState<boolean>(false);
    const [find, set_find] = useState<string>("");
    const [replace, set_replace] = useState<string>("");

    const findRef = useRef<HTMLInputElement | null>(null);
    const replaceRef = useRef<HTMLInputElement | null>(null);

    const _matches = React.useMemo(() => get_matches(), [
      cells,
      sel_ids,
      cell_list,
      regexp,
      case_sensitive,
      all,
      find,
    ]);

    function get_text(): string {
      const v: any = [];
      let sel: any = undefined;
      if (!all && sel_ids != null) {
        sel = sel_ids.add(cur_id);
      }
      if (cell_list != null) {
        cell_list.forEach((id: string) => {
          if (sel == null || sel.has(id)) {
            const cell = cells.get(id);
            v.push(cell.get("input", ""));
          }
        });
      }
      return v.join("\n");
    }

    function get_matches() {
      const text = get_text();
      const { matches, abort, error } = find_matches(
        find,
        text,
        case_sensitive,
        regexp
      );
      return { matches, abort, error, text };
    }

    function close(): void {
      actions.close_find_and_replace();
      actions.focus(true);
    }

    function focus(): void {
      findRef.current?.focus();
    }

    function render_case_button(): Rendered {
      return (
        <Button
          onClick={() => {
            set_case_sensitive(!case_sensitive);
            focus();
          }}
          title="Match case"
          active={case_sensitive}
        >
          Aa
        </Button>
      );
    }

    function render_regexp_button(): Rendered {
      return (
        <Button
          onClick={() => {
            set_regexp(!regexp);
            focus();
          }}
          title="Use regex (JavaScript regex syntax)"
          active={regexp}
        >
          .*
        </Button>
      );
    }

    function render_all_button(): Rendered {
      return (
        <Button
          onClick={() => {
            set_all(!all);
            focus();
          }}
          title="Replace in all cells"
          active={all}
        >
          <Icon name="arrows-v" />
        </Button>
      );
    }

    function render_find(): Rendered {
      let place: string = "Find";
      if (case_sensitive) {
        place += " case sensitive";
      }
      if (regexp) {
        place += " regular expression";
      }
      return (
        <FormControl
          autoFocus={true}
          inputRef={(node) => (findRef.current = node)}
          type="text"
          placeholder={place}
          value={find}
          onChange={() => set_find(findRef.current?.value ?? "")}
        />
      );
    }

    function render_replace(): Rendered {
      return (
        <FormControl
          style={{ marginTop: "15px" }}
          inputRef={(node) => (replaceRef.current = node)}
          type="text"
          placeholder="Replace"
          value={replace}
          onChange={() => set_replace(replaceRef.current?.value ?? "")}
        />
      );
    }

    function render_form(): Rendered {
      return (
        <form>
          <FormGroup>
            <InputGroup>
              <InputGroup.Button>
                {render_case_button()}
                {render_regexp_button()}
                {render_all_button()}
              </InputGroup.Button>
              {render_find()}
            </InputGroup>
            {render_replace()}
          </FormGroup>
        </form>
      );
    }

    function render_abort(n = 0): Rendered {
      return <div>Only showing first {n} matches</div>;
    }

    function render_error(error: any): Rendered {
      return <ErrorDisplay error={error} style={{ margin: "1ex" }} />;
    }

    function render_matches_title(n = 0): Rendered {
      let s: string;
      if (n === 0) {
        s = "No matches";
      } else {
        s = `${n} match${n !== 1 ? "es" : ""}`;
      }
      return <h5>{s}</h5>;
    }

    function render_matches(matches, text: string): Rendered {
      if (matches == null) {
        return render_matches_title();
      }
      const v: Rendered[] = [];
      let i = 0;
      let line_start = 0;
      let key = 0;
      for (const line of text.split("\n")) {
        const line_stop = line_start + line.length;
        const w: Rendered[] = []; // current line
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
          {render_matches_title(matches.length)}
          <pre style={{ color: "#666", maxHeight: "50vh" }}>{v}</pre>
        </div>
      );
    }

    function do_replace(cnt?: number): void {
      const matches = _matches != null ? _matches.matches : undefined;
      if (matches == null) {
        return;
      }
      let sel: any = undefined;
      if (!all) {
        sel = sel_ids?.add(cur_id);
      }
      let i = 0;
      let cell_start = 0;
      let replace_count = 0;
      if (cell_list != null) {
        cell_list.forEach((id: string) => {
          if (sel != null && !sel.has(id)) {
            return;
          }
          if (cnt != null && replace_count >= cnt) {
            return false; // done
          }
          const cell = cells.get(id);
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
            actions.set_cell_input(id, new_input, false);
          }
          cell_start = cell_stop + 1; // +1 for the final newline
        });
      }
      actions._sync();
    }

    function render_results(): Rendered {
      const { matches, abort, error, text } = _matches;
      if (error) {
        return render_error(error);
      }
      return (
        <div>
          {abort
            ? render_abort(matches != null ? matches.length : undefined)
            : undefined}
          {render_matches(matches, text)}
        </div>
      );
    }

    function title(): string {
      let s = "Find and Replace in ";
      if (!find_and_replace) {
        return s;
      }
      if (all) {
        s += `All ${cells.size} Cells`;
      } else {
        if ((sel_ids == null ? 0 : sel_ids.size || 0) === 0) {
          s += "the Current Cell";
        } else {
          const num = (sel_ids && sel_ids.add(cur_id).size) || 1;
          s += `${num} Selected Cell${num > 1 ? "s" : ""}`;
        }
      }
      return s;
    }

    function render_replace_one_button(): Rendered {
      const num = num_matches();
      return (
        <Button
          onClick={() => do_replace(1)}
          bsStyle="primary"
          disabled={num === 0}
        >
          {replace_action()} First Match
        </Button>
      );
    }

    function num_matches(): number {
      return _matches?.matches?.length ?? 0;
    }

    function replace_action(): string {
      if (replace) {
        return "Replace";
      } else {
        return "Delete";
      }
    }

    function render_replace_all_button(): Rendered {
      let s: string;
      const num = num_matches();
      if (num > 1) {
        s = `${num} Matches`;
      } else if (num > 0) {
        s = "One Match";
      } else {
        s = "All";
      }
      return (
        <Button
          onClick={() => do_replace()}
          bsStyle="primary"
          disabled={num === 0}
        >
          {replace_action()} {s}
        </Button>
      );
    }

    if (!find_and_replace) return <span />;

    return (
      <Modal show={find_and_replace} bsSize="large" onHide={close}>
        <Modal.Header closeButton>
          <Modal.Title>
            <Icon name="search" /> {title()}{" "}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {render_form()}
          {render_results()}
        </Modal.Body>

        <Modal.Footer>
          {render_replace_one_button()}
          {render_replace_all_button()}
          <Button onClick={close}>Close</Button>
        </Modal.Footer>
      </Modal>
    );
  },
  should_memoize
);
