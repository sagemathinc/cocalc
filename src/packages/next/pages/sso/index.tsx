/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { to_human_list } from "@cocalc/util/misc";
import { Layout, Typography } from "antd";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Main from "components/landing/main";
import { ssoNav } from "components/sso";
import { Customize, CustomizeType } from "lib/customize";
import { getSSO } from "lib/sso/sso";
import { SSO } from "lib/sso/types";
import withCustomize from "lib/with-customize";
import Link from "next/link";

const { Paragraph, Text } = Typography;

/*
For development, this is a list of commands to get some suitable test data into your DB:

-- DELETE FROM passport_settings;

INSERT INTO passport_settings (strategy, conf, info)
VALUES (
    'food',
    '{"type": "oauth2next", "clientID": "CoCalc_Client", "scope": ["email", "profile"], "clientSecret": "sEcRet1234", "authorizationURL": "https://localhost/oauth2/authorize", "userinfoURL" :"https://localhost/oauth2/userinfo",  "tokenURL":"https://localhost/oauth2/wowtech/access_token",  "login_info" : {"emails" :"emails[0].value"}, "display": "Food University", "icon": "https://img.icons8.com/glyph-neue/344/food-and-wine.png"}'::JSONB,
    '{"description": "This is the SSO mechanism for anyone associated with Food University", "public": false, "exclusive_domains": ["food.edu"]}'::JSONB
);

INSERT INTO passport_settings (strategy, conf, info)
VALUES (
    'abacus',
    '{"type": "oauth2next", "clientID": "CoCalc_Client", "scope": ["email", "profile"], "clientSecret": "sEcRet1234", "authorizationURL": "https://localhost/oauth2/authorize", "userinfoURL" :"https://localhost/oauth2/userinfo",  "tokenURL":"https://localhost/oauth2/wowtech/access_token",  "login_info" : {"emails" :"emails[0].value"},"display": "Abacus Inc.", "icon": "https://img.icons8.com/external-smashingstocks-outline-color-smashing-stocks/344/external-abacus-online-education-smashingstocks-outline-color-smashing-stocks.png" }'::JSONB,
    '{"description": "This is the SSO mechanism for anyone associated with Abacus Inc", "public": false, "exclusive_domains": ["abacus.edu", "dadacus.edu", "nadacus.edu"]}'::JSONB
);

INSERT INTO passport_settings (strategy, conf, info)
VALUES (
    'flight',
    '{"type": "oauth2next", "clientID": "CoCalc_Client", "scope": ["email", "profile"], "clientSecret": "sEcRet1234", "authorizationURL": "https://localhost/oauth2/authorize", "userinfoURL" :"https://localhost/oauth2/userinfo",  "tokenURL":"https://localhost/oauth2/wowtech/access_token",  "login_info" : {"emails" :"emails[0].value"}, "display": "Flight Research", "icon": "https://img.icons8.com/external-kiranshastry-solid-kiranshastry/344/external-flight-interface-kiranshastry-solid-kiranshastry.png" }'::JSONB,
    '{"description": "This is to sign up with CoCalc as a student of **Flight Research International, Inc.**\n\nMore information:\n\n- [airplane.edu](http://airplane.edu/)\n\n- [yet another link](http://nowhere.com)", "public": false, "exclusive_domains": ["airplane.edu"]}'::JSONB
);

INSERT INTO passport_settings (strategy, conf, info)
VALUES (
    'minimal',
    '{"type": "oauth2next", "clientID": "CoCalc_Client", "scope": ["email", "profile"], "clientSecret": "sEcRet1234", "authorizationURL": "https://localhost/oauth2/authorize", "userinfoURL" :"https://localhost/oauth2/userinfo",  "tokenURL":"https://localhost/oauth2/wowtech/access_token",  "login_info" : {"emails" :"emails[0].value"}, "display": "Minimal", "icon": "https://img.icons8.com/external-others-zulfa-mahendra/344/external-animal-halloween-others-zulfa-mahendra-3.png" }'::JSONB,
    '{"public": false, "exclusive_domains": ["minimal.edu"]}'::JSONB
);

*/

interface Props {
  customize: CustomizeType;
  ssos: SSO[];
}

export const SSO_SUBTITLE = "Single Sign On";

export default function SignupIndex(props: Props) {
  const { customize, ssos } = props;

  function renderDomains(domains) {
    if (domains == null || domains.length === 0) return;
    return (
      <>
        {": "}
        <Text type="secondary">{to_human_list(domains ?? [])}</Text>
      </>
    );
  }

  function renderSSOs() {
    return ssos.map((sso: SSO) => {
      return (
        <li key={sso.id} style={{ marginTop: "10px" }}>
          <Link href={`/sso/${sso.id}`}>
            <a style={{ fontWeight: "bold" }}>{sso.display}</a>
          </Link>
          {renderDomains(sso.domains)}
        </li>
      );
    });
  }

  function renderSSOList(): JSX.Element {
    if (ssos.length === 0) {
      return (
        <Text italic type="danger">
          There are no 3rd party SSO providers available.
        </Text>
      );
    } else {
      return <ul>{renderSSOs()}</ul>;
    }
  }

  function main() {
    return (
      <>
        <h1>{SSO_SUBTITLE}</h1>
        <Paragraph>
          Sign up at {customize.siteName} via one of these 3<sup>rd</sup> party
          organizations. You need to have an account at the respective entity in
          order to complete the single sign on process. In many cases, this will
          be the only way you can sign up using your organization specific email
          address.
        </Paragraph>
        <Paragraph>{renderSSOList()}</Paragraph>
      </>
    );
  }

  return (
    <Customize value={customize}>
      <Head title={SSO_SUBTITLE} />
      <Layout style={{background: "white"}}>
        <Header />
        <Main nav={ssoNav()}>{main()}</Main>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const ssos = await getSSO();
  return await withCustomize({ context, props: { ssos } });
}
