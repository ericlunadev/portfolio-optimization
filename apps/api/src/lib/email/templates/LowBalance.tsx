import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { emailMessages } from "../i18n.js";
import type { EmailLocale } from "../locale.js";

export interface LowBalanceProps {
  locale: EmailLocale;
  organizationName: string;
  /** The balance after the spend that crossed the threshold; negative under overdraft. */
  credits: number;
  topUpUrl: string;
  userName?: string | null;
}

export function LowBalance({
  locale,
  organizationName,
  credits,
  topUpUrl,
  userName,
}: LowBalanceProps) {
  const m = emailMessages[locale];
  return (
    <Html>
      <Head />
      <Preview>{m.lowBalanceSubject}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>{m.brand}</Text>
          <Section>
            <Heading style={styles.heading}>{m.lowBalanceHeading(userName)}</Heading>
            <Text style={styles.text}>{m.lowBalanceBody(organizationName)}</Text>
            <Text style={styles.balance}>{m.lowBalanceBalance(credits)}</Text>
            <Section style={styles.buttonWrap}>
              <Button href={topUpUrl} style={styles.button}>
                {m.lowBalanceButton}
              </Button>
            </Section>
            <Text style={styles.fallback}>{m.lowBalanceFallbackIntro}</Text>
            <Link href={topUpUrl} style={styles.link}>
              {topUpUrl}
            </Link>
          </Section>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>{m.lowBalanceFooter}</Text>
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
    margin: "0 0 12px 0",
  },
  balance: {
    fontSize: "15px",
    fontWeight: 600,
    lineHeight: 1.6,
    color: "#1c1917",
    margin: "0 0 24px 0",
  },
  buttonWrap: {
    textAlign: "center" as const,
    margin: "8px 0 24px 0",
  },
  button: {
    backgroundColor: "#c8a45c",
    color: "#1c1917",
    padding: "12px 24px",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: 600,
    textDecoration: "none",
    display: "inline-block",
  },
  fallback: {
    fontSize: "13px",
    color: "#78716c",
    margin: "16px 0 6px 0",
  },
  link: {
    fontSize: "13px",
    color: "#c8a45c",
    wordBreak: "break-all" as const,
  },
  hr: {
    borderColor: "#e7e5e4",
    margin: "32px 0 16px 0",
  },
  footer: {
    fontSize: "12px",
    color: "#a8a29e",
    margin: 0,
  },
};
