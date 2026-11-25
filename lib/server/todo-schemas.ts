// Input schemas for the to-do API (row 5, row 8). Strict: any field not listed gives 400 (AC28, AC29).
import { z } from "zod";

export const TITLE_MIN = 1;
export const TITLE_MAX = 200;

/** Code points, as Postgres char_length counts them (not UTF-16 units). */
export function codePointLength(s: string): number {
  return [...s].length;
}

// JS trim() removes exactly the whitespace set the DB check todos_title_trimmed uses (specs/3/schema.md 1).
// U+0000 can't be stored in Postgres text and lone surrogates can't be encoded for it: both are 400, never 500 (T5).
export const titleSchema = z
  .string()
  .trim()
  .refine((s) => {
    const n = codePointLength(s);
    return n >= TITLE_MIN && n <= TITLE_MAX;
  })
  .refine((s) => !s.includes("\u0000") && s.isWellFormed());

export const createTodoSchema = z.strictObject({ title: titleSchema });

export const updateTodoSchema = z
  .strictObject({ title: titleSchema.optional(), done: z.boolean().optional() })
  .refine((v) => v.title !== undefined || v.done !== undefined);

// Any 8-4-4-4-12 hex id, as Postgres uuid accepts it, so a well-formed id that doesn't exist (or isn't yours)
// is 404, not 400. z.uuid() would also demand RFC version/variant bits.
export const todoIdSchema = z.guid();

export const TODO_COLUMNS = "id, title, done, created_at";
