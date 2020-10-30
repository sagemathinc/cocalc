/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export { A } from "./A";
export { Icon } from "./icon";
export { Tip } from "./tip";
export { Loading, Estimate as LoadingEstimate } from "./loading";
export { r_join } from "./r_join";
export { Space } from "./space";
export { CloseX } from "./close-x";
export { CloseX2 } from "./close-x2";
export { SimpleX } from "./simple-x";
export { Saving } from "./saving";
export { Spinner } from "./spinner";
export { ErrorDisplay } from "./error-display";
export { SkinnyError } from "./skinny-error";
export { SelectorInput } from "./selector-input";
export { TextInput } from "./text-input";
export { NumberInput } from "./number-input";
export { LabeledRow } from "./labeled-row";
export { TimeElapsed } from "./time-elapsed";
export { SettingBox } from "./setting-box";
export { ProfileIcon } from "./profile-icon";
export { DropdownMenu, MenuItem, MenuDivider } from "./dropdown-menu";
export { WindowedList } from "./windowed-list";
export { UncommittedChanges } from "./uncommited-changes";
export { DateTimePicker } from "./date-time-picker";
export { PathLink } from "./path-link";
export { HelpIcon } from "./help-icon";
export { TimeAgo, TimeAgoElement, is_different_date } from "./time-ago";
export {
  HiddenXS,
  HiddenSM,
  HiddenXSSM,
  VisibleMDLG,
  VisibleLG,
  VisibleXSSM,
} from "./hidden-visible";
export { LoginLink } from "./login-link";
export { ProjectState } from "./project-state";
export { UNIT, build_date, smc_git_rev, smc_version } from "./constants";
export { MarkdownInput } from "../widget-markdown-input/main";
export { SearchInput } from "./search-input";
export { ActivityDisplay } from "./activity-display";
export { CopyToClipBoard } from "./copy-to-clipboard";
export { NoUpgrades, UPGRADE_ERROR_STYLE } from "./no-upgrades";
export { UpgradeAdjustor } from "./upgrade-adjustor";

export const {
  ImmutablePureRenderMixin,
  Octicon,
  render_static_footer,
  HTML,
  Markdown,
  render_file_info_dropdown,
  ErrorBoundary,
} = require("./old-coffee-code-index");
