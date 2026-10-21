import type { FieldErrors } from "@/app/_lib/validation";

/**
 * The state the auth forms pass through `useActionState`.
 *
 * A successful action redirects instead of returning, so in practice the forms
 * only ever render the failure shape. `ok` still exists so the type reads
 * honestly and so a future caller can branch on it.
 */
export type AuthFormState = {
  ok: boolean;
  errors: FieldErrors;
  /**
   * What the user typed, echoed back so a rejected submit does not wipe the
   * form. React resets an uncontrolled `<form>` once its action settles, which
   * would otherwise clear every field the moment one of them is wrong.
   *
   * Passwords are deliberately absent: re-sending them to the browser would
   * put them in the RSC payload for no gain, since the user has to retype a
   * rejected password anyway.
   */
  values?: Record<string, string>;
};

export const initialAuthFormState: AuthFormState = { ok: false, errors: {} };

export function authFormErrors(
  errors: FieldErrors,
  values?: Record<string, string>,
): AuthFormState {
  return { ok: false, errors, values };
}

/** Reads a form field as a string, since `FormData` also yields `File`. */
export function formString(formData: FormData, field: string): string {
  const value = formData.get(field);

  return typeof value === "string" ? value : "";
}
