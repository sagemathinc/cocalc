/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { delay } from "awaiting";
import { redux, rclass, rtypes, Component, Rendered } from "../app-framework";
import { Loading } from "../components";
import FileUseViewer from "./viewer";
import { Map as iMap } from "immutable";
import { MentionsMap } from "../notifications/mentions/types";

interface Props {
  // reduxProps
  file_use?: iMap<string, any>;
  get_sorted_file_use_list2?: Function;
  user_map?: iMap<string, any>;
  project_map?: iMap<string, any>;
  mentions?: MentionsMap;
  get_unseen_size?: (mentions: MentionsMap) => number;
}

class FileUsePage extends Component<Props, {}> {
  static reduxProps() {
    return {
      file_use: {
        file_use: rtypes.immutable,
        get_sorted_file_use_list2: rtypes.func,
      },
      users: {
        user_map: rtypes.immutable,
      },
      projects: {
        project_map: rtypes.immutable,
      },
      mentions: {
        mentions: rtypes.immutable.Map,
        get_unseen_size: rtypes.func,
      },
    };
  }
  componentDidMount() {
    $(document).on("click", notification_list_click_handler);
  }

  componentWillUnmount() {
    $(document).off("click", notification_list_click_handler);
  }

  render(): Rendered {
    const account = redux.getStore("account");
    if (account == null) {
      return <Loading />;
    }
    const account_id = account.get_account_id();
    if (
      this.props.file_use == null ||
      redux == null ||
      this.props.user_map == null ||
      this.props.project_map == null ||
      this.props.mentions == null ||
      this.props.get_sorted_file_use_list2 == null ||
      this.props.get_unseen_size == null ||
      account_id == null
    ) {
      return <Loading />;
    }

    return (
      <FileUseViewer
        file_use_list={this.props.get_sorted_file_use_list2()}
        user_map={this.props.user_map}
        project_map={this.props.project_map}
        account_id={account_id}
        unseen_mentions_size={this.props.get_unseen_size(this.props.mentions)}
      />
    );
  }
}

const FileUsePage0 = rclass(FileUsePage);
export { FileUsePage0 as FileUsePage };

async function notification_list_click_handler(e): Promise<void> {
  e.preventDefault();
  const target = $(e.target);
  if (
    target.parents(".smc-file-use-viewer").length ||
    target.hasClass("btn") ||
    target.parents("button").length ||
    target.parents("a").attr("role") === "button" ||
    target.attr("role") === "button"
  ) {
    return;
  }
  // delay is to give plenty of time for the click to register
  // with react's event handler, so file opens
  await delay(100);
  const page: any = redux.getActions("page");
  if (page != null) {
    page.toggle_show_file_use();
  }
}
