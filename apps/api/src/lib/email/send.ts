import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { env } from "../../config/env.js";
import { getResendClient } from "./client.js";

export interface SendEmailParams {
  to: string;
  subject: string;
  react: ReactElement;
}

export async function sendEmail({
  to,
  subject,
  react,
}: SendEmailParams): Promise<void> {
  const html = await render(react);
  const { error } = await getResendClient().emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
  });
  if (error) {
    console.error("[email] Resend send failed", { to, subject, error });
    throw new Error(
      `Failed to send email to ${to}: ${error.message ?? "unknown error"}`
    );
  }
}
