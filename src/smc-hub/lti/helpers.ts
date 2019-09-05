import * as querystring from "querystring";
import { LTIGlobalContextId, LTIGlobalUserId, PlatformResponse } from "./types";

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

export function parse_launch_url(
  LMS_Message: PlatformResponse
) {
  return querystring.parse(
    LMS_Message[
      "https://purl.imsglobal.org/spec/lti/claim/target_link_uri"
    ].split("?")[1]
  );
}
