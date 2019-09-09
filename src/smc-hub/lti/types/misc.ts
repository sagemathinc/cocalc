export type LTIGlobalUserId = string & {
  readonly _type: "LTIGlobalUserId";
};

export type LTIGlobalContextId = string & {
  readonly _type: "LTIGlobalContextId";
};

export interface IssuerData {
  client_id: string;
  token_url: string;
  auth_url: string;
  jwk_url: string;
}
