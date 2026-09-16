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
}: ScheduledReportProps) {
  const m = emailMessages[locale];

  return (
    <Html>
      <Head />
      <Preview>{m.scheduledSubject(scheduleName)}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>{m.brand}</Text>
          <Heading style={styles.heading}>{m.scheduledHeading(userName)}</Heading>
          <Text style={styles.text}>{m.scheduledIntro(entries.length)}</Text>
          <Text style={styles.note}>{m.scheduledWindowNote}</Text>

          {entries.map((entry) => (
            <Section key={entry.simulationId} style={styles.card}>
              <Text style={styles.cardTitle}>{entry.name}</Text>
              <Text style={styles.period}>
                {m.scheduledPeriod}: {entry.periodStart} – {entry.periodEnd}
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
                <Button href={entry.url} style={styles.button}>
                  {m.scheduledOpenSimulation}
                </Button>
              </Section>
            </Section>
          ))}

          {failedCount > 0 && <Text style={styles.note}>{m.scheduledRunFailed(failedCount)}</Text>}

          <Hr style={styles.hr} />
          <Text style={styles.footer}>{m.investingDisclaimer}</Text>
          <Text style={styles.footer}>
            {m.scheduledFooter}{" "}
            <Link href={manageUrl} style={styles.link}>
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
}

export function ScheduledNoCredits({
  locale,
  userName,
  pauseAfterAttempts,
  billingUrl,
  manageUrl,
}: ScheduledNoCreditsProps) {
  const m = emailMessages[locale];

  return (
    <Html>
      <Head />
      <Preview>{m.scheduledNoCreditsSubject}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>{m.brand}</Text>
          <Heading style={styles.heading}>{m.scheduledHeading(userName)}</Heading>
          <Text style={styles.text}>{m.scheduledNoCredits}</Text>
          <Text style={styles.text}>{m.scheduledPauseWarning(pauseAfterAttempts)}</Text>
          <Section style={styles.buttonWrap}>
            <Button href={billingUrl} style={styles.button}>
              {m.scheduledBuyCredits}
            </Button>
          </Section>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>
            {m.scheduledFooter}{" "}
            <Link href={manageUrl} style={styles.link}>
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
    backgroundColor: "#f5f5f4",
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
    border: "1px solid #e7e5e4",
  },
  brand: {
    fontSize: "12px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "#a8a29e",
    margin: "0 0 24px 0",
  },
  heading: {
    fontSize: "20px",
    fontWeight: 600,
    color: "#1c1917",
    margin: "0 0 16px 0",
    lineHeight: 1.3,
  },
  text: {
    fontSize: "15px",
    lineHeight: 1.6,
    color: "#44403c",
    margin: "0 0 16px 0",
  },
  note: {
    fontSize: "13px",
    lineHeight: 1.5,
    color: "#78716c",
    margin: "0 0 24px 0",
  },
  card: {
    border: "1px solid #e7e5e4",
    borderRadius: "10px",
    padding: "16px 18px",
    margin: "0 0 16px 0",
  },
  cardTitle: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#1c1917",
    margin: "0 0 2px 0",
  },
  period: {
    fontSize: "12px",
    color: "#78716c",
    margin: "0 0 12px 0",
  },
  metric: {
    verticalAlign: "top" as const,
    width: "33%",
  },
  metricLabel: {
    fontSize: "11px",
    color: "#78716c",
    margin: 0,
  },
  metricValue: {
    fontSize: "18px",
    fontWeight: 600,
    color: "#1c1917",
    margin: "2px 0 0 0",
  },
  metricDelta: {
    fontSize: "12px",
    color: "#57534e",
    margin: "2px 0 0 0",
  },
  caption: {
    fontSize: "11px",
    color: "#a8a29e",
    margin: "8px 0 12px 0",
  },
  subheading: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#44403c",
    margin: "0 0 4px 0",
  },
  weightTicker: {
    fontSize: "13px",
    color: "#44403c",
    padding: "2px 0",
  },
  weightValue: {
    fontSize: "13px",
    color: "#44403c",
    textAlign: "right" as const,
    padding: "2px 0",
  },
  buttonWrap: {
    textAlign: "center" as const,
    margin: "16px 0 0 0",
  },
  button: {
    backgroundColor: "#c8a45c",
    color: "#1c1917",
    padding: "10px 20px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 600,
    textDecoration: "none",
    display: "inline-block",
  },
  link: {
    color: "#c8a45c",
  },
  hr: {
    borderColor: "#e7e5e4",
    margin: "32px 0 16px 0",
  },
  footer: {
    fontSize: "12px",
    color: "#a8a29e",
    margin: "0 0 8px 0",
  },
};
