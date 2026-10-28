import { transporter } from '../../lib/transporter.js';

export async function sendEmail(to: string, subject: string, text: string) {
  await transporter.sendMail({
    from: 'linguistix@lang.com',
    to,
    subject,
    text,
  });
}

export async function sendVerificationEmail(to: string, verificationToken: string) {
  const url = `${process.env.BACKEND_URL}/api/auth/verify-email?token=${verificationToken}`;

  await sendEmail(to, 'Linguistix email verification', `Verify your email ${url}`);
}

export async function sendResetPassword(to: string, verificationToken: string) {
  const url = `${process.env.FRONTEND_URL}?token=${verificationToken}`;

  await sendEmail(
    to,
    'Linguistix reset password',
    `Here is the link to reset your password - ${url}`,
  );
}
