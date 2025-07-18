import { getClientIpAddress } from "./get-client-ip-address";

describe("getClientIpAddress()", () => {
  const createRequest = (headers: Record<string, string>) => ({ headers });

  describe("Standard Headers Supported by request-ip", () => {
    it("should handle CF-Connecting-IP (highest priority)", () => {
      const req = createRequest({
        "x-client-ip": "203.0.113.1",
        "x-forwarded-for": "192.168.1.1",
        "cf-connecting-ip": "198.51.100.1",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("198.51.100.1");
    });

    it("should handle X-Forwarded-For with multiple IPs", () => {
      const req = createRequest({
        "x-forwarded-for": "203.0.113.1, 192.168.1.1, 10.0.0.1",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("203.0.113.1");
    });

    it("should handle CF-Connecting-IP from Cloudflare", () => {
      const req = createRequest({
        "cf-connecting-ip": "203.0.113.1",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("203.0.113.1");
    });

    it("should handle Fastly-Client-Ip from Fastly", () => {
      const req = createRequest({
        "fastly-client-ip": "203.0.113.1",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("203.0.113.1");
    });

    it("should handle True-Client-Ip from Akamai/Cloudflare", () => {
      const req = createRequest({
        "true-client-ip": "203.0.113.1",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("203.0.113.1");
    });

    it("should handle X-Real-IP from nginx", () => {
      const req = createRequest({
        "x-real-ip": "203.0.113.1",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("203.0.113.1");
    });

    it("should handle X-Cluster-Client-IP from Rackspace", () => {
      const req = createRequest({
        "x-cluster-client-ip": "203.0.113.1",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("203.0.113.1");
    });

    it("should handle appengine-user-ip from Google App Engine", () => {
      const req = createRequest({
        "appengine-user-ip": "203.0.113.1",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("203.0.113.1");
    });
  });

  describe("Header Priority Order", () => {
    it("should prioritize X-Client-IP over X-Forwarded-For", () => {
      const req = createRequest({
        "x-client-ip": "203.0.113.1",
        "x-forwarded-for": "192.168.1.1",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("203.0.113.1");
    });

    it("should prioritize CF-Connecting-IP over X-Forwarded-For", () => {
      const req = createRequest({
        "x-forwarded-for": "203.0.113.1",
        "cf-connecting-ip": "192.168.1.1",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("192.168.1.1");
    });

    it("should prioritize CF-Connecting-IP over Fastly-Client-Ip", () => {
      const req = createRequest({
        "cf-connecting-ip": "203.0.113.1",
        "fastly-client-ip": "192.168.1.1",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("203.0.113.1");
    });

    it("should prioritize Fastly-Client-Ip over True-Client-Ip", () => {
      const req = createRequest({
        "fastly-client-ip": "203.0.113.1",
        "true-client-ip": "192.168.1.1",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("203.0.113.1");
    });

    it("should prioritize True-Client-Ip over X-Real-IP", () => {
      const req = createRequest({
        "true-client-ip": "203.0.113.1",
        "x-real-ip": "192.168.1.1",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("203.0.113.1");
    });
  });

  describe("Case Sensitivity (Headers are lowercase in Node.js)", () => {
    it("should handle uppercase headers (converted to lowercase by Node.js)", () => {
      const req = createRequest({
        "X-CLIENT-IP": "203.0.113.1", // This would be lowercase in real Node.js
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("203.0.113.1");
    });

    it("should handle mixed case headers", () => {
      const req = createRequest({
        "X-Forwarded-For": "203.0.113.1, 192.168.1.1",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("203.0.113.1");
    });
  });

  describe("Forwarded Header Fallback (when request-ip fails)", () => {
    it("should parse simple Forwarded header", () => {
      const req = createRequest({
        forwarded: "for=192.0.2.60",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("192.0.2.60");
    });

    it("should parse quoted Forwarded header", () => {
      const req = createRequest({
        forwarded: 'for="192.0.2.60"',
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("192.0.2.60");
    });

    it("should parse Forwarded header with IPv6 brackets", () => {
      const req = createRequest({
        forwarded: 'for="[2001:db8:cafe::17]"',
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("2001:db8:cafe::17");
    });

    it("should handle port stripping for IPv4", () => {
      const req = createRequest({
        forwarded: "for=192.0.2.60:4711",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("192.0.2.60");
    });

    it("should handle multiple parameters in Forwarded header", () => {
      const req = createRequest({
        forwarded: "for=192.0.2.60;proto=http;by=203.0.113.43",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("192.0.2.60");
    });

    it("should handle case-insensitive FOR parameter", () => {
      const req = createRequest({
        forwarded: "For=192.0.2.60",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("192.0.2.60");
    });

    it("should skip invalid entries and use first valid IP", () => {
      const req = createRequest({
        forwarded: "for=_gazonk, for=192.0.2.60",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("192.0.2.60");
    });

    it("should return undefined when no valid for= parameter exists", () => {
      const req = createRequest({
        forwarded: "proto=http;by=203.0.113.43",
      });

      const result = getClientIpAddress(req);
      expect(result).toBeUndefined();
    });
  });

  describe("IPv6 Support", () => {
    it("should handle IPv6 addresses in X-Forwarded-For", () => {
      const req = createRequest({
        "x-forwarded-for": "2001:db8:85a3:8d3:1319:8a2e:370:7348",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("2001:db8:85a3:8d3:1319:8a2e:370:7348");
    });

    it("should handle compressed IPv6 addresses", () => {
      const req = createRequest({
        "x-forwarded-for": "2001:db8::1",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("2001:db8::1");
    });

    it("should handle IPv6 loopback", () => {
      const req = createRequest({
        "x-forwarded-for": "::1",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("::1");
    });
  });

  describe("Edge Cases", () => {
    it("should return undefined for empty headers", () => {
      const req = createRequest({});

      const result = getClientIpAddress(req);
      expect(result).toBeUndefined();
    });

    it("should return undefined for invalid IP addresses", () => {
      const req = createRequest({
        "x-forwarded-for": "not.an.ip.address",
      });

      const result = getClientIpAddress(req);
      expect(result).toBeUndefined();
    });

    it("should handle localhost addresses", () => {
      const req = createRequest({
        "x-forwarded-for": "127.0.0.1",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("127.0.0.1");
    });

    it("should handle private IP addresses", () => {
      const req = createRequest({
        "x-forwarded-for": "192.168.1.1",
      });

      const result = getClientIpAddress(req);
      expect(result).toBe("192.168.1.1");
    });
  });
});
