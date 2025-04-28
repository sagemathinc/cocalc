#!/usr/bin/env python3

# This is 100% for development only. None of these configurations are real!
# This is a quick and simple script to generate PostgreSQL commands to re-create the passport_strategy table.
# As a first command, it deletes everything you have there -- hence this is 100% only for development!
# Usage:
#    python3 cocalc-db-sso.py [dump]
# which issues commands to psql directly, or add "dump" to see what it would do.
#
# The conf/info fields are described in src/packages/server/auth/sso/types.ts

from typing_extensions import TypedDict
from typing import Dict

Entry = TypedDict("Entry", {"strategy": str, "conf": Dict, "info": Dict})

# the first 4 ones have no functional purpose – good for checking the UI, etc.

food: Entry = {
    "strategy": "food",
    "conf": {
        "icon": "https://img.icons8.com/glyph-neue/344/food-and-wine.png",
        "type": "oauth2next",
        "scope": ["email", "profile"],
        "display": "Food University",
        "clientID": "CoCalc_Client",
        "tokenURL": "https://localhost/oauth2/wowtech/access_token",
        "login_info": {
            "emails": "emails[0].value"
        },
        "userinfoURL": "https://localhost/oauth2/userinfo",
        "clientSecret": "sEcRet1234",
        "authorizationURL": "https://localhost/oauth2/authorize"
    },
    "info": {
        "public": False,
        "description":
        "This is the SSO mechanism for anyone associated with Food University",
        "exclusive_domains": ["food.edu"]
    }
}

flight: Entry = {
    "strategy": "flight",
    "conf": {
        "type": "oauth2next",
        "scope": ["email", "profile"],
        "clientID": "CoCalc_Client",
        "tokenURL": "https://localhost/oauth2/wowtech/access_token",
        "login_info": {
            "emails": "emails[0].value"
        },
        "userinfoURL": "https://localhost/oauth2/userinfo",
        "clientSecret": "sEcRet1234",
        "authorizationURL": "https://localhost/oauth2/authorize"
    },
    "info": {
        "icon":
        "https://img.icons8.com/external-kiranshastry-solid-kiranshastry/344/external-flight-interface-kiranshastry-solid-kiranshastry.png",
        "public": False,
        "display": "Flight Research",
        "description":
        "This is to sign up with CoCalc as a student of **Flight Research International, Inc.**\n\nMore information:\n\n- [airplane.edu](http://airplane.edu/)\n\n- [yet another link](http://nowhere.com)",
        "exclusive_domains": ["airplane.edu", "aircraft.com"]
    }
}

minimal: Entry = {
    "strategy": "minimal",
    "conf": {
        "type": "oauth2next",
        "display": "Minimal",
        "clientID": "CoCalc_Client",
        "tokenURL": "https://localhost/oauth2/wowtech/access_token",
        "login_info": {
            "emails": "emails[0].value"
        },
        "userinfoURL": "https://localhost/oauth2/userinfo",
        "clientSecret": "sEcRet1234",
        "authorizationURL": "https://localhost/oauth2/authorize"
    },
    "info": {
        "public": False,
        "do_not_hide": True,
        "exclusive_domains": ["minimal.edu"]
    }
}

abacus2: Entry = {
    "strategy": "abacus2",
    "conf": {
        "type": "oauth2next",
        "scope": ["email", "profile"],
        "clientID": "CoCalc_Client",
        "tokenURL": "https://localhost/oauth2/wowtech/access_token",
        "login_info": {
            "emails": "emails[0].value"
        },
        "userinfoURL": "https://localhost/oauth2/userinfo",
        "clientSecret": "sEcRet1234",
        "authorizationURL": "https://localhost/oauth2/authorize"
    },
    "info": {
        "icon":
        "https://img.icons8.com/external-smashingstocks-outline-color-smashing-stocks/344/external-abacus-online-education-smashingstocks-outline-color-smashing-stocks.png",
        "public":
        False,
        "display":
        "Abacus 2",
        "description":
        "This is the SSO mechanism for anyone associated with Abacus Inc",
        "exclusive_domains":
        ["abacus.edu", "dadacus.edu", "nadacus.edu", "blablacus.edu"]
    }
}

