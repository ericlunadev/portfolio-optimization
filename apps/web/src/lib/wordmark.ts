/**
 * The two-tone wordmark in the sidebar and the phone header, derived from a
 * tenant's product name and optional short name.
 *
 * **The product name is shown once, and it is the source of truth.** A tenant
 * configures a product name ("Acme Portfolio Lab") and, optionally, a short name
 * ("Acme"). Rendering the short name in the accent colour and then the whole
 * product name after it printed the name twice — "Acme Acme Portfolio Lab" — so
 * the short name no longer adds words of its own. It only decides where the
 * accent ends:
 *
 *   1. **It leads the product name** (word for word, ignoring case): those
 *      words are the accent, the remaining words follow in the foreground.
 *      "Acme" + "Acme Portfolio Lab" → **Acme** Portfolio Lab. The words are
 *      the product name's own, so its casing wins over the short name's.
 *   2. **It abbreviates the product name's first word** — one word ending in a
 *      period whose stem starts that word, and more words follow: the
 *      abbreviation stands in for that word. Lowercase words right after it
 *      are the particles joining it to the rest ("de", "of", "for") and go with
 *      it, as long as a capitalised word follows; with none to tell particles
 *      from content, nothing is dropped. "Optim." + "Optimización de
 *      Portafolio" → **Optim.** Portafolio, the default tenant's wordmark as it
 *      was before whitelabel.
 *   3. **Anything else** — no short name, or one unrelated to the product name —
 *      makes the whole product name the accent. No split is invented: picking a
 *      word to highlight the tenant never chose would be the surprise.
 *
 * The casing test in rule 2 reads the name as the tenant typed it, so it holds
 * in any language that capitalises names; a name typed in sentence case simply
 * keeps its particles.
 */

export interface Wordmark {
  /** Rendered in the accent. Empty only when there is no name at all. */
  accent: string;
  /** Rendered after it in the foreground colour. Often empty. */
  rest: string;
}

function wordsOf(value: string | null | undefined): string[] {
  return (value ?? "").trim().split(/\s+/).filter(Boolean);
}

function sameWord(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}

/** A lowercase letter in any script: it has an uppercase form and is not it. */
function startsLowercase(word: string): boolean {
  const first = word.charAt(0);
  return first !== first.toUpperCase() && first === first.toLowerCase();
}

/** Minimum stem length for rule 2, so "A." does not count as abbreviating "Acme". */
const MIN_ABBREVIATION_STEM = 2;

function abbreviates(short: string, word: string): boolean {
  if (!short.endsWith(".")) return false;
  const stem = short.replace(/\.+$/, "");
  return (
    stem.length >= MIN_ABBREVIATION_STEM &&
    stem.length < word.length &&
    word.slice(0, stem.length).localeCompare(stem, undefined, { sensitivity: "accent" }) === 0
  );
}

/** Drops the lowercase particles in front of the first capitalised word, if there is one. */
function withoutLeadingParticles(words: string[]): string[] {
  const firstContent = words.findIndex((word) => !startsLowercase(word));
  return firstContent > 0 ? words.slice(firstContent) : words;
}

export function wordmark(
  productName: string | null | undefined,
  shortName: string | null | undefined
): Wordmark {
  const name = wordsOf(productName);
  const short = wordsOf(shortName);

  if (name.length === 0) return { accent: short.join(" "), rest: "" };

  // Rule 1: the short name is the product name's leading words.
  if (short.length > 0 && short.length <= name.length && short.every((word, i) => sameWord(word, name[i]))) {
    return { accent: name.slice(0, short.length).join(" "), rest: name.slice(short.length).join(" ") };
  }

  // Rule 2: the short name abbreviates the first word, and something follows it.
  if (short.length === 1 && name.length > 1 && abbreviates(short[0], name[0])) {
    return { accent: short[0], rest: withoutLeadingParticles(name.slice(1)).join(" ") };
  }

  // Rule 3.
  return { accent: name.join(" "), rest: "" };
}
