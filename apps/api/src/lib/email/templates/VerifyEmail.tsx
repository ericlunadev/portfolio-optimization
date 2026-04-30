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
}

export function VerifyEmail({ url, locale, userName }: VerifyEmailProps) {
  const m = emailMessages[locale];
  return (
    <Html>
      <Head />
      <Preview>{m.verifySubject}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>{m.brand}</Text>
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
