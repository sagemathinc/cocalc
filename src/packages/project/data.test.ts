import * as data from "./data";

test("some consistency checks on the data paths", () => {
  expect(data.infoJson).toMatch(/info.json$/);
  expect(data.hubPortFile).toMatch(/.port$/);
  expect(data.apiServerPortFile).toMatch(/.port$/);
  expect(data.browserPortFile).toMatch(/.port$/);
  expect(data.projectPidFile).toMatch(/.pid$/);
});
