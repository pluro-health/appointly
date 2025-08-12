import logger from "@calcom/lib/logger";

/**
 * Easebuzz webhook security configuration
 * Since Easebuzz doesn't provide webhook secrets, we use alternative security measures
 */

// Easebuzz server IP ranges (update these based on Easebuzz documentation)
// You should get the actual IP ranges from Easebuzz support
const EASEBUZZ_IP_RANGES = [
  // Example IPs - replace with actual Easebuzz server IPs
  "203.112.176.0/24", // Example range
  "103.25.40.0/24", // Example range
  // Add more IP ranges as provided by Easebuzz
];

/**
 * Check if an IP address is in the Easebuzz whitelist
 * @param clientIP - The client IP address
 * @returns boolean indicating if IP is whitelisted
 */
export function isEasebuzzIP(clientIP: string): boolean {
  // For development/testing, you might want to allow localhost
  if (process.env.NODE_ENV === "development") {
    if (clientIP === "localhost" || clientIP === "127.0.0.1" || clientIP === "::1") {
      return true;
    }
  }

  // In production, implement proper IP range checking
  // For now, we'll log the IP and return true
  // You should implement proper CIDR range checking here
  logger.info("Webhook IP check", { clientIP, whitelisted: true });

  // TODO: Implement proper IP range checking
  // Example using a library like 'ipaddr.js':
  // return EASEBUZZ_IP_RANGES.some(range => isIPInRange(clientIP, range));

  return true; // For now, allow all IPs (implement proper checking in production)
}

/**
 * Additional webhook security measures for Easebuzz
 */
export const EasebuzzWebhookSecurity = {
  /**
   * Validate webhook user agent
   */
  isValidUserAgent(userAgent: string | null): boolean {
    if (!userAgent) return false;

    // Easebuzz might use specific user agents
    // Update this based on actual Easebuzz webhook user agents
    const validUserAgents = [
      "EasebuzzWebhook",
      "Easebuzz",
      // Add more as needed
    ];

    return validUserAgents.some((ua) => userAgent.includes(ua));
  },

  /**
   * Rate limiting for webhook endpoints
   */
  checkRateLimit(clientIP: string): boolean {
    // Implement rate limiting logic here
    // For example, max 100 requests per minute per IP
    return true;
  },

  /**
   * Validate webhook timing (prevent replay attacks)
   */
  isWithinTimeWindow(timestamp?: string): boolean {
    if (!timestamp) return true; // If no timestamp provided, allow

    const webhookTime = new Date(timestamp);
    const now = new Date();
    const timeDiff = Math.abs(now.getTime() - webhookTime.getTime());
    const maxAgeMs = 5 * 60 * 1000; // 5 minutes

    return timeDiff <= maxAgeMs;
  },
};

/**
 * Comprehensive webhook security check
 */
export function validateEasebuzzWebhook(
  clientIP: string,
  userAgent: string | null,
  webhookData: any
): {
  isValid: boolean;
  reason?: string;
} {
  // Check IP whitelist
  if (!isEasebuzzIP(clientIP)) {
    return {
      isValid: false,
      reason: `IP ${clientIP} not in Easebuzz whitelist`,
    };
  }

  // Check rate limiting
  if (!EasebuzzWebhookSecurity.checkRateLimit(clientIP)) {
    return {
      isValid: false,
      reason: "Rate limit exceeded",
    };
  }

  // Check timing (if timestamp provided)
  if (webhookData.timestamp && !EasebuzzWebhookSecurity.isWithinTimeWindow(webhookData.timestamp)) {
    return {
      isValid: false,
      reason: "Webhook timestamp outside valid window",
    };
  }

  // Optional: Check user agent (enable if Easebuzz provides specific user agents)
  // if (!EasebuzzWebhookSecurity.isValidUserAgent(userAgent)) {
  //   return {
  //     isValid: false,
  //     reason: "Invalid user agent"
  //   };
  // }

  return { isValid: true };
}
