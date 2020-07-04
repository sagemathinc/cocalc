/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Collecting together all of the named Actions and Stores interfaces,
so it's easier to use them elsewhere.
*/

export { AdminUsersActions } from "../../admin/users/actions";
export { AdminUsersStore } from "../../admin/users/store";
export { SiteLicensesActions } from "../../site-licenses/admin/actions";
export { SiteLicensesStore } from "../../site-licenses/admin/store";
export { ProjectsActions } from "../../projects/actions";
export { ProjectsStore } from "../../projects/store";
export { CustomizeStore } from "../../customize";
export { BillingActions } from "../../billing/actions";
export { BillingStore } from "../../billing/store";
export { AccountStore, AccountActions } from "../../account";
export { MentionsActions, MentionsStore } from "../../notifications";
export { FileUseStore } from "../../file-use/store";
export { FileUseActions } from "../../file-use/actions";
export { ComputeImagesStore } from "../../custom-software/init";
export { UsersStore } from "../../users/store";
export { UsersActions } from "../../users/actions";

// The need to be converted to typescript by rewriting init_app.coffee, etc.;
// for now use any.
export type PageStore = any;
export type PageActions = any;
export type SupportStore = any;
export type SupportActions = any;
