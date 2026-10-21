import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AuthFormState } from "@/app/_lib/auth/form-state";
import { RegisterForm } from "../RegisterForm";

const noErrors: AuthFormState = { ok: false, errors: {} };

/** Stands in for the `register` Server Action the page normally passes in. */
function actionReturning(state: AuthFormState) {
  // The signature is declared rather than inferred so `mock.calls` stays
  // typed even though the stub ignores both arguments.
  return vi.fn<
    (previous: AuthFormState, data: FormData) => Promise<AuthFormState>
  >(async () => state);
}

async function submit() {
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));
}

describe("RegisterForm", () => {
  it("renders name, email, password, and confirmation fields", () => {
    render(<RegisterForm action={actionReturning(noErrors)} />);

    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
  });

  it("names the inputs so the Server Action can read them off FormData", () => {
    render(<RegisterForm action={actionReturning(noErrors)} />);

    expect(screen.getByLabelText("Full name")).toHaveAttribute("name", "name");
    expect(screen.getByLabelText("Email")).toHaveAttribute("name", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "name",
      "password",
    );
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute(
      "name",
      "passwordConfirmation",
    );
  });

  it("spells out the password rules before the user gets them wrong", () => {
    render(<RegisterForm action={actionReturning(noErrors)} />);

    expect(
      screen.getByText(/at least 8 characters, including one letter/i),
    ).toBeInTheDocument();
  });

  it("styles the submit button with the F01 accent", () => {
    render(<RegisterForm action={actionReturning(noErrors)} />);

    expect(
      screen.getByRole("button", { name: "Create account" }).className,
    ).toMatch(/\bbg-accent\b/);
  });

  it("shows nothing wrong before the form has been submitted", () => {
    render(<RegisterForm action={actionReturning(noErrors)} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Password")).not.toHaveAttribute(
      "aria-invalid",
    );
  });

  it("submits to the action it was handed", async () => {
    const action = actionReturning(noErrors);
    render(<RegisterForm action={action} />);

    await submit();

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action.mock.calls[0]![1]).toBeInstanceOf(FormData);
  });

  it("renders a password rule failure beneath the password input", async () => {
    render(
      <RegisterForm
        action={actionReturning({
          ok: false,
          errors: { password: ["Password must contain at least one number"] },
        })}
      />,
    );

    await submit();

    const message = await screen.findByText(
      "Password must contain at least one number",
    );
    const input = screen.getByLabelText("Password");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain(
      message.closest("ul")!.id,
    );
  });

  it("renders a duplicate-email error beneath the email input", async () => {
    render(
      <RegisterForm
        action={actionReturning({
          ok: false,
          errors: {
            email: ["An account with this email already exists — try logging in"],
          },
        })}
      />,
    );

    await submit();

    expect(
      await screen.findByText(
        "An account with this email already exists — try logging in",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("keeps what the user typed when the submit is rejected", async () => {
    // React resets an uncontrolled form once its action settles. Without the
    // echoed-back values, one bad password would clear the whole form and make
    // the user retype their name and email.
    render(
      <RegisterForm
        action={actionReturning({
          ok: false,
          errors: { password: ["Password must contain at least one number"] },
          values: { name: "Ada Lovelace", email: "ada@example.com" },
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "abcdefgh" },
    });

    await submit();
    await screen.findByText("Password must contain at least one number");

    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
    // The password is deliberately not echoed back through the RSC payload.
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  it("renders a mismatched confirmation beneath the confirmation input", async () => {
    render(
      <RegisterForm
        action={actionReturning({
          ok: false,
          errors: { passwordConfirmation: ["Passwords do not match"] },
        })}
      />,
    );

    await submit();

    expect(
      await screen.findByText("Passwords do not match"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).not.toHaveAttribute(
      "aria-invalid",
    );
  });
});
