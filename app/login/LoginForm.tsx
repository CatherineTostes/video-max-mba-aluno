"use client";

import { useActionState } from "react";

import { AuthField } from "@/app/_components/AuthField";
import {
  initialAuthFormState,
  type AuthFormState,
} from "@/app/_lib/auth/form-state";

type LoginAction = (
  state: AuthFormState,
  formData: FormData,
) => Promise<AuthFormState>;

/**
 * The login form.
 *
 * Every failure renders as one message above the form. Nothing is ever
 * attached to the email or password field individually — a per-field error
 * would tell an attacker which half they got right.
 */
export function LoginForm({ action }: { action: LoginAction }) {
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
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
      />

      <AuthField
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
      />

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center rounded-md bg-accent px-7 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
