/**
 * The member's own identity fields — shared by the Server Action that writes
 * them and the client that edits them.
 *
 * `profiles.name` carries no CHECK, so this cap is enforced in `updateName`
 * rather than by the database. It lives here so the input's `maxLength` and the
 * action's refusal are the same number: two copies of a limit drift, and the
 * failure mode is a field that lets you type what the server will reject.
 */

/** Long enough for a kunya, short enough to stay on one line of a roster row. */
export const MAX_NAME_LENGTH = 60;
