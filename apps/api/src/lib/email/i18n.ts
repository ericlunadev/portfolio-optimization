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
  scheduledSubject: (scheduleName?: string | null) => string;
  scheduledHeading: (name?: string | null) => string;
  scheduledIntro: (count: number) => string;
  /** The window widens as the end date moves; results drift for that reason too. */
  scheduledWindowNote: string;
  scheduledPeriod: string;
  scheduledExpectedReturn: string;
  scheduledVolatility: string;
  scheduledSharpe: string;
  scheduledVsPrevious: string;
  scheduledFirstRun: string;
  scheduledTopWeights: string;
  scheduledWeightChanges: string;
  scheduledOpenSimulation: string;
  scheduledRunFailed: (count: number) => string;
  scheduledNoCreditsSubject: string;
  scheduledNoCredits: string;
  /** Sent once, with the first skipped run: warns of the pause rather than a second email. */
  scheduledPauseWarning: (attempts: number) => string;
  scheduledBuyCredits: string;
  scheduledFooter: string;
  scheduledManage: string;
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
  scheduledSubject: (scheduleName) =>
    scheduleName ? `Tu envío programado: ${scheduleName}` : "Tus simulaciones actualizadas",
  scheduledHeading: (name) => (name ? `Hola, ${name}.` : "Hola,"),
  scheduledIntro: (count) =>
    count === 1
      ? "Volvimos a ejecutar tu simulación con los datos de mercado más recientes."
      : `Volvimos a ejecutar tus ${count} simulaciones con los datos de mercado más recientes.`,
  scheduledWindowNote:
    "El periodo analizado termina ahora en el mes actual, así que también es más largo que la vez anterior: los cambios reflejan datos nuevos y una ventana más amplia.",
  scheduledPeriod: "Periodo",
  scheduledExpectedReturn: "Rendimiento esperado",
  scheduledVolatility: "Volatilidad",
  scheduledSharpe: "Ratio de Sharpe",
  scheduledVsPrevious: "vs. la ejecución anterior",
  scheduledFirstRun: "Primera ejecución programada: aún no hay una anterior con la cual comparar.",
  scheduledTopWeights: "Pesos principales",
  scheduledWeightChanges: "Mayores cambios de peso",
  scheduledOpenSimulation: "Ver simulación",
  scheduledRunFailed: (count) =>
    count === 1
      ? "Una simulación no se pudo ejecutar esta vez y no se te cobró."
      : `${count} simulaciones no se pudieron ejecutar esta vez y no se te cobraron.`,
  scheduledNoCreditsSubject: "No pudimos ejecutar tu envío programado",
  scheduledNoCredits:
    "Tu saldo de créditos no alcanza para ejecutar las simulaciones programadas, así que omitimos este envío. Cada simulación cuesta 1 crédito.",
  scheduledPauseWarning: (attempts) =>
    `Si el saldo sigue sin alcanzar, pausaremos el envío tras ${attempts} intentos seguidos. Puedes reanudarlo cuando quieras.`,
  scheduledBuyCredits: "Comprar créditos",
  scheduledFooter: "Recibes este correo porque programaste un envío de simulaciones.",
  scheduledManage: "Administrar o cancelar envíos",
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
  scheduledSubject: (scheduleName) =>
    scheduleName ? `Your scheduled report: ${scheduleName}` : "Your simulations, updated",
  scheduledHeading: (name) => (name ? `Hi ${name},` : "Hello,"),
  scheduledIntro: (count) =>
    count === 1
      ? "We re-ran your simulation with the latest market data."
      : `We re-ran your ${count} simulations with the latest market data.`,
  scheduledWindowNote:
    "The analysis period now ends in the current month, so it is also longer than last time: changes reflect both new data and a wider window.",
  scheduledPeriod: "Period",
  scheduledExpectedReturn: "Expected return",
  scheduledVolatility: "Volatility",
  scheduledSharpe: "Sharpe ratio",
  scheduledVsPrevious: "vs. previous run",
  scheduledFirstRun: "First scheduled run: there is no earlier run to compare against yet.",
  scheduledTopWeights: "Top weights",
  scheduledWeightChanges: "Largest weight changes",
  scheduledOpenSimulation: "View simulation",
  scheduledRunFailed: (count) =>
    count === 1
      ? "One simulation could not run this time and you were not charged for it."
      : `${count} simulations could not run this time and you were not charged for them.`,
  scheduledNoCreditsSubject: "We couldn't run your scheduled report",
  scheduledNoCredits:
    "Your credit balance is too low to run your scheduled simulations, so this report was skipped. Each simulation costs 1 credit.",
  scheduledPauseWarning: (attempts) =>
    `If the balance is still too low, we will pause the schedule after ${attempts} attempts in a row. You can resume it at any time.`,
  scheduledBuyCredits: "Buy credits",
  scheduledFooter: "You are receiving this email because you scheduled a simulation report.",
  scheduledManage: "Manage or cancel reports",
};

export const emailMessages: Record<EmailLocale, EmailMessages> = { es, en };
