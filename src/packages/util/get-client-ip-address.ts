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
        const processedIp = normalizeIPAddress(ip);
        if (isIP(processedIp)) {
          return processedIp;
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
    // Split by comma for multiple forwarded entries, trimming each entry
    const forwardedEntries = forwardedHeader.split(",").map(entry => entry.trim());

    for (const entry of forwardedEntries) {
      // Split by semicolon for parameters, trimming each parameter
      const params = entry.split(";").map(param => param.trim());

      for (const param of params) {
        if (param.toLowerCase().startsWith("for=")) {
          let ipVal = param.substring(4).trim();

          // Remove quotes if present
          if (ipVal.startsWith('"') && ipVal.endsWith('"')) {
            ipVal = ipVal.slice(1, -1);
          }

          // Normalize IP address (remove brackets and ports)
          ipVal = normalizeIPAddress(ipVal);

          if (isIP(ipVal)) {
            return ipVal;
          }
        }
      }
    }
  }

  return undefined;
}

// Helper function to normalize IP address by removing brackets and ports
function normalizeIPAddress(ip: string): string {
  let processedIp = ip.trim();

  // Remove IPv6 brackets if present (do this first!)
  const bracketStart = processedIp.startsWith("[");
  const closingBracketIndex = processedIp.indexOf("]");
  const hasPortAfterBracket = closingBracketIndex > 0 && processedIp[closingBracketIndex + 1] === ":";
  if (bracketStart && hasPortAfterBracket) {
    // Extract IPv6 part and port: [2001:db8::1]:8080 -> 2001:db8::1:8080
    processedIp = processedIp.substring(1, closingBracketIndex) + processedIp.substring(closingBracketIndex + 1);
  } else if (processedIp.startsWith("[") && processedIp.endsWith("]")) {
    // Simple bracket removal: [2001:db8::1] -> 2001:db8::1
    processedIp = processedIp.slice(1, -1);
  }

  // Strip port if present (handles both IPv4:port and IPv6:port)
  if (processedIp.includes(":")) {
    const lastColonIndex = processedIp.lastIndexOf(":");
    if (lastColonIndex > 0) {
      const potentialPort = processedIp.substring(lastColonIndex + 1);
      // If the part after the last colon looks like a port number
      if (/^\d+$/.test(potentialPort)) {
        const potentialIP = processedIp.substring(0, lastColonIndex);
        if (isIP(potentialIP)) {
          processedIp = potentialIP;
        }
      }
    }
  }

  return processedIp;
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
