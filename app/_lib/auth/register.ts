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
import { hashPassword } from "@/app/_lib/password";
import { formatZodErrors, registerSchema } from "@/app/_lib/validation";

const DUPLICATE_EMAIL_MESSAGE =
  "An account with this email already exists — try logging in";

/** Postgres unique-violation, surfaced by Prisma as this code. */
const PRISMA_UNIQUE_VIOLATION = "P2002";

/**
 * Creates an account and signs the new user straight in.
 *
 * The PRD has no email-verification step, so registration ends in the same
 * place a successful login does: a session cookie and `/app`.
 */
export async function register(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  // Echoed back on failure so a rejected submit does not empty the form.
  const submitted = {
    name: formString(formData, "name"),
    email: formString(formData, "email"),
  };

  const parsed = registerSchema.safeParse({
    ...submitted,
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });

  if (!parsed.success) {
    return authFormErrors(formatZodErrors(parsed.error), submitted);
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    return authFormErrors({ email: [DUPLICATE_EMAIL_MESSAGE] }, submitted);
  }

  const passwordHash = await hashPassword(password);

  let sessionId: string;

  try {
    // One transaction so a failure part-way cannot leave an account that
    // nobody is signed in to.
    sessionId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name, email, passwordHash },
        select: { id: true },
      });

      return createSession(user.id, tx);
    });
  } catch (error) {
    // The uniqueness check above loses to a second request that registers the
    // same address in the gap before this insert. The index catches it; turn
    // that into the same message the check would have produced.
    if (isUniqueViolation(error)) {
      return authFormErrors({ email: [DUPLICATE_EMAIL_MESSAGE] }, submitted);
    }

    throw error;
  }

  await setSessionCookie(sessionId);

  // Outside the try/catch on purpose: `redirect` signals by throwing, and
  // catching it here would swallow the navigation.
  redirect("/app");
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === PRISMA_UNIQUE_VIOLATION
  );
}
