import { Selector } from "testcafe";

fixture`Share server`.page`https://cocalc.com/share`;

test("check that there is a next link", async t => {
  const next_link = await Selector("a").withText("Next");
  await t.expect(next_link.exists).ok();
});

test("check that a certain test page works", async t => {

});