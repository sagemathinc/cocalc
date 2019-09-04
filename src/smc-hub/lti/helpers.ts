import { LTIGlobalUserID, PlatformResponse } from "./types";


// If a function takes LTIGlobalUserID as a parameter type, it HAS to have originated from this function
export function compute_global_user_id(
  LMS_Message: PlatformResponse
): LTIGlobalUserID {
  return (LMS_Message["https://purl.imsglobal.org/spec/lti/claim/tool_platform"]
    .guid +
    " - " +
    LMS_Message["sub"]) as LTIGlobalUserID;
}
