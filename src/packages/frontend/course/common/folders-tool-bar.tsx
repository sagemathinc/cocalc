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
  useIsMountedRef,
  useRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { SearchInput } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Col, Row } from "antd";
import * as immutable from "immutable";
import { COLORS } from "@cocalc/util/theme";
import { SEARCH_STYLE } from "./consts";
import { MultipleAddSearch } from "./multiple-add-search";

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
  project_id: string;
  items: immutable.Map<string, any>;
  add_folders: (folders: string[]) => void; // add_folders (Iterable<T>)
  item_name: string;
  plural_item_name: string;
}

// interface FoldersToolbarState {
//   add_is_searching: boolean;
//   add_search_results?: immutable.List<string>;
//   none_found: boolean;
//   last_add_search: string;
//   err?: string;
// }

export const FoldersToolbar: React.FC<FoldersToolbarProps> = (
  props: FoldersToolbarProps
) => {
  const {
    search_change,
    num_omitted,
    project_id,
    add_folders,
    items,
    search: propsSearch,
    item_name = "item",
    plural_item_name = "item",
  } = props;

  const isMounted = useIsMountedRef();
  const last_add_search = useRef<string>("");

  const [add_is_searching, set_add_is_searching] = useState(false);
  const [add_search_results, set_add_search_results] = useState<
    immutable.List<string> | undefined
  >(immutable.List());
  const [none_found, set_none_found] = useState(false);
  const [err, set_err] = useState<string | undefined>();

  function searchQuery(search: string) {
    return `*${search}*`;
  }

  async function do_add_search(search): Promise<void> {
    search = search.trim();

    if (add_is_searching && search === last_add_search.current) {
      return;
    }

    set_add_is_searching(true);
    last_add_search.current = search;

    let resp;
    try {
      resp = await webapp_client.project_client.find_directories({
        project_id: project_id,
        query: searchQuery(search),
      });
      if (!isMounted.current) {
        return;
      }
    } catch (err) {
      if (!isMounted.current) return;
      set_add_is_searching(false);
      set_err(err);
      set_add_search_results(undefined);
      return;
    }

    if (resp.directories.length === 0) {
      set_add_is_searching(false);
      set_add_search_results(immutable.List([]));
      set_none_found(true);
      return;
    }

    const filtered_results = filter_results(resp.directories, search, items);
    // Merge to prevent possible massive list alterations
    const merged = (function () {
      if (
        add_search_results &&
        filtered_results.length === add_search_results.size
      ) {
        return add_search_results.merge(filtered_results);
      } else {
        return immutable.List(filtered_results);
      }
    })();

    set_add_is_searching(false);
    set_add_search_results(merged);
    set_none_found(false);
  }

  function submit_selected(path_list) {
    if (path_list != null) {
      // If nothing is selected and the user clicks the button to "Add handout (etc)" then
      // path_list is undefined, hence don't do
      // (NOTE: I'm also going to make it so that button is disabled, which fits our
      // UI guidelines, so there's two reasons that path_list is defined here.)
      add_folders(path_list);
    }
    return clear_add_search();
  }

  function clear_add_search(): void {
    set_add_search_results(immutable.List([]));
    set_none_found(false);
  }

  return (
    <div>
      <Row>
        <Col md={6}>
          <SearchInput
            placeholder={`Find ${plural_item_name}...`}
            default_value={propsSearch}
            on_change={search_change}
            style={SEARCH_STYLE}
          />
        </Col>
        <Col md={8}>
          {num_omitted ? (
            <h5
              style={{
                textAlign: "center",
                color: COLORS.GRAY_L,
                marginTop: "5px",
              }}
            >
              (Omitting {num_omitted}{" "}
              {num_omitted > 1 ? plural_item_name : item_name})
            </h5>
          ) : undefined}
        </Col>
        <Col md={10}>
          <MultipleAddSearch
            add_selected={submit_selected}
            do_search={do_add_search}
            clear_search={clear_add_search}
            is_searching={add_is_searching}
            item_name={item_name}
            err={err}
            search_results={add_search_results}
            none_found={none_found}
          />
        </Col>
      </Row>
    </div>
  );
};
