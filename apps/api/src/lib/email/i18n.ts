import type { EmailLocale } from "./locale.js";

export interface EmailMessages {
  brand: string;
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
}

const es: EmailMessages = {
  brand: "Optimización de Portafolio",
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
};

const en: EmailMessages = {
  brand: "Portfolio Optimization",
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
};

export const emailMessages: Record<EmailLocale, EmailMessages> = { es, en };
