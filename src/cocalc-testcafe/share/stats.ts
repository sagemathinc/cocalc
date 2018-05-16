import { Selector } from "testcafe";

fixture`Stats page from share server`.page`https://cocalc.com/share/7561f68d-3d97-4530-b97e-68af2fb4ed13/stats.html`;

test("share server stats page has a proper header", async t => {
  const h1 = await Selector("h1").withText("User Statistics");
  await t.expect(h1.exists).ok();
});

