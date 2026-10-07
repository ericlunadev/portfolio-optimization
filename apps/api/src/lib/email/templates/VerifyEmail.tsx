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

export interface VerifyEmailProps {
  url: string;
  locale: EmailLocale;
  userName?: string | null;
  /** The tenant's product name (lib/email/tenant.ts). Falls back to our own when absent. */
  productName?: string | null;
}

export function VerifyEmail({ url, locale, userName, productName }: VerifyEmailProps) {
  const m = emailMessages[locale];
  return (
    <Html>
      <Head />
      <Preview>{m.verifySubject}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>{productName || m.brand}</Text>
          <Section>
            <Heading style={styles.heading}>{m.verifyHeading(userName)}</Heading>
            <Text style={styles.text}>{m.verifyBody}</Text>
            <Section style={styles.buttonWrap}>
              <Button href={url} style={styles.button}>
                {m.verifyButton}
              </Button>
            </Section>
            <Text style={styles.fallback}>{m.verifyFallbackIntro}</Text>
            <Link href={url} style={styles.link}>
              {url}
            </Link>
          </Section>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>{m.verifyFooter}</Text>
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
    margin: "0 0 24px 0",
  },
  buttonWrap: {
    textAlign: "center" as const,
    margin: "8px 0 24px 0",
  },
  button: {
    backgroundColor: "#2563ff",
    color: "#ffffff",
    padding: "12px 24px",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: 600,
    textDecoration: "none",
    display: "inline-block",
  },
  fallback: {
    fontSize: "13px",
    color: "#52607a",
    margin: "16px 0 6px 0",
  },
  link: {
    fontSize: "13px",
    color: "#2563ff",
    wordBreak: "break-all" as const,
  },
  hr: {
    borderColor: "#d9e1ec",
    margin: "32px 0 16px 0",
  },
  footer: {
    fontSize: "12px",
    color: "#64748b",
    margin: 0,
  },
};
