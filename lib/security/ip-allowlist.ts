/**
 * IP Allowlist for sysadmin route protection.
 * 
 * The SYSADMIN_IP_ALLOWLIST environment variable should contain
 * a comma-separated list of allowed IPs or CIDR ranges.
 * 
 * Example: "192.168.1.1,10.0.0.0/8,2001:db8::/32"
 */

/**
 * Parse an IP address string into its numeric components.
 */
function parseIPv4(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  
  const nums = parts.map(p => parseInt(p, 10));
  if (nums.some(n => isNaN(n) || n < 0 || n > 255)) return null;
  
  return nums;
}

/**
 * Check if an IPv4 address is within a CIDR range.
 */
function isIPv4InCIDR(ip: string, cidr: string): boolean {
  const [cidrIP, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;
  
  const ipNums = parseIPv4(ip);
  const cidrNums = parseIPv4(cidrIP);
  
  if (!ipNums || !cidrNums) return false;
  
  // Convert to 32-bit integers
  const ipInt = (ipNums[0] << 24) | (ipNums[1] << 16) | (ipNums[2] << 8) | ipNums[3];
  const cidrInt = (cidrNums[0] << 24) | (cidrNums[1] << 16) | (cidrNums[2] << 8) | cidrNums[3];
  
  // Create mask
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix));
  
  return (ipInt & mask) === (cidrInt & mask);
}

/**
 * Check if an IP address matches an allowlist entry.
 * Supports both exact IP matches and CIDR notation.
 */
function matchesEntry(ip: string, entry: string): boolean {
  const trimmedEntry = entry.trim();
  
  // Handle CIDR notation
  if (trimmedEntry.includes('/')) {
    // IPv4 CIDR
    if (!trimmedEntry.includes(':')) {
      return isIPv4InCIDR(ip, trimmedEntry);
    }
    // IPv6 CIDR - simplified: just compare prefix
    // For full IPv6 CIDR support, use a dedicated library
    return false;
  }
  
  // Exact match
  return ip === trimmedEntry;
}

/**
 * Get the list of allowed IPs/CIDRs from environment.
 */
export function getAllowedIPs(): string[] {
  const allowlist = process.env.SYSADMIN_IP_ALLOWLIST || '';
  if (!allowlist.trim()) return [];
  
  return allowlist
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Check if an IP address is in the sysadmin allowlist.
 * 
 * @param ip - The IP address to check
 * @returns true if allowed, false if not
 */
export function isIPAllowed(ip: string | null | undefined): boolean {
  if (!ip) return false;
  
  const allowedIPs = getAllowedIPs();
  
  // If no allowlist is configured, deny all sysadmin access
  // This is a security-first default
  if (allowedIPs.length === 0) {
    console.warn('[Security] No SYSADMIN_IP_ALLOWLIST configured - denying sysadmin access');
    return false;
  }
  
  // Check each entry
  for (const entry of allowedIPs) {
    if (matchesEntry(ip, entry)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Extract client IP from request headers.
 * Handles X-Forwarded-For, X-Real-IP, and CF-Connecting-IP headers.
 * Falls back to localhost IPs for local development.
 */
export function getClientIP(request: Request): string | null {
  // Check common headers in priority order
  const headers = [
    'cf-connecting-ip',      // Cloudflare
    'x-real-ip',             // Nginx proxy
    'x-forwarded-for',       // Standard proxy header
  ];

  for (const header of headers) {
    const value = request.headers.get(header);
    if (value) {
      // X-Forwarded-For can be comma-separated - take the first (client) IP
      const ip = value.split(',')[0].trim();
      if (ip) return ip;
    }
  }

  // For local development, check if we're on localhost
  // In Next.js, when running locally without a proxy, there are no forwarding headers
  // We can infer localhost from the Host header
  const host = request.headers.get('host') || '';
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]')) {
    // Return localhost IP so it can be matched against the allowlist
    return '127.0.0.1';
  }

  return null;
}

/**
 * Check if the request IP is allowed for sysadmin access.
 */
export function isSysadminIPAllowed(request: Request): boolean {
  const clientIP = getClientIP(request);
  return isIPAllowed(clientIP);
}

