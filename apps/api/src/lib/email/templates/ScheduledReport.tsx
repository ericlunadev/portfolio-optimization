import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import { emailMessages } from "../i18n.js";
import type { EmailLocale } from "../locale.js";
import type { EmailBranding } from "../tenant.js";

export interface ReportMetrics {
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
}

export interface ReportEntry {
  simulationId: string;
  name: string;
  /** DD/MM/YYYY */
  periodStart: string;
  /** DD/MM/YYYY */
  periodEnd: string;
  current: ReportMetrics;
  /** The previous successful run, or null on the first one. */
  previous: ReportMetrics | null;
  /** Rows to show: top weights on a first run, largest changes otherwise. */
  weights: { ticker: string; weight: number; previousWeight: number | null }[];
  url: string;
}

export interface ScheduledReportProps {
  locale: EmailLocale;
  userName?: string | null;
  scheduleName?: string | null;
  entries: ReportEntry[];
  failedCount: number;
  manageUrl: string;
  /** The schedule's tenant; a field it leaves empty falls back to our own brand. */
  branding?: EmailBranding;
}

/** Our own accent, for a tenant that has not set one. */
const DEFAULT_ACCENT = "#2563ff";
const DARK_TEXT = "#0b132b";
const LIGHT_TEXT = "#ffffff";

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/**
 * The accent and the text that reads on it. A tenant can pick any colour, so the
 * button label is whichever of dark or white has the higher WCAG contrast
 * against it — white on our blue, dark on a pale accent.
 */
export function accentColors(accentHex?: string | null): { accent: string; onAccent: string } {
  const accent = accentHex && /^#[0-9a-f]{6}$/i.test(accentHex) ? accentHex : DEFAULT_ACCENT;
  const l = luminance(accent);
  const againstDark = (l + 0.05) / (luminance(DARK_TEXT) + 0.05);
  const againstLight = 1.05 / (l + 0.05);
  return { accent, onAccent: againstDark >= againstLight ? DARK_TEXT : LIGHT_TEXT };
}

function accentStyles(branding?: EmailBranding) {
  const { accent, onAccent } = accentColors(branding?.accentHex);
  return {
    button: { ...styles.button, backgroundColor: accent, color: onAccent },
    link: { ...styles.link, color: accent },
  };
}

const percent = (value: number) => `${(value * 100).toFixed(2)}%`;

