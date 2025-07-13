import { before, after, fs } from "./setup";

beforeAll(before);

describe("some basic tests", () => {
  it("gets basic info", async () => {
    const info = await fs.info();
    //console.log(info);
    expect(info).not.toEqual(null);
  });
});

afterAll(after);
