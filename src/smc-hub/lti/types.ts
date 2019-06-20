// These are the same types in
export interface Database {
  synctable: Function;
}

export interface Logger {
  debug: Function;
  info: Function;
  warn: Function;
}

// https://www.imsglobal.org/spec/security/v1p0/#step-1-third-party-initiated-login
export interface LoginInitiationFromPlatform {
  iss: string;
  target_link_uri: string; // Potentially fixed?
  login_hint: string;
  lti_message_hint: string;
}

// https://www.imsglobal.org/spec/security/v1p0/#step-2-authentication-request
export interface AuthRequestTokenData {
  scope: "openid";
  response_type: "id_token";
  response_mode: "form_post";
  prompt: "none";
  client_id: string;
  redirect_uri: string;
  login_hint: string;
  state: string;
  nonce: string;
  lti_message_hint: string;
  id_token_hint: string;
}

export interface AuthResponseTokenData {
  id_token: string; // JWT decodes into PlatformResponse
  state: string; // Same state as provided to the platform in AuthRequestTokenData
}

// https://www.imsglobal.org/spec/security/v1p0/#id-token
export interface PlatformResponse {
  nonce: string; // Should be the same nonce sent in AuthRequestTokenData
  iat: number; // SECONDS since epoch
  exp: number; // SECONDS since epoch
  iss: string; // Platform Issuer Identifier
  aud: string | string[]; // Client id assigned to the tool by the platform
  sub: string; // Identifier of the User in the platform
  azp?: string;
  "https://purl.imsglobal.org/spec/lti/claim/deployment_id": string;
  "https://purl.imsglobal.org/spec/lti/claim/target_link_uri": string;
  "https://purl.imsglobal.org/spec/lti/claim/lis": {
    person_sourcedid: string;
    course_section_sourcedid: string;
  };
  "https://purl.imsglobal.org/spec/lti/claim/roles": Role[];
  "https://purl.imsglobal.org/spec/lti/claim/context": {
    id: string;
    label: string;
    title: string;
    type: string[];
  };
  "https://purl.imsglobal.org/spec/lti/claim/resource_link": {
    title: string;
    id: string;
  };
  "https://purl.imsglobal.org/spec/lti/claim/launch_presentation": {
    locale: string;
    document_target: "iframe";
    return_url: string;
  };
  "https://purl.imsglobal.org/spec/lti/claim/ext": { lms: string };
  "https://purl.imsglobal.org/spec/lti/claim/tool_platform": {
    family_code: string;
    version: string;
    guid: string;
    name: string;
    description: string;
  };
  "https://purl.imsglobal.org/spec/lti/claim/version": string;
  "https://purl.imsglobal.org/spec/lti/claim/message_type": "LtiResourceLinkRequest";
  "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint"?: {
    scope: Scope[];
    lineitems: string;
  };
}

enum Role {
  InstituteAdmin = "http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator",
  Instructor = "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor",
  SystemAdmin = "http://purl.imsglobal.org/vocab/lis/v2/system/person#Administrator",
  Student = "http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"
}

enum Scope {
  LineItemReadonly = "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly",
  ResultReadonly = "https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly",
  Score = "https://purl.imsglobal.org/spec/lti-ags/scope/score"
}

export interface DeepLinkingToolJWTData {
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
  nonce: string;
  header: {
    typ: "JWT";
    alg: "RS256";
  };
  "https://purl.imsglobal.org/spec/lti/claim/message_type": "LtiDeepLinkingResponse";
  "https://purl.imsglobal.org/spec/lti/claim/version": "1.3.0";
  "https://purl.imsglobal.org/spec/lti/claim/deployment_id": string;
  "https://purl.imsglobal.org/spec/lti-dl/claim/data": string;
  "https://purl.imsglobal.org/spec/lti-dl/claim/content_items": ContentItem[]; // Array of returned items (possibly empty)
  custom?: { [key: string]: string };
}

// TODO: Add additional types
type ContentItem = LtiResourceLinkItem | Link;

interface Link {}

interface LtiResourceLinkItem {
  type: "ltiResourceLink";
  title: string;
  url: string;
}
