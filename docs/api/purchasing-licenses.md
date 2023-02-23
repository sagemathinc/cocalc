# Using the v2 api to buy a license

First let's do the "hello world" query using the v2 api, which is one of the [examples here.](https://doc.cocalc.com/api2/index.html)  Get your API key, then use the following curl command to send `{"query":{"accounts":{"account_id":null,"email_address":null}}}` to the `user-query` endpoint.

We assume these two variables are already set in all examples below.

```sh
key='sk_TT9hr4nnotsiUXx0'        # your API key
url='https://cocalc.com/api/v2'  # the server
```

Now do our API call:

```sh
curl -sk -u $key: -H 'Content-Type: application/json' \
   -d '{"query":{"accounts":{"account_id":null,"email_address":null}}}' \
   $url/user-query | jq
```

The above will output something like the following, but with your account\_id and email\_address replacing the ones below:

```js
{
  "query": {
    "accounts": {
      "account_id": "a407cc35-c960-481c-9928-1238c868ff8b",
      "email_address": "wstein@gmail.com"
    }
  }
}
```

The user\-query API endpoint can do an enormous amount related to cocalc \-\- it's a sophisticated GraphQL\-style API, and enables reading and writing to the PostgreSQL backend database, and triggering a wide range of actions.  Someday we'll document this in detail.  In the meantime, see [the schema](https://github.com/sagemathinc/cocalc/tree/master/src/packages/util/db-schema).   One example is [getting a directory listing](./directory-listing.md).

## Using the API to add a license to your shopping cart

The endpoint for adding an item to your shopping cart is `/shopping/cart/add`.

```sh
curl -sk -u $key: -H 'Content-Type: application/json' \
   -d '{"account_id":"a407cc35-c960-481c-9928-1238c868ff8b", "product":"site-license", "description":{"ram":16,"cpu":2,"disk":10,"member":true,"uptime": "medium", "type": "quota", "user": "business","boost": false,"period":"monthly","run_limit":1,"title": "my title","description": "my desc"}}' \
   $url/shopping/cart/add 
```

See [the SiteLicenseQuota interface of](https://github.com/sagemathinc/cocalc/tree/master/src/packages/util/types/site-licenses.ts) for the possible parameters in the description field, though things are not fully explained by that.  Also, "uptime" can be "short", "medium" or "day", and title and description can be arbitrary strings.

After you do this, visit \(or refresh\) https://cocalc.com/store/cart to see the license in your cart.

If you have already created a project that you would like to add this license to, include "project\_id":"..." next to "account\_id" above, so the license is automatically added.  Of course, you can also easily just use the v1 API to [add the license to the project](https://doc.cocalc.com/api/add_license_to_project.html).

## Place your order

This will fail if (1) you do not have a credit card on file for this account or (2) due to a captcha if you haven't contacted help@cocalc.com and had your account upgraded to partner status.  (NOTE: To set an account to be a partner directly using the database, type something like this `update accounts set groups=ARRAY['partner'] where account_id='a407cc35-c960-481c-9928-1238c868ff8b';`)

```sh
curl -sk -u $key: -H 'Content-Type: application/json' \
   $url/shopping/cart/checkout 
```

Output if you don't have a partner account:

```js
{"error":"reCaptcha token must be provided"}
```

If you have a valid card on file and a partner account, then the purchase will be made and your license will be available to use.  Confirm your purchase [here](https://cocalc.com/store/congrats).

_**WARNINGS**_: \(1\) There is currently no purchase quota implemented yet for partners, so a bug in your code could make numerous purchases. Be careful.  \(2\) If you add nonsense to your shopping cart, it could lead to your account being in a broken state where you can't see or remove items or checkout; if this happens, contact [help@cocalc.com](mailto:help@cocalc.com) and we'll sort it out.

## Getting all of your licenses

After you place your order using the API, you may want to get a list of all of the licenses that you manage.  You can do that via the `licenses/get-managed` api endpoint:

```sh
curl -sk -u $key: -H 'Content-Type: application/json' \
   $url/licenses/get-managed
```

