import { z } from "zod";

/**
 * Shared validation schemas for the auth forms.
 *
 * The messages here are user-facing: they are what `useActionState` renders
 * beneath each field, so they are phrased as the PRD specifies them rather
 * than as developer-facing validation text.
 */

/** Key used for errors that belong to the form as a whole, not to one field. */
export const FORM_ERROR_KEY = "_form";

/** Field-keyed error map consumed by the forms via `useActionState`. */
export type FieldErrors = Record<string, string[]>;

const email = z
  .email("Enter a valid email address")
  .max(255, "Email must be at most 255 characters")
  // Stored and looked up lowercased so `Ada@Example.com` and `ada@example.com`
  // cannot become two accounts.
  .transform((value) => value.toLowerCase());

export const registerSchema = z
  .object({
    name: z
      .string("Name is required")
      .trim()
      .min(1, "Name is required")
      .max(120, "Name must be at most 120 characters"),
    email,
    password: z
      .string("Password is required")
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Za-z]/, "Password must contain at least one letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    passwordConfirmation: z.string("Please confirm your password"),
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    error: "Passwords do not match",
    path: ["passwordConfirmation"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Login validation is deliberately thin. Anything malformed gets the same
 * generic "Invalid email or password" the action returns for a wrong password,
 * so the schema only needs to tell valid from invalid — never which field or
 * why.
 */
export const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Turns a `ZodError` into the `{ field: [messages] }` shape the forms render.
 * Issues that are not attached to a field land under {@link FORM_ERROR_KEY}.
 */
export function formatZodErrors(
  error: z.ZodError<Record<string, unknown>>,
): FieldErrors {
  const { formErrors, fieldErrors } = z.flattenError(error);

  const errors: FieldErrors = {};

  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (messages && messages.length > 0) {
      errors[field] = messages;
    }
  }

  if (formErrors.length > 0) {
    errors[FORM_ERROR_KEY] = formErrors;
  }

  return errors;
}
