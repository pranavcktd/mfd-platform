import nodemailer from "nodemailer";

/**
 * Same pattern as apps/api/src/admin/onboarding-email.ts (MFD onboarding
 * welcome email) — reuses the same shared Gmail SMTP transport, just a
 * different recipient/copy for a client-portal login instead of an MFD
 * distributor login. Failure is logged, not thrown: the MFD still has the
 * credentials from the API response to relay manually.
 */
export async function sendPortalLoginEmail(params: {
  toEmail: string;
  clientName: string;
  loginEmail: string;
  initialPassword: string;
}): Promise<{ sent: boolean; error?: string }> {
  const user = process.env.BACKEND_GMAIL_ADDRESS;
  const pass = process.env.BACKEND_GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return { sent: false, error: "BACKEND_GMAIL_ADDRESS / BACKEND_GMAIL_APP_PASSWORD not configured" };
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: user,
      to: params.toEmail,
      subject: "Your investment portfolio portal login is ready",
      text:
        `Hi ${params.clientName},\n\n` +
        `You can now view your investment portfolio online.\n\n` +
        `Login email: ${params.loginEmail}\n` +
        `Temporary password: ${params.initialPassword}\n\n` +
        `You'll be asked to set a new password the first time you sign in.\n\n` +
        `— Your Mutual Fund Distributor`,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
