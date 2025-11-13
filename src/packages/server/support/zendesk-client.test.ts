import { extractSubdomain } from "./zendesk-client";

test("zendesk/extractSubdomain/compatibility", () => {
  const uri = "https://sagemathcloud.zendesk.com/api/v2";
  const subdomain = extractSubdomain(uri);
  expect(subdomain).toBe("sagemathcloud");
});

test("zendesk/extractSubdomain/new", () => {
  const uri = "sagemathcloud";
  const subdomain = extractSubdomain(uri);
  expect(subdomain).toBe("sagemathcloud");
});
