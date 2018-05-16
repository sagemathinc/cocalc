import { Selector } from "testcafe";

import { app_url } from "./util";

fixture("Sign In Page").page(app_url());

const terms_checkbox = Selector('input[type="checkbox"]');

test("tests terms checkbox exists", async t => {
  await t.expect(terms_checkbox.exists).ok();
});

const sign_in_email = Selector('input[type="email"]');
const sign_in_password = Selector('input[type="password"]');

test("tests sign in email input exists", async t => {
  await t.expect(sign_in_email.exists).ok();
});

test("tests sign in password input exists", async t => {
  await t.expect(sign_in_password.exists).ok();
});

const first_name = Selector('input[placeholder="First name"]');

test("after accepting terms the account creation options appear", async t => {
  await t.expect(first_name.count).eql(0); // before clicking terms!
});
