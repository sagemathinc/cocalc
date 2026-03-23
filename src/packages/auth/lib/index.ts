/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// @cocalc/auth — OAuth2 Provider for CoCalc
//
// Makes CoCalc act as an OAuth2 authorization server, allowing
// third-party applications (e.g., MCP tool providers) to
// authenticate users via CoCalc.

export { createOAuth2Provider } from "./oauth2-provider/provider";
export {
  createOAuth2Client,
  deleteOAuth2Client,
  getClientPublic,
  listOAuth2Clients,
  listOAuth2ClientsWithStats,
  regenerateClientSecret,
  updateOAuth2Client,
} from "./oauth2-provider/client-manager";
export type {
  ClientTokenStats,
  CreateClientInput,
  CreateClientResult,
} from "./oauth2-provider/client-manager";
export { getAccessToken } from "./oauth2-provider/database";
export type {
  OAuth2Client,
  OAuth2ClientMode,
  OAuth2ClientPublic,
  OAuth2Scope,
} from "./oauth2-provider/types";
export { OAUTH2_SCOPES } from "./oauth2-provider/types";
