/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { debounce } from "lodash";
import {
  React,
  useEffect,
  useActions,
  useRef,
  useState,
} from "../app-framework";
import { SearchInput } from "../r_misc";

interface Props {
  default_search: string;
  open_first_project?: (boolean) => void;
  clear_and_focus_search: number; // when this changes, we clear and focus the search box.
}

export const ProjectsSearch: React.FC<Props> = ({
  default_search,
  open_first_project,
  clear_and_focus_search,
}) => {
  const [search, set_search] = useState<string>(default_search);
  const projects_search_ref = useRef<any>(null);
  const actions = useActions("projects");

  useEffect(() => {
    projects_search_ref.current?.clear_and_focus_search_input();
  }, [clear_and_focus_search]);

  const debounce_set_search = debounce((search) => {
    actions.setState({ search });
  }, 300);

  return (
    <SearchInput
      ref={projects_search_ref}
      autoFocus={true}
      value={search}
      on_change={(value) => {
        set_search(value);
        debounce_set_search(value);
      }}
      placeholder="Search for projects..."
      on_submit={(_, opts) => open_first_project?.(!opts.ctrl_down)}
    />
  );
};