oidc1: Entry = {
    "strategy": "oidc1",
    "conf": {
        "type": "oidc",
        "issuer": "http://localhost:5300",
        "authorizationURL": "http://localhost:5300/auth",
        "tokenURL": "http://localhost:5300/token",
        "userInfoURL": "http://localhost:5300/me",
        "clientID": "cocalc",
        "clientSecret": "s3cr3t",
        "callbackURL": "http://localhost:5000/auth/oidc1/return",
    },
    "info": {
        "display": "OIDC Test",
        "description":
        "This is the SSO mechanism for anyone associated with OIDC Test",
        "public": False,
    }
}

strats = [food, flight, minimal, abacus2, oidc1]

# read content of file saml-idp-local.pem
# curdir is the directory of this file
from os.path import join, dirname, realpath, exists, abspath

curdir = dirname(realpath(__file__))
saml20fn = join(curdir, "saml-idp-local.pem")

if exists(saml20fn):
    print("Generating SAML 2.0 SSO strategy")
    saml20cert: str = open(saml20fn, "r").read().strip()
    saml20: Entry = {
        "strategy": "saml20",
        "conf": {
            "type": "saml",
            "name": "saml20",
            "entryPoint": "http://localhost:7000/saml/sso",
            "path": "/auth/saml20/return",
            #"audience": False, # "https://localhost:5000/", # false is set as default
            "login_info": {
                "first_name": "firstName",
                "last_name": "lastName",
                "full_name": "displayName",
                "emails": "email",
                "id": "id",
            },
            "issuer": "https://cocalc.com",
            "cert": saml20cert
        },
        "info": {
            "icon":
            "https://b.thumbs.redditmedia.com/EQ1HS4MFeamF4Yw6ufKYWkSkmcsikv4VvQ4dYzfsmGw.png",
            "public": False,
            "display": "Saml20",
            "description": "Testing my SAML 2.0 IdP",
            "exclusive_domains": ["*"],
            "update_on_login": True,
            "cookie_ttl_s": 24 * 60 * 60,  # 24 hours
        }
    }
    strats.append(saml20)
else:
    print(
        f"WARNING: no SAML 2.0 generated. Setup saml-idp and copy the pem file certificate to exactly {saml20fn}"
    )

# Setting up a test OAuth2 server is hard, or I don't know how to do it.
# In any case, this test was using gerges-beshay/oauth2orize-examples
# with small modifications: db/users has a given_name and family_name,
# and routes/user returns them in the json response.
# $ PORT=5555 node app.js
oauth2server = 'http://localhost:5555'
oauth2: Entry = {
    "strategy": "myOauth2",
    "conf": {
        "type": "oauth2",
        "scope": ["email", "profile"],
        "authorizationURL": f'{oauth2server}/dialog/authorize',
        "tokenURL": f'{oauth2server}/oauth/token',
        "userinfoURL": f'{oauth2server}/api/userinfo',
        "clientID": 'abc123',
        "clientSecret": 'ssh-secret',
        #"login_info": {
        #    "id": "_raw.user_id",
        #}
    },
    "info": {
        "public": False,
        "display": "My OAuth2",
        "description": "My OAuth2",
        "update_on_login": False,
    }
}
strats.append(oauth2)

# fake public

twitter: Entry = {
    "strategy": "twitter",
    "conf": {
        "clientID": "123",
        "clientSecret": "123123"
    },
}
strats.append(twitter)

github: Entry = {
    "strategy": "github",
    "conf": {
        "clientID": "123",
        "clientSecret": "123123"
    },
}
strats.append(github)

##############

sql_commands = []

from json import dumps

sql_commands.append("DELETE FROM passport_settings;")

insertPattern = "INSERT INTO passport_settings (strategy, conf, info) VALUES ('{strategy}', '{conf}'::JSONB, '{info}'::JSONB);"

for strat in strats:
    print("Inserting", strat["strategy"])
    sql_commands.append(
        insertPattern.format(strategy=strat["strategy"],
                             conf=dumps(strat["conf"]),
                             info=dumps(strat.get("info"))))

import sys
if len(sys.argv) > 1 and sys.argv[1] == 'dump':
    print()
    print('commands:')
    print()
    for sql in sql_commands:
        print(sql)
    exit()

from subprocess import run

# this needs all env variables to set properly, e.g. source an "postgres-env" file first
run(["psql"], check=True, input="\n".join(sql_commands).encode('utf8'))
