import * as express from "express";
import * as uuid from "uuid";
import * as querystring from "querystring";
import * as jwt from "jsonwebtoken";
import * as jwksClient from "jwks-rsa";
import * as path from "path";

import {
  IssuerData,
  LoginInitiationFromPlatform,
  AuthRequestTokenData
} from "./types";

const SMC_ROOT: string = process.env.SMC_ROOT as any;
const STATIC_PATH = path.join(SMC_ROOT, "static");

const privateKEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAmzcy01Samt/ehVukUhzVbIh4CAHo7njMjuIOnc9b+dajAKHj
WU18E8sVROilLok7VIkKh7zwSZzoqmDZm7viexkZ5sIRqlUHPtojPG2nlCJRCDyW
bVJc8M8haP/7Daa/TcaBz1T6OPJbinqVGAiMDQNU9abY6Mj7kJxaSeTofQUcoWNs
XR5eQOHCPV8GLZresftEW7vOOGhIUO9qBJdnVoDnvmx0LeKAl4EzSTDpz8NMM+OV
aZ5uaR4m84FDttskFqxswEeLnWd+puvTwQ8NPTFPwNh07F+Xrl1N3SN8WU2mvy61
MH4yQ6KyTeNAeqOXgy7VY2DDQDRuhBKwVA1YPQIDAQABAoIBACaPzibGzCpSGByV
qftkgnmWZgvHPbGRfXC6JNt8GuO1OYX8slkLcRoRyFT4X6FyIrVb3qveeuwu+Xbq
3OVeBmSC1faInI7u1P/+feaTb6DT7cHYG59JaSHCtBA8GIlJthmCidmSyR/AxpFe
5w+zf+fzvfXR3+3lkOpajevx3PjCG0i7YkZ/4qd88pDxBVk6G5DzlIIBL80dL4He
zm2FC0D8Giag07R+4Sn+WW8iA9Iej1mhIPLr5Sl+h10JOFQFxAHS6mYQhgQNd+fY
rsonbGkWzUFssT++Dx4ia+BjbI4TTJi5Gw8ov4ciyTY2YnjqragwhM2JJFx8BgPP
nqaTWNkCgYEAzFnbHKzIin7A1B8MScXteiHO00Sy2QrTAFJA0x/Si86dJcvWU3PS
OjSEsEgDHIL0HNXotIyi3ZrV5RIYjV0XvdeAOsspWyn9R1hOZ6akoMFqO8eHeXxh
b/IaEmgGXSAeF9TO6rdnboog+29iU/2enA6/YE6Oqe8fkRVB+RBjZzsCgYEAwnIh
h9pQFf4yQYOt7JN1WBADmiooqHojV+vXTpg8/+nCUBo5Y5dWl9FGOsglG6EcA/AB
sWknlqIC7/ibWZj3wZJdFv45AuB6GMi1qC7SF3Iy9ol++gwJnpDf7SUQVxQ1NTta
Ci2PKNsmE24HR+F4eTlork/QVuzDcau7QznyducCgYEAmU0rmHZyt5thc4CbSljm
z8G/FDUsarC5HDuYkAoGfIWS1MD3V4HDC5FMnaZYVzJSibNbsN70a4T1w7RwoNRe
tDeP5gt1SgPVE4nGv/F+/W48EP6dvmC2BDI+puJNK92lVcF7PRA70uxi0916iYHx
VCeoIEqusgNGziOBa6SEvfMCgYEAhvJEeQ83I3xODo+/pf9UofBDP7vgicRyQPOJ
cp9PPmBSHduFVqvSSfzQW71Jm5o9YjIwSprrAaygk0CbOBxkXfAhMPLwSCHYOtkY
0YblAaac3eLgv9KY3nY3IlLluzloD/CH9aZWw4kMLNHgta8yOBdyof78XUdmAL6p
cOeHcaMCgYBwL0buukBM2CI5aL50mhLTL5rpVPOcM3H3Z5uJbevwtoRIjYC8AsU0
EtYgVDOMTrbh4AO7PTtLFyd9bm53lYy5CbVJ5xb0wyUs9dC5rodRoJXuT8blz2CS
aooSWdkvWOP6M2B2QN7RMr0EGPwHnrFQaMcM3gHqvU6K7jg9AakEfA==
-----END RSA PRIVATE KEY-----`;
/*
const active_selection_sessions: {
  [key: string]: {
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
    "https://purl.imsglobal.org/spec/lti-dl/claim/content_items": {
      type: string;
      title: string;
      url: string;
    }[];
  };
} = {};
*/
export function init_LTI_router(opts: { base_url: string }): express.Router {
  const router = express.Router();
  router.use(express.json());
  router.use(express.urlencoded({ extended: true }));

  router.route("/").all(function(_, res) {
    res.sendFile(path.join(STATIC_PATH, "lti.html"), { maxAge: 0 });
  });

  // https://www.imsglobal.org/spec/security/v1p0/#openid_connect_launch_flow
  // 5.1.1
  router.route("/login").all((req, res) => {
    const token: LoginInitiationFromPlatform = req.body;
    const iss_data = get_iss_data(token.iss);
    const nonce = uuid.v4();
    const state = uuid.v4();

    console.log("ROUTE: Login\n\n\n\n", state);

    const auth_params: AuthRequestTokenData = {
      scope: "openid",
      response_type: "id_token",
      response_mode: "form_post",
      prompt: "none",
      client_id: iss_data.client_id,
      redirect_uri: token.target_link_uri,
      login_hint: token.login_hint,
      state: state,
      nonce: nonce,
      lti_message_hint: token.lti_message_hint,
      id_token_hint: token.lti_message_hint
    };
    begin_auth_flow(nonce, auth_params);
    const query_string = querystring.stringify(auth_params);
    res.redirect(iss_data.auth_url + "?" + query_string);
  });

  // Tool Launch URL
  router.post("/launch", (req, res) => {
    if (req.body.error) {
      res.send(`Recieved error ${req.body.error}`);
    }
    const options = { algorithms: ["RS256"] };

    // TODO #V0: Use verify for security
    jwt.verify(req.body.id_token, getKey, options, function(err, token) {
      if (err) {
        res.send("Error parsing jwt:" + err);
      }
      const details = get_auth_flow(token.nonce);
      res.redirect(opts.base_url);
      console.log(details);
    });
  });

  router.route("/deep-link-select").all((req, res) => {
    if (req.body.error) {
      res.send(`Recieved error ${req.body.error}`);
    }
    const query_string = querystring.stringify({
      id_token: req.body.id_token,
      nonce: req.body.state,
      return_path: "lti/return-deep-link/"
    });
    res.redirect("../lti?" + query_string);
  });

  router.post("/return-deep-link", (req, res) => {
    const options = { algorithms: ["RS256"] };
    // TODO #V0: Use verify for security
    const token = jwt.decode(req.body.token_id, options);
    const { assignment_name } = req.body;

    // `/launch` receives this url as target
    const url = "https://cocalc.com/[lms_id]/[uuid]/[assignment_name]/"

    // https://www.imsglobal.org/spec/security/v1p0/#step-2-authentication-request
    const nonce = uuid.v4();
    const redirect_url =
      token[
        "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"
      ].deep_link_return_url;
    const iss_data = get_iss_data(token.iss);

    // https://www.imsglobal.org/spec/security/v1p0/#step-2-authentication-request
    const jwt_data = {
      iss: iss_data.client_id,
      aud: [token.iss],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
      nonce: nonce,
      header: {
        typ: "JWT",
        alg: "RS256"
      },
      "https://purl.imsglobal.org/spec/lti/claim/message_type":
        "LtiDeepLinkingResponse",
      "https://purl.imsglobal.org/spec/lti/claim/version": "1.3.0",
      "https://purl.imsglobal.org/spec/lti/claim/deployment_id":
        token["https://purl.imsglobal.org/spec/lti/claim/deployment_id"],
      "https://purl.imsglobal.org/spec/lti-dl/claim/data":
        token[
          "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"
        ],
      "https://purl.imsglobal.org/spec/lti-dl/claim/content_items": [
        {
          type: "ltiResourceLink", // TODO: What types are available?
          title: `${assignment_name}`,
          url: `${url}`
        }
      ] // Array of returned items (possibly empty)
    };

    const deep_link_response_token = jwt.sign(jwt_data, privateKEY, {
      algorithm: "RS256"
    });

    const formatted_token = { JWT: deep_link_response_token };
    const query_string = querystring.stringify(formatted_token);
    res.redirect(redirect_url + "&" + query_string);
  });

  return router;
}

function get_iss_data(iss: string): IssuerData {
  // TODO #V0 Remove when you write a way to save it to the database
  const known_iss = {
    "https://moodletest.cocalc.com": {
      client_id: "6WDU5UmGFK9mFFd",
      token_url: "https://moodletest.cocalc.com/mod/lti/token.php",
      auth_url: "https://moodletest.cocalc.com/mod/lti/auth.php",
      jwk_url: "https://moodletest.cocalc.com/mod/lti/certs.php"
    },
    "https://canvas.instructure.com": {
      client_id: "10000000000008",
      token_url: "http://34.83.75.255/api/lti/login/oauth2/auth",
      auth_url: "http://34.83.75.255/api/lti/authorize",
      jwk_url: "http://34.83.75.255/api/lti/securit/jwks"
    }
  };

  return known_iss[iss];
}

const current_auth_flows = {};

function begin_auth_flow(id: string, payload: any) {
  current_auth_flows[id] = payload;
}

function get_auth_flow(id: string): any {
  return current_auth_flows[id] || "Nothing here";
}

const jwkClient = jwksClient({
  jwksUri: "https://moodletest.cocalc.com/mod/lti/certs.php"
});

function getKey(header, callback) {
  jwkClient.getSigningKey(header.kid, function(_, key) {
    var signingKey = (key as any).publicKey || (key as any).rsaPublicKey;
    callback(null, signingKey);
  });
}
