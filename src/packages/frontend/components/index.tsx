/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Typography } from "antd";

import AIAvatar from "./ai-avatar";
import CopyToClipBoard from "./copy-to-clipboard";
import Delay from "./delay";

export type { MenuItems } from "./dropdown-menu";

export { MarkdownInput } from "../markdown/markdown-input/main";
export { A } from "./A";
export { ActivityDisplay } from "./activity-display";
export { CloseX } from "./close-x";
export { CloseX2 } from "./close-x2";
export { UNIT, build_date, smc_git_rev, smc_version } from "./constants";
export { DateTimePicker } from "./date-time-picker";
export { DropdownMenu, MenuDivider, MenuItem } from "./dropdown-menu";
export { ErrorDisplay } from "./error-display";
export { Gap } from "./gap";
export { HelpIcon } from "./help-icon";
export * from "./hidden-visible";
export { HTML } from "./html";
export { Icon, IconName, isIconName } from "./icon";
export { LabeledRow } from "./labeled-row";
export { LLMNameLink } from "./llm-plain-link";
export { Loading, Estimate as LoadingEstimate } from "./loading";
export { LoginLink } from "./login-link";
export { MarkAll } from "./mark-all";
export { Markdown } from "./markdown";
export { NoWrap } from "./nowrap";
export { NumberInput } from "./number-input";
export { PathLink } from "./path-link";
export { ProfileIcon } from "./profile-icon";
export { ProjectState } from "./project-state";
export { QuestionMarkText } from "./question-mark-text";
export { r_human_list } from "./r_human_list";
export { r_join } from "./r_join";
export { RawPrompt } from "./raw-prompt";
export { Saving } from "./saving";
export { SearchInput } from "./search-input";
export { SelectorInput } from "./selector-input";
export { SettingBox } from "./setting-box";
export { SimpleX } from "./simple-x";
export { SkinnyError } from "./skinny-error";
export * from "./table-of-contents";
export { TextInput } from "./text-input";
export { TimeAgo, TimeAgoElement, is_different_date } from "./time-ago";
export { TimeElapsed } from "./time-elapsed";
export { Tip } from "./tip";
export { UncommittedChanges } from "./uncommited-changes";

export { AIAvatar, CopyToClipBoard, Delay };

export const { Text, Title, Paragraph } = Typography;
