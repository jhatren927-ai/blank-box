const ADULT =
  /\b(porn|porno|xxx|hentai|erotica|erotic|nsfw|nude|nudes|naked|softcore|hardcore|fetish|sex tape|adult film)\b/i

export function isAdultText(...parts: Array<string | undefined>): boolean {
  return parts.some((part) => !!part && ADULT.test(part))
}
