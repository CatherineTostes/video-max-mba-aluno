"use server";

import { redirect } from "next/navigation";

import {
  authFormErrors,
  formString,
  type AuthFormState,
} from "@/app/_lib/auth/form-state";
import { createSession } from "@/app/_lib/auth/session-store";
import { setSessionCookie } from "@/app/_lib/cookies";
import { prisma } from "@/app/_lib/db";
import { DUMMY_HASH, verifyPassword } from "@/app/_lib/password";
import { FORM_ERROR_KEY, loginSchema } from "@/app/_lib/validation";

/**
 * The only failure message this action ever produces.
 *
 * Unknown email, wrong password, suspended account and malformed input all
 * return it verbatim. Naming which one was wrong would turn the login form
 * into an oracle for "does this person have an account here?".
 */
const INVALID_CREDENTIALS = "Invalid email or password";

function invalidCredentials(email: string): AuthFormState {
  return authFormErrors({ [FORM_ERROR_KEY]: [INVALID_CREDENTIALS] }, { email });
}

export async function login(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const submittedEmail = formString(formData, "email");

  const parsed = loginSchema.safeParse({
    email: submittedEmail,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return invalidCredentials(submittedEmail);
  }

  const email = parsed.data.email.trim().toLowerCase();
  const { password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, isSuspended: true },
  });

  if (!user) {
    // Spend the same ~250ms a real bcrypt comparison costs, so response time
    // does not reveal whether the address is registered.
    await verifyPassword(password, DUMMY_HASH);
    return invalidCredentials(submittedEmail);
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches || user.isSuspended) {
    return invalidCredentials(submittedEmail);
  }

  const sessionId = await createSession(user.id);
  await setSessionCookie(sessionId);

  redirect("/app");
}
