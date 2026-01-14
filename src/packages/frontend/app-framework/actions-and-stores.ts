/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Collecting together all of the named Actions and Stores interfaces,
so it's easier to use them elsewhere.

For every top level named store:

 - add a section below importing/exporting it
 - add to the States interface
 - also add to the States, Stores and Actions interfaces in redux-hooks.ts

If you don't do this, then things don't get typechecked,
which is VERY BAD.
*/

// account
export { AccountStore, AccountActions } from "@cocalc/frontend/account";
export type { AccountState } from "@cocalc/frontend/account/types";
// admin-users
export { AdminUsersActions } from "@cocalc/frontend/admin/users/actions";
export { AdminUsersStore } from "@cocalc/frontend/admin/users/store";
export type { StoreState as AdminUsersState } from "@cocalc/frontend/admin/users/store";
// billing
export { BillingActions } from "@cocalc/frontend/billing/actions";
export { BillingStore } from "@cocalc/frontend/billing/store";
export type { BillingStoreState as BillingState } from "@cocalc/frontend/billing/store";

// compute_images
export {
  ComputeImagesActions,
  ComputeImagesStore,
} from "../custom-software/init";
export type { ComputeImagesState } from "@cocalc/frontend/custom-software/init";
// customize
export { CustomizeActions, CustomizeStore } from "@cocalc/frontend/customize";
export type { CustomizeState } from "@cocalc/frontend/customize";
// file_use
export { FileUseStore } from "@cocalc/frontend/file-use/store";
export { FileUseActions } from "@cocalc/frontend/file-use/actions";
export type { FileUseState } from "@cocalc/frontend/file-use/store";
// mentions
export { MentionsActions, MentionsStore } from "@cocalc/frontend/notifications";
export type { MentionsState } from "@cocalc/frontend/notifications";
// messages
export {
  MessagesActions,
  MessagesStore,
} from "@cocalc/frontend/messages/redux";
export type { MessagesState } from "@cocalc/frontend/messages/redux";
// page
export { PageActions } from "@cocalc/frontend/app/actions";
export { PageStore } from "@cocalc/frontend/app/store";
export type { PageState } from "@cocalc/frontend/app/store";
// projects
export { ProjectsActions } from "@cocalc/frontend/projects/actions";
export { ProjectsStore } from "@cocalc/frontend/projects/store";
export type { ProjectsState } from "@cocalc/frontend/projects/store";
// users
export { UsersStore } from "@cocalc/frontend/users/store";
export { UsersActions } from "@cocalc/frontend/users/actions";
export type { UsersState } from "@cocalc/frontend/users/types";
// news
export type { NewsState } from "@cocalc/frontend/notifications/news/init";
export { NewsStore } from "@cocalc/frontend/notifications/news/init";
export { NewsActions } from "@cocalc/frontend/notifications/news/init";
