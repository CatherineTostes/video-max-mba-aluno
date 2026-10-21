"use client";

import { useActionState } from "react";

import { AuthField } from "@/app/_components/AuthField";
import {
  initialAuthFormState,
  type AuthFormState,
} from "@/app/_lib/auth/form-state";

type RegisterAction = (
  state: AuthFormState,
  formData: FormData,
) => Promise<AuthFormState>;

/**
 * The registration form.
 *
 * Takes the Server Action as a prop rather than importing it, so the page owns
 * the wiring and the form stays renderable on its own in tests.
 */
export function RegisterForm({ action }: { action: RegisterAction }) {
  const [state, formAction, pending] = useActionState(
    action,
    initialAuthFormState,
  );

  return (
    <form action={formAction} className="mt-8 space-y-5" noValidate>
      {state.errors._form ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {state.errors._form.join(" ")}
        </p>
      ) : null}

      <AuthField
        id="name"
        label="Full name"
        type="text"
        autoComplete="name"
        defaultValue={state.values?.name}
        errors={state.errors.name}
      />

      <AuthField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        errors={state.errors.email}
      />

      <AuthField
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters, including one letter and one number."
        errors={state.errors.password}
      />

      <AuthField
        id="passwordConfirmation"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        errors={state.errors.passwordConfirmation}
      />

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center rounded-md bg-accent px-7 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
