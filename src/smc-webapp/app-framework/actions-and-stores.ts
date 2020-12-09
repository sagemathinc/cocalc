/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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
export { AccountStore, AccountActions } from "../account";
export { AccountState } from "../account/types";
// admin-site-licenses
export { SiteLicensesActions } from "../site-licenses/admin/actions";
export { SiteLicensesStore } from "../site-licenses/admin/store";
export { SiteLicensesState } from "../site-licenses/admin/types";
// admin-users
export { AdminUsersActions } from "../admin/users/actions";
export { AdminUsersStore } from "../admin/users/store";
export { StoreState as AdminUsersState } from "../admin/users/store";
// billing
export { BillingActions } from "../billing/actions";
export { BillingStore } from "../billing/store";
export { BillingStoreState as BillingState } from "../billing/store";

export { ComputeEnvironmentState } from "../compute-environment/types";
// compute_images
export {
  ComputeImagesActions,
  ComputeImagesStore,
} from "../custom-software/init";
export { ComputeImagesState } from "../custom-software/init";
// customize
export { CustomizeActions, CustomizeStore } from "../customize";
export { CustomizeState } from "../customize";
// file_use
export { FileUseStore } from "../file-use/store";
export { FileUseActions } from "../file-use/actions";
export { FileUseState } from "../file-use/store";
// mentions
export { MentionsActions, MentionsStore } from "../notifications";
export { MentionsState } from "../notifications";
// page
export { PageActions } from "../app/actions";
export { PageState, PageStore } from "../app/store";
// projects
export { ProjectsActions } from "../projects/actions";
export { ProjectsStore } from "../projects/store";
export { ProjectsState } from "../projects/store";
// support
export { SupportStore } from "../support/store";
export { SupportActions } from "../support/actions";
export { SupportState } from "../support/types";
// users
export { UsersStore } from "../users/store";
export { UsersActions } from "../users/actions";
export { UsersState } from "../users/types";
