import * as querystring from "querystring";
import {
  AuthRequestTokenData,
  LTIGlobalContextId,
  LTIGlobalUserId,
  PlatformResponse,
  LoginInitiationFromPlatform
} from "./types";
import { UUID } from "./generic-types";
import { LaunchParams } from "./types/misc";

// If a function takes LTIGlobalUserID as a parameter type, it HAS to have originated from this function
export function compute_global_user_id(
  LMS_Message: PlatformResponse
): LTIGlobalUserId {
  return (LMS_Message["https://purl.imsglobal.org/spec/lti/claim/tool_platform"]
    .guid +
    "?user=" +
    LMS_Message["sub"]) as LTIGlobalUserId;
}

// If a function takes LTIGlobalContextId as a parameter type, it HAS to have originated from this function
export function compute_global_context_id(
  LMS_Message: PlatformResponse
): LTIGlobalContextId {
  return (LMS_Message["https://purl.imsglobal.org/spec/lti/claim/tool_platform"]
    .guid +
    "?context=" +
    LMS_Message[
      "https://purl.imsglobal.org/spec/lti/claim/context"
    ]) as LTIGlobalContextId;
}

// Assumes the query will be correctly formated
// TODO: Do a runtime check
export function unchecked_parse_launch_url(
  LMS_Message: PlatformResponse,
  head: string
): LaunchParams {
  console.log(
    "Parsing launch params from",
    LMS_Message["https://purl.imsglobal.org/spec/lti/claim/target_link_uri"]
  );

  const url =
    LMS_Message["https://purl.imsglobal.org/spec/lti/claim/target_link_uri"];

  console.log("URL Parse: ", url.replace(head, "").split("/"));
  return {
    item_type: "assignment",
    id: "dummy-LTI-assignment-id"
  } as LaunchParams;
}

export function assignment_url(url: string, id: string): string {
  return url + "/assignment/" + id;
}

export function login_redirect_url({
  base_url,
  our_id,
  token,
  state,
  nonce
}: {
  base_url: string;
  our_id: string;
  token: LoginInitiationFromPlatform;
  state: UUID;
  nonce: UUID;
}): string {
  const auth_params: AuthRequestTokenData = {
    scope: "openid",
    response_type: "id_token",
    response_mode: "form_post",
    prompt: "none",
    client_id: our_id,
    redirect_uri: token.target_link_uri,
    login_hint: token.login_hint,
    state: state,
    nonce: nonce,
    lti_message_hint: token.lti_message_hint,
    id_token_hint: token.lti_message_hint
  };
  const query_string = querystring.stringify(auth_params);
  return base_url + "?" + query_string;
}
