/**
 * A task's subtitle is FREE TEXT, and the app does not know what is in it.
 *
 * All three screens that render one used to hard-code `dir="rtl" lang="ar"`, on
 * the assumption that a subtitle is the Arabic of the dhikr. That assumption was
 * wrong in both directions, and both were visible on the seeded fixture:
 *
 *   - It is wrong for TRANSLITERATION, which is what the field is mostly used
 *     for. "Allahumma salli ala Muhammad" is Latin script, and `dir="rtl"` shunts
 *     it to the right edge of its column and reorders trailing punctuation.
 *   - It is wrong for anything the owner actually types. A circle here uses the
 *     subtitle for a lecture's URL; under `dir="rtl"` a URL is laid out
 *     right-to-left around its neutral characters, so `?list=` visibly detaches
 *     and lands in the wrong place. Announcing that URL to a screen reader as
 *     Arabic (`lang="ar"`) is the same error one layer down.
 *
 * D17 is the reason this is not a one-off: the trackable item is a generic
 * `task`, not a "dhikr", so nothing about the field is guaranteed to be Arabic.
 *
 * The direction half needs no helper — `dir="auto"` is the HTML feature for
 * exactly this, resolving from the first strong directional character, so Arabic
 * still renders RTL and Latin and URLs render LTR. Only `lang` needs a decision,
 * because there is no `lang="auto"`.
 */

/**
 * Deliberately a SCRIPT test and not a language one: `lang="ar"` drives font
 * selection and screen-reader pronunciation, and both follow the script rather
 * than the language. Urdu and Persian are Arabic-script too, and rendering them
 * with an Arabic-capable font is right even though "ar" is not their language.
 *
 * `\p{Script=Arabic}` rather than a hand-written code-point range: the ranges
 * are not contiguous (Supplement, Extended-A/B, the two presentation-form
 * blocks) and a range list written out by hand is a thing that silently misses
 * a block. The engine already knows the answer.
 */
const ARABIC_SCRIPT = /\p{Script=Arabic}/u;

/** Does this text actually contain Arabic script? */
export function hasArabicScript(text: string): boolean {
  return ARABIC_SCRIPT.test(text);
}

/**
 * The `lang` for a piece of user-supplied text — `"ar"` only when it really is
 * Arabic, otherwise `undefined` so the element simply inherits the page's.
 * Returning `undefined` rather than `"en"` is deliberate: the alternative to
 * Arabic here is "unknown", and claiming English would be the same kind of
 * guess this module exists to stop making.
 */
export function langOf(text: string): "ar" | undefined {
  return hasArabicScript(text) ? "ar" : undefined;
}
