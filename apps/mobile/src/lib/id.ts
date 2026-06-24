/**
 * Generates an RFC-4122-ish v4 UUID for use as an idempotency key. React
 * Native lacks a guaranteed `crypto.randomUUID`, so we build one from
 * `Math.random`. This is not a security primitive — it only needs to be
 * collision-free enough to dedupe a single user's billing requests.
 */
export function randomId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}
