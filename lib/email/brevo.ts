interface BrevoSendParams {
  toEmail: string
  toName?: string
  subject: string
  htmlContent: string
  textContent: string
}

interface BrevoSendResult {
  success: boolean
  messageId?: string
  error?: string
  simulated?: boolean
}

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'

/**
 * Sends a transactional email using the Brevo (Sendinblue) API.
 * This runs ONLY on the server side and never exposes API keys to client code.
 */
export async function sendBrevoEmail(params: BrevoSendParams): Promise<BrevoSendResult> {
  const apiKey = process.env.BREVO_API_KEY
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@vx.dev'
  const senderName = process.env.BREVO_SENDER_NAME || 'VX'

  // If no API key is configured (e.g. local developer mode before env vars are populated)
  if (!apiKey || apiKey.trim() === '') {
    // Log safe notification without revealing code or token
    console.warn(
      `[Brevo Service] BREVO_API_KEY is not set. Email delivery to ${params.toEmail} simulated in local dev mode.`
    )
    return {
      success: true,
      simulated: true,
      messageId: `simulated-${Date.now()}`,
    }
  }

  try {
    const payload = {
      sender: {
        name: senderName,
        email: senderEmail,
      },
      to: [
        {
          email: params.toEmail,
          name: params.toName || params.toEmail.split('@')[0],
        },
      ],
      subject: params.subject,
      htmlContent: params.htmlContent,
      textContent: params.textContent,
    }

    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey.trim(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      const errorMsg =
        (errorData as { message?: string }).message ||
        `Brevo API responded with HTTP status ${res.status}`
      console.error('[Brevo Service] Email delivery failure:', errorMsg)
      return {
        success: false,
        error: 'Failed to send transactional email. Please verify email settings.',
      }
    }

    const data = await res.json().catch(() => ({}))
    return {
      success: true,
      messageId: (data as { messageId?: string }).messageId,
    }
  } catch (err) {
    console.error('[Brevo Service] Network error while contacting Brevo API:', err)
    return {
      success: false,
      error: 'Network error communicating with email delivery service',
    }
  }
}

/**
 * Sends a 6-digit verification code email via Brevo.
 */
export async function sendVerificationEmail(
  toEmail: string,
  recipientName: string,
  code: string
): Promise<BrevoSendResult> {
  const subject = `${code} is your VX verification code`
  const displayName = recipientName || toEmail.split('@')[0]

  const textContent = `
VX Verification Code

Hello ${displayName},

Your verification code is: ${code}

This code will expire in 15 minutes.

For security reasons, never share this code with anyone. If you didn't create an account on VX, you can safely ignore this email.

— The VX Team
`.trim()

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your VX account</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0c0c0e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0c0c0e; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #161619; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; border-bottom: 1px solid #27272a; text-align: center;">
              <div style="display: inline-block; font-size: 24px; font-weight: 800; letter-spacing: 0.08em; color: #ffffff;">
                <span style="display: inline-block; background: #27272a; border: 1px solid #3f3f46; border-radius: 6px; padding: 4px 10px; margin-right: 8px;">VX</span>
              </div>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px 32px 24px;">
              <h1 style="margin: 0 0 12px; font-size: 20px; font-weight: 600; color: #ffffff; letter-spacing: -0.01em;">
                Verify your email address
              </h1>
              <p style="margin: 0 0 24px; font-size: 14.5px; line-height: 1.6; color: #a1a1aa;">
                Hello <strong style="color: #f4f4f5;">${escapeHtml(displayName)}</strong>,<br>
                Thank you for signing up for VX. Use the verification code below to confirm your account:
              </p>

              <!-- Verification Code Box -->
              <div style="background-color: #0c0c0e; border: 1px solid #3f3f46; border-radius: 8px; padding: 20px; text-align: center; margin: 28px 0;">
                <span style="font-family: 'SF Mono', Monaco, Consolas, 'Liberation Mono', monospace; font-size: 32px; font-weight: 700; letter-spacing: 0.35em; color: #ffffff; padding-left: 0.35em;">
                  ${escapeHtml(code)}
                </span>
              </div>

              <p style="margin: 0 0 16px; font-size: 13.5px; line-height: 1.5; color: #a1a1aa;">
                ⏱ This code expires in <strong>15 minutes</strong> and is valid for a single use.
              </p>

              <div style="background-color: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 6px; padding: 12px 14px; margin-top: 20px;">
                <p style="margin: 0; font-size: 12.5px; line-height: 1.4; color: #fca5a5;">
                  🔒 <strong>Security Notice:</strong> Never share this code with anyone. VX staff will never ask for your verification code.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #111113; border-top: 1px solid #27272a; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #71717a;">
                If you did not request this email, no further action is required.
              </p>
              <p style="margin: 8px 0 0; font-size: 12px; color: #52525b;">
                VX • AI Developer Workspace
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim()

  return sendBrevoEmail({
    toEmail,
    toName: displayName,
    subject,
    htmlContent,
    textContent,
  })
}

/**
 * Sends a Password Reset email via Brevo.
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  recipientName: string,
  resetToken: string
): Promise<BrevoSendResult> {
  const subject = 'Reset your VX password'
  const displayName = recipientName || toEmail.split('@')[0]

  const textContent = `
Reset Your Password

Hello ${displayName},

We received a request to reset your VX account password.

Your reset token is: ${resetToken}

This token will expire in 1 hour. If you did not request a password reset, you can safely ignore this email.

— The VX Team
`.trim()

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your VX password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0c0c0e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0c0c0e; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #161619; border: 1px solid #27272a; border-radius: 12px; overflow: hidden;">
          <tr>
            <td style="padding: 32px 32px 24px; border-bottom: 1px solid #27272a; text-align: center;">
              <span style="font-size: 24px; font-weight: 800; color: #ffffff;">VX</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 12px; font-size: 20px; font-weight: 600; color: #ffffff;">
                Password Reset Request
              </h1>
              <p style="margin: 0 0 20px; font-size: 14.5px; line-height: 1.6; color: #a1a1aa;">
                Hello <strong style="color: #f4f4f5;">${escapeHtml(displayName)}</strong>,<br>
                We received a request to reset the password associated with your account.
              </p>
              <div style="background-color: #0c0c0e; border: 1px solid #3f3f46; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
                <span style="font-family: monospace; font-size: 16px; font-weight: 600; color: #ffffff; word-break: break-all;">
                  ${escapeHtml(resetToken)}
                </span>
              </div>
              <p style="margin: 0; font-size: 13.5px; line-height: 1.5; color: #a1a1aa;">
                This reset token will expire in <strong>1 hour</strong>. If you did not request this, you can ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #111113; border-top: 1px solid #27272a; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #71717a;">VX • AI Developer Workspace</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim()

  return sendBrevoEmail({
    toEmail,
    toName: displayName,
    subject,
    htmlContent,
    textContent,
  })
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
