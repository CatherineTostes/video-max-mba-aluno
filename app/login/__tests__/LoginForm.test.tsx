import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AuthFormState } from "@/app/_lib/auth/form-state";
import { LoginForm } from "../LoginForm";

const noErrors: AuthFormState = { ok: false, errors: {} };

const invalidCredentials: AuthFormState = {
  ok: false,
  errors: { _form: ["Invalid email or password"] },
};

function actionReturning(state: AuthFormState) {
  return vi.fn(async () => state);
}

async function submit() {
  fireEvent.click(screen.getByRole("button", { name: /log in/i }));
}

describe("LoginForm", () => {
  it("renders email and password fields", () => {
    render(<LoginForm action={actionReturning(noErrors)} />);

    expect(screen.getByLabelText("Email")).toHaveAttribute("name", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "name",
      "password",
    );
  });

  it("submits to the action it was handed", async () => {
    const action = actionReturning(noErrors);
    render(<LoginForm action={action} />);

    await submit();

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
  });

  it("shows the generic failure at the top of the form", async () => {
    render(<LoginForm action={actionReturning(invalidCredentials)} />);

    await submit();

    const alert = await screen.findByRole("alert");

    expect(alert).toHaveTextContent("Invalid email or password");
  });

  it("never marks the email or password field as the one at fault", async () => {
    render(<LoginForm action={actionReturning(invalidCredentials)} />);

    await submit();

    await screen.findByRole("alert");

    // A per-field error would tell an attacker which half they got right.
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Password")).not.toHaveAttribute(
      "aria-invalid",
    );
  });

  it("keeps the email but not the password when the submit is rejected", async () => {
    render(
      <LoginForm
        action={actionReturning({
          ...invalidCredentials,
          values: { email: "ada@example.com" },
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong-password9" },
    });

    await submit();
    await screen.findByRole("alert");

    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  it("styles the submit button with the F01 accent", () => {
    render(<LoginForm action={actionReturning(noErrors)} />);

    expect(screen.getByRole("button", { name: "Log in" }).className).toMatch(
      /\bbg-accent\b/,
    );
  });
});
