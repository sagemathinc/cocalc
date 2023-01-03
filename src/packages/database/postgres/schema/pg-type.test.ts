import { pgType } from "./pg-type";

test("pgType throws error on invalid input type", () => {
  expect(() => pgType(null as any)).toThrow();
});

test("pgType returns pg_type field as is", () => {
  expect(pgType({ pg_type: "fubar" })).toBe("fubar");
});

test("pgType requires pg_type or type to be specified", () => {
  expect(() => pgType({})).toThrow();
});

test("pgType translates some types properly", () => {
  expect(pgType({ type: "uuid" })).toBe("UUID");
  expect(pgType({ type: "map" })).toBe("JSONB");
});
