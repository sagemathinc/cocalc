import { isIP } from "net";
import { getClientIp } from "request-ip";

export function getClientIpAddress(req: {
  headers: Record<string, string | string[] | undefined>;
}): string | undefined {
  // Try manual extraction for headers not supported by request-ip
  const headersToCheck = [
    "cf-connecting-ip", // prioritize cloudflare
    "x-client-ip",
    "x-forwarded-for",
    "fastly-client-ip",
    "true-client-ip",
    "x-real-ip",
    "x-cluster-client-ip",
    "appengine-user-ip",
  ];

  // Check each header (case-insensitive)
  for (const headerName of headersToCheck) {
    const headerValue = getHeaderValue(req.headers, headerName);
    if (headerValue) {
      // Handle comma-separated values (like X-Forwarded-For)
      const ips = headerValue.split(",").map((ip) => ip.trim());
      for (const ip of ips) {
        if (isIP(ip)) {
          return ip;
        }
      }
    }
  }

  // Try request-ip package as fallback
  const ip = getClientIp(req);
  if (ip && isIP(ip)) {
    return ip;
  }

  // Fallback "Forwarded" header parsing, because this is not merged:
  // https://github.com/pbojinov/request-ip/pull/71
  const forwardedHeader = getHeaderValue(req.headers, "forwarded");
  if (forwardedHeader) {
    // Split by comma for multiple forwarded entries
    const forwardedEntries = forwardedHeader.split(",");

    for (const entry of forwardedEntries) {
      // Split by semicolon for parameters
      const params = entry.split(";");

      for (const param of params) {
        const trimmed = param.trim();
        if (trimmed.toLowerCase().startsWith("for=")) {
          let ipVal = trimmed.substring(4).trim();

          // Remove quotes if present
          if (ipVal.startsWith('"') && ipVal.endsWith('"')) {
            ipVal = ipVal.slice(1, -1);
          }

          // Handle IPv6 brackets
          if (ipVal.startsWith("[") && ipVal.endsWith("]")) {
            ipVal = ipVal.slice(1, -1);
          }

          // Handle port stripping for IPv4 addresses
          if (ipVal.includes(":")) {
            const parts = ipVal.split(":");
            // Only strip port if it looks like IPv4:port (not IPv6)
            if (parts.length === 2 && isIP(parts[0])) {
              ipVal = parts[0];
            }
          }

          if (isIP(ipVal)) {
            return ipVal;
          }
        }
      }
    }
  }

  return undefined;
}

// Helper function to get header value case-insensitively
function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const lowerName = name.toLowerCase();

  // Check exact match first
  const exactMatch = headers[lowerName];
  if (exactMatch) {
    return Array.isArray(exactMatch) ? exactMatch[0] : exactMatch;
  }

  // Check case-insensitive match
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName && value) {
      return Array.isArray(value) ? value[0] : value;
    }
  }

  return undefined;
}
