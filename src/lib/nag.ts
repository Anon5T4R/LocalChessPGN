/** Símbolos dos NAGs mais comuns (o resto vira "$N" — não é chave de i18n,
 *  os glifos de anotação de xadrez são universais). */
const NAG_GLYPH: Record<number, string> = {
  1: "!",
  2: "?",
  3: "!!",
  4: "??",
  5: "!?",
  6: "?!",
};

export function nagGlyph(nag: number): string {
  return NAG_GLYPH[nag] ?? `$${nag}`;
}
