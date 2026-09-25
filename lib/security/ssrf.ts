import { URL } from 'url'

/**
 * Checks if an IP address is a private, loopback, or cloud-metadata IP.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  // IPv4 Loopback
  if (ip === '127.0.0.1' || ip.startsWith('127.')) return true

  // IPv6 Loopback
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true

  // AWS/GCP/Azure Metadata Endpoint
  if (ip === '169.254.169.254' || ip.startsWith('169.254.')) return true

  // Private RFC 1918 ranges
  // 10.0.0.0/8
  if (ip.startsWith('10.')) return true

  // 192.168.0.0/16
  if (ip.startsWith('192.168.')) return true

  // 172.16.0.0/12 (172.16.x.x to 172.31.x.x)
  if (ip.startsWith('172.')) {
    const parts = ip.split('.')
    if (parts.length > 1) {
      const secondOctet = parseInt(parts[1], 10)
      if (secondOctet >= 16 && secondOctet <= 31) return true
    }
  }

  // Carrier Grade NAT 100.64.0.0/10
  if (ip.startsWith('100.')) {
    const parts = ip.split('.')
    if (parts.length > 1) {
      const secondOctet = parseInt(parts[1], 10)
      if (secondOctet >= 64 && secondOctet <= 127) return true
    }
  }

  // Localhost aliases / 0.0.0.0
  if (ip === '0.0.0.0' || ip === '::') return true

  return false
}

/**
 * Validates whether an external URL is safe to fetch from server side.
 * Prevents SSRF attacks against internal microservices, loopbacks, or cloud metadata endpoints.
 */
export function validateSafeExternalUrl(
  inputUrl: string,
  options: {
    allowedProtocols?: string[]
    allowLocalhost?: boolean
  } = {}
): {
  valid: boolean
  error?: string
  parsedUrl?: URL
} {
  try {
    const parsed = new URL(inputUrl)
    const allowedProtocols = options.allowedProtocols || ['http:', 'https:']

    if (!allowedProtocols.includes(parsed.protocol)) {
      return {
        valid: false,
        error: `Disallowed protocol "${parsed.protocol}". Only HTTP and HTTPS are permitted.`,
      }
    }

    const hostname = parsed.hostname.toLowerCase().trim()

    if (!hostname) {
      return { valid: false, error: 'Empty hostname.' }
    }

    // Check for obvious localhost / internal hostnames
    if (!options.allowLocalhost) {
      if (
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal') ||
        hostname.includes('metadata') ||
        hostname === '169.254.169.254' ||
        hostname === '100.100.100.100'
      ) {
        return {
          valid: false,
          error: 'Access to internal, loopback, or metadata services is restricted.',
        }
      }

      // Check IP pattern
      if (isPrivateOrReservedIp(hostname)) {
        return {
          valid: false,
          error: 'Access to private or reserved IP address is forbidden.',
        }
      }
    }

    return { valid: true, parsedUrl: parsed }
  } catch {
    return { valid: false, error: 'Invalid URL format.' }
  }
}
