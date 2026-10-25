/** Characters kept of an error message, after scrubbing (analytics and the diagnostics log). */
export const MESSAGE_LENGTH = 120;

const IDENTIFIER = /^'[A-Za-z_$][\w$]*'$|^"[A-Za-z_$][\w$]*"$/;

/**
 * An error message without what could identify a player or their device: addresses, file paths
 * and quoted text become placeholders, digits become `#`, and the result is cut to `length`
 * characters. Quoted single identifiers, such as the property in "reading 'skills'", stay.
 * Shared by analytics (docs/ANALYTICS.md) and the local diagnostics log (release 1.0 step 4.7).
 */
export function scrubMessage(message: unknown, length = MESSAGE_LENGTH): string {
  return String(message ?? '')
    .replace(/\b[a-z][\w+.-]*:\/\/\S*/gi, '<url>')
    .replace(/(['"`])(?:(?!\1).)*\1/g, (quoted) => (IDENTIFIER.test(quoted) ? quoted : '<text>'))
    .replace(/(?:[A-Za-z]:)?(?:[\\/][\w.@~-]+){2,}[\\/]?/g, '<path>')
    .replace(/\S+@\S+\.\w+/g, '<email>')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, length);
}
