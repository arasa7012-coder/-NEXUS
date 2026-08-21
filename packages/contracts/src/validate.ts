/**
 * Minimal runtime validation.
 *
 * Why not Zod: the repository already depends on Zod v4 and it remains the
 * right choice at the API edge. It cannot be installed in this environment,
 * and writing contracts that cannot be executed would leave the most
 * safety-critical layer unverified. These combinators are ~150 lines, have no
 * dependencies, and let every contract below be *tested now*.
 *
 * They are deliberately shaped like Zod (`.parse` / `.safeParse`) so that
 * swapping in Zod at the API boundary is a mechanical change confined to this
 * file, not a rewrite of every contract.
 *
 * Scope: structural validation only. Business rules belong in @nexus/core.
 */

export interface Issue {
  path: string;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

export class ValidationError extends Error {
  readonly issues: Issue[];

  constructor(issues: Issue[]) {
    super(issues.map((i) => `${i.path || "<root>"}: ${i.message}`).join("; "));
    this.issues = issues;
    this.name = "ValidationError";
  }
}

export interface Validator<T> {
  readonly check: (input: unknown, path: string) => Result<T>;
  safeParse: (input: unknown) => Result<T>;
  parse: (input: unknown) => T;
}

function make<T>(check: (input: unknown, path: string) => Result<T>): Validator<T> {
  return {
    check,
    safeParse: (input) => check(input, ""),
    parse: (input) => {
      const r = check(input, "");
      if (!r.ok) throw new ValidationError(r.issues);
      return r.value;
    },
  };
}

const fail = (path: string, message: string): Result<never> => ({ ok: false, issues: [{ path, message }] });
const pass = <T>(value: T): Result<T> => ({ ok: true, value });

// --- scalars ---------------------------------------------------------------

export const str = (opts: { min?: number; max?: number; pattern?: RegExp } = {}): Validator<string> =>
  make((input, path) => {
    if (typeof input !== "string") return fail(path, "expected a string");
    if (opts.min !== undefined && input.length < opts.min) return fail(path, `expected at least ${opts.min} characters`);
    if (opts.max !== undefined && input.length > opts.max) return fail(path, `expected at most ${opts.max} characters`);
    if (opts.pattern && !opts.pattern.test(input)) return fail(path, "did not match the required format");
    return pass(input);
  });

export const num = (opts: { min?: number; max?: number; int?: boolean } = {}): Validator<number> =>
  make((input, path) => {
    if (typeof input !== "number" || !Number.isFinite(input)) return fail(path, "expected a finite number");
    if (opts.int && !Number.isInteger(input)) return fail(path, "expected a whole number");
    if (opts.min !== undefined && input < opts.min) return fail(path, `expected a value of at least ${opts.min}`);
    if (opts.max !== undefined && input > opts.max) return fail(path, `expected a value of at most ${opts.max}`);
    return pass(input);
  });

export const bool = (): Validator<boolean> =>
  make((input, path) => (typeof input === "boolean" ? pass(input) : fail(path, "expected a boolean")));

/** Epoch milliseconds. Rejects the pre-2001 range that signals seconds-vs-ms confusion. */
export const epochMs = (): Validator<number> =>
  make((input, path) => {
    if (typeof input !== "number" || !Number.isInteger(input)) return fail(path, "expected epoch milliseconds");
    if (input < 978_307_200_000) return fail(path, "timestamp is implausibly early — seconds may have been sent as milliseconds");
    return pass(input);
  });

export const literal = <const T extends string>(value: T): Validator<T> =>
  make((input, path) => (input === value ? pass(value) : fail(path, `expected "${value}"`)));

export const enumOf = <const T extends readonly string[]>(values: T): Validator<T[number]> =>
  make((input, path) =>
    typeof input === "string" && (values as readonly string[]).includes(input)
      ? pass(input as T[number])
      : fail(path, `expected one of: ${values.join(", ")}`),
  );

// --- combinators -----------------------------------------------------------

export const nullable = <T>(inner: Validator<T>): Validator<T | null> =>
  make((input, path) => (input === null ? pass(null) : inner.check(input, path)));

export const optional = <T>(inner: Validator<T>): Validator<T | undefined> =>
  make((input, path) => (input === undefined ? pass(undefined) : inner.check(input, path)));

export const arrayOf = <T>(inner: Validator<T>, opts: { max?: number } = {}): Validator<T[]> =>
  make((input, path) => {
    if (!Array.isArray(input)) return fail(path, "expected an array");
    if (opts.max !== undefined && input.length > opts.max) return fail(path, `expected at most ${opts.max} items`);
    const out: T[] = [];
    const issues: Issue[] = [];
    input.forEach((item, i) => {
      const r = inner.check(item, `${path}[${i}]`);
      if (r.ok) out.push(r.value);
      else issues.push(...r.issues);
    });
    return issues.length ? { ok: false, issues } : pass(out);
  });

type Shape = Record<string, Validator<unknown>>;
type Infer<S extends Shape> = { [K in keyof S]: S[K] extends Validator<infer T> ? T : never };

export const object = <S extends Shape>(shape: S): Validator<Infer<S>> =>
  make((input, path) => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return fail(path, "expected an object");
    }
    const record = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const issues: Issue[] = [];
    for (const key of Object.keys(shape)) {
      const validator = shape[key]!;
      const r = validator.check(record[key], path ? `${path}.${key}` : key);
      if (r.ok) {
        if (r.value !== undefined) out[key] = r.value;
      } else {
        issues.push(...r.issues);
      }
    }
    return issues.length ? { ok: false, issues } : pass(out as Infer<S>);
  });

/** Discriminated union — the shape the event and error contracts rely on. */
export const variant = <K extends string, M extends Record<string, Validator<unknown>>>(
  key: K,
  map: M,
): Validator<{ [T in keyof M]: M[T] extends Validator<infer V> ? V : never }[keyof M]> =>
  make((input, path) => {
    if (typeof input !== "object" || input === null) return fail(path, "expected an object");
    const tag = (input as Record<string, unknown>)[key];
    if (typeof tag !== "string" || !(tag in map)) {
      return fail(path ? `${path}.${key}` : key, `expected one of: ${Object.keys(map).join(", ")}`);
    }
    return map[tag]!.check(input, path) as Result<never>;
  });

export type { Infer };
