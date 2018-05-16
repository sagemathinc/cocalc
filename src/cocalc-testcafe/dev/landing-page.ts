import { Selector } from "testcafe";

import { hub_url } from "./util";

fixture("Static Landing Page").page(hub_url());

const navbar = Selector(".navbar");

test("tests navbar exists", async t => {
  await t.expect(navbar.exists).ok();
});

test("Click the policies link", async t=> {
  const policies_link = navbar.find("a").withText("Policies");
  await t.expect(policies_link.exists).ok();
  await t.click(policies_link);
  await t.expect(Selector("head > title").innerText).eql('CoCalc - Policies');
});

