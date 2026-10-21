import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { logout } from "@/app/_lib/auth/logout";
import { LogoutButton } from "../LogoutButton";

vi.mock("@/app/_lib/auth/logout", () => ({ logout: vi.fn() }));

const logoutMock = vi.mocked(logout);

describe("LogoutButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a submit button labelled Log out", () => {
    render(<LogoutButton />);

    expect(
      screen.getByRole("button", { name: "Log out" }),
    ).toHaveAttribute("type", "submit");
  });

  it("wraps the button in a form so it works without JavaScript", () => {
    render(<LogoutButton />);

    expect(
      screen.getByRole("button", { name: "Log out" }).closest("form"),
    ).not.toBeNull();
  });

  it("invokes the logout Server Action on submit", async () => {
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => expect(logoutMock).toHaveBeenCalledOnce());
  });

  it("lets a caller restyle it for whatever chrome it lands in", () => {
    render(<LogoutButton className="custom-logout" />);

    expect(screen.getByRole("button", { name: "Log out" })).toHaveClass(
      "custom-logout",
    );
  });
});