/** Signed change: percentage points for rates, plain units for Sharpe. */
export function formatDelta(current: number, previous: number, kind: "rate" | "ratio"): string {
  const diff = kind === "rate" ? (current - previous) * 100 : current - previous;
  const rounded = Number(diff.toFixed(2));
  if (rounded === 0) return kind === "rate" ? "0.00 pp" : "0.00";
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${Math.abs(rounded).toFixed(2)}${kind === "rate" ? " pp" : ""}`;
}

export function ScheduledReport({
  locale,
  userName,
  scheduleName,
  entries,
  failedCount,
  manageUrl,
  branding,
}: ScheduledReportProps) {
  const m = emailMessages[locale];
  const accent = accentStyles(branding);

  return (
    <Html>
      <Head />
      <Preview>{m.scheduledSubject(scheduleName)}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>{branding?.productName || m.brand}</Text>
          <Heading style={styles.heading}>{m.scheduledHeading(userName)}</Heading>
          <Text style={styles.text}>{m.scheduledIntro(entries.length)}</Text>
          <Text style={styles.note}>{m.scheduledWindowNote}</Text>

          {entries.map((entry) => (
            <Section key={entry.simulationId} style={styles.card}>
              <Text style={styles.cardTitle}>{entry.name}</Text>
              <Text style={styles.period}>
                {`${m.scheduledPeriod}: ${entry.periodStart} – ${entry.periodEnd}`}
              </Text>

              <Row>
                {(
                  [
                    [m.scheduledExpectedReturn, "expectedReturn", "rate"],
                    [m.scheduledVolatility, "volatility", "rate"],
                    [m.scheduledSharpe, "sharpeRatio", "ratio"],
                  ] as const
                ).map(([label, key, kind]) => (
                  <Column key={key} style={styles.metric}>
                    <Text style={styles.metricLabel}>{label}</Text>
                    <Text style={styles.metricValue}>
                      {kind === "rate"
                        ? percent(entry.current[key])
                        : entry.current[key].toFixed(2)}
                    </Text>
                    {entry.previous && (
                      <Text style={styles.metricDelta}>
                        {formatDelta(entry.current[key], entry.previous[key], kind)}
                      </Text>
                    )}
                  </Column>
                ))}
              </Row>

              <Text style={styles.caption}>
                {entry.previous ? m.scheduledVsPrevious : m.scheduledFirstRun}
              </Text>

              {entry.weights.length > 0 && (
                <>
                  <Text style={styles.subheading}>
                    {entry.previous ? m.scheduledWeightChanges : m.scheduledTopWeights}
                  </Text>
                  {entry.weights.map((w) => (
                    <Row key={w.ticker}>
                      <Column style={styles.weightTicker}>{w.ticker}</Column>
                      <Column style={styles.weightValue}>
                        {w.previousWeight !== null
                          ? `${percent(w.previousWeight)} → ${percent(w.weight)}`
                          : percent(w.weight)}
                      </Column>
                    </Row>
                  ))}
                </>
              )}

              <Section style={styles.buttonWrap}>
                <Button href={entry.url} style={accent.button}>
                  {m.scheduledOpenSimulation}
                </Button>
              </Section>
            </Section>
          ))}

          {failedCount > 0 && <Text style={styles.note}>{m.scheduledRunFailed(failedCount)}</Text>}

          <Hr style={styles.hr} />
          <Text style={styles.footer}>{branding?.disclaimerText || m.investingDisclaimer}</Text>
          <Text style={styles.footer}>
            {m.scheduledFooter}{" "}
            <Link href={manageUrl} style={accent.link}>
              {m.scheduledManage}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export interface ScheduledNoCreditsProps {
  locale: EmailLocale;
  userName?: string | null;
  pauseAfterAttempts: number;
  billingUrl: string;
  manageUrl: string;
  branding?: EmailBranding;
}

export function ScheduledNoCredits({
  locale,
  userName,
  pauseAfterAttempts,
  billingUrl,
  manageUrl,
  branding,
}: ScheduledNoCreditsProps) {
  const m = emailMessages[locale];
  const accent = accentStyles(branding);

  return (
    <Html>
      <Head />
      <Preview>{m.scheduledNoCreditsSubject}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>{branding?.productName || m.brand}</Text>
          <Heading style={styles.heading}>{m.scheduledHeading(userName)}</Heading>
          <Text style={styles.text}>{m.scheduledNoCredits}</Text>
          <Text style={styles.text}>{m.scheduledPauseWarning(pauseAfterAttempts)}</Text>
          <Section style={styles.buttonWrap}>
            <Button href={billingUrl} style={accent.button}>
              {m.scheduledBuyCredits}
            </Button>
          </Section>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>
            {m.scheduledFooter}{" "}
            <Link href={manageUrl} style={accent.link}>
              {m.scheduledManage}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: "#f1f5fb",
    fontFamily:
      "'Helvetica Neue', Helvetica, -apple-system, BlinkMacSystemFont, sans-serif",
    margin: 0,
    padding: "32px 16px",
  },
  container: {
    margin: "0 auto",
    padding: "32px 28px",
    maxWidth: "560px",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    border: "1px solid #d9e1ec",
  },
  brand: {
    fontSize: "12px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "#64748b",
    margin: "0 0 24px 0",
  },
  heading: {
    fontSize: "20px",
    fontWeight: 600,
    color: "#0b132b",
    margin: "0 0 16px 0",
    lineHeight: 1.3,
  },
  text: {
    fontSize: "15px",
    lineHeight: 1.6,
    color: "#1e293b",
    margin: "0 0 16px 0",
  },
  note: {
    fontSize: "13px",
    lineHeight: 1.5,
    color: "#52607a",
    margin: "0 0 24px 0",
  },
  card: {
    border: "1px solid #d9e1ec",
    borderRadius: "10px",
    padding: "16px 18px",
    margin: "0 0 16px 0",
  },
  cardTitle: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#0b132b",
    margin: "0 0 2px 0",
  },
  period: {
    fontSize: "12px",
    color: "#52607a",
    margin: "0 0 12px 0",
  },
  metric: {
    verticalAlign: "top" as const,
    width: "33%",
  },
  metricLabel: {
    fontSize: "11px",
    color: "#52607a",
    margin: 0,
  },
  metricValue: {
    fontSize: "18px",
    fontWeight: 600,
    color: "#0b132b",
    margin: "2px 0 0 0",
  },
  metricDelta: {
    fontSize: "12px",
    color: "#334155",
    margin: "2px 0 0 0",
  },
  caption: {
    fontSize: "11px",
    color: "#64748b",
    margin: "8px 0 12px 0",
  },
  subheading: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#1e293b",
    margin: "0 0 4px 0",
  },
  weightTicker: {
    fontSize: "13px",
    color: "#1e293b",
    padding: "2px 0",
  },
  weightValue: {
    fontSize: "13px",
    color: "#1e293b",
    textAlign: "right" as const,
    padding: "2px 0",
  },
  buttonWrap: {
    textAlign: "center" as const,
    margin: "16px 0 0 0",
  },
  button: {
    backgroundColor: "#2563ff",
    color: "#ffffff",
    padding: "10px 20px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 600,
    textDecoration: "none",
    display: "inline-block",
  },
  link: {
    color: "#2563ff",
  },
  hr: {
    borderColor: "#d9e1ec",
    margin: "32px 0 16px 0",
  },
  footer: {
    fontSize: "12px",
    color: "#64748b",
    margin: "0 0 8px 0",
  },
};
