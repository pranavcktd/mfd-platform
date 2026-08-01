import nodemailer from "nodemailer";

/**
 * Sends the new MFD their login credentials, using the same shared Gmail
 * account already configured for IMAP mail-reading (BACKEND_GMAIL_ADDRESS /
 * BACKEND_GMAIL_APP_PASSWORD) — Gmail App Passwords work for SMTP send too,
 * so no new credential is needed. Failure here is logged, not thrown: a
 * failed welcome email shouldn't roll back an otherwise-successful
 * onboarding — the operator still has the credentials from the API
 * response to relay manually.
 */
export async function sendOnboardingEmail(params: {
  toEmail: string;
  distributorName: string;
  arnNumber: string;
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
      subject: "Your MFD Platform login is ready",
      text:
        `Hi ${params.distributorName},\n\n` +
        `Your account for ARN-${params.arnNumber} has been created on the MFD Platform.\n\n` +
        `Login email: ${params.loginEmail}\n` +
        `Temporary password: ${params.initialPassword}\n\n` +
        `You'll be asked to set a new password the first time you sign in.\n\n` +
        `— MFD Platform`,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
