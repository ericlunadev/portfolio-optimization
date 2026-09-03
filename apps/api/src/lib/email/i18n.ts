import type { EmailLocale } from "./locale.js";

export interface EmailMessages {
  brand: string;
  /**
   * Investing disclaimer for any email carrying simulation results (see
   * `CRON.md`). Mirrors `Legal.email` in the web app's message files — an email
   * leaves the app, so it has to carry the notice itself.
   */
  investingDisclaimer: string;
  verifySubject: string;
  verifyHeading: (name?: string | null) => string;
  verifyBody: string;
  verifyButton: string;
  verifyFallbackIntro: string;
  verifyFooter: string;
  resetSubject: string;
  resetHeading: (name?: string | null) => string;
  resetBody: string;
  resetButton: string;
  resetFallbackIntro: string;
  resetFooter: string;
  lowBalanceSubject: string;
  lowBalanceHeading: (name?: string | null) => string;
  lowBalanceBody: (organizationName: string) => string;
  lowBalanceBalance: (credits: number) => string;
  lowBalanceButton: string;
  lowBalanceFallbackIntro: string;
  lowBalanceFooter: string;
}

const es: EmailMessages = {
  brand: "Optimización de Portafolio",
  investingDisclaimer:
    "Documento informativo generado automáticamente. No constituye asesoría de inversión. Los rendimientos pasados no garantizan resultados futuros.",
  verifySubject: "Confirma tu correo electrónico",
  verifyHeading: (name) => (name ? `Hola, ${name}.` : "¡Bienvenido!"),
  verifyBody:
    "Para activar tu cuenta y proteger tu acceso, confirma que este es tu correo haciendo clic en el botón de abajo.",
  verifyButton: "Confirmar correo",
  verifyFallbackIntro:
    "Si el botón no funciona, copia y pega este enlace en tu navegador:",
  verifyFooter: "Si no creaste una cuenta, puedes ignorar este mensaje.",
  resetSubject: "Restablece tu contraseña",
  resetHeading: (name) => (name ? `Hola, ${name}.` : "Hola,"),
  resetBody:
    "Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el botón para elegir una nueva.",
  resetButton: "Restablecer contraseña",
  resetFallbackIntro:
    "Si el botón no funciona, copia y pega este enlace en tu navegador:",
  resetFooter:
    "Si no solicitaste este cambio, ignora este correo y tu contraseña permanecerá igual.",
  lowBalanceSubject: "Saldo de créditos bajo",
  lowBalanceHeading: (name) => (name ? `Hola, ${name}.` : "Hola,"),
  lowBalanceBody: (organizationName) =>
    `El saldo de créditos de ${organizationName} cayó por debajo del 20 % de su última recarga. Cuando se agote, tu equipo no podrá ejecutar optimizaciones.`,
  lowBalanceBalance: (credits) => `Saldo actual: ${credits} créditos.`,
  lowBalanceButton: "Recargar créditos",
  lowBalanceFallbackIntro:
    "Si el botón no funciona, copia y pega este enlace en tu navegador:",
  lowBalanceFooter:
    "Recibes este aviso porque eres la persona propietaria de la organización.",
};

const en: EmailMessages = {
  brand: "Portfolio Optimization",
  investingDisclaimer:
    "Automatically generated informational document. It does not constitute investment advice. Past performance does not guarantee future results.",
  verifySubject: "Confirm your email address",
  verifyHeading: (name) => (name ? `Hi ${name},` : "Welcome!"),
  verifyBody:
    "To activate your account and secure your access, please confirm this is your email by clicking the button below.",
  verifyButton: "Confirm email",
  verifyFallbackIntro:
    "If the button doesn't work, copy and paste this link into your browser:",
  verifyFooter:
    "If you didn't create an account, you can safely ignore this message.",
  resetSubject: "Reset your password",
  resetHeading: (name) => (name ? `Hi ${name},` : "Hello,"),
  resetBody:
    "We received a request to reset your account password. Click the button below to choose a new one.",
  resetButton: "Reset password",
  resetFallbackIntro:
    "If the button doesn't work, copy and paste this link into your browser:",
  resetFooter:
    "If you didn't request this change, ignore this email and your password will remain unchanged.",
  lowBalanceSubject: "Your credit balance is running low",
  lowBalanceHeading: (name) => (name ? `Hi ${name},` : "Hello,"),
  lowBalanceBody: (organizationName) =>
    `${organizationName}'s credit balance has fallen below 20% of its last top-up. Once it runs out, your team will not be able to run optimizations.`,
  lowBalanceBalance: (credits) => `Current balance: ${credits} credits.`,
  lowBalanceButton: "Top up credits",
  lowBalanceFallbackIntro:
    "If the button doesn't work, copy and paste this link into your browser:",
  lowBalanceFooter:
    "You are receiving this notice because you are the organization's owner.",
};

export const emailMessages: Record<EmailLocale, EmailMessages> = { es, en };
