import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Home from "../page";

// `SessionRedirect` and `SiteFooter` are async Server Components, which
// react-dom cannot render in jsdom. They are covered by their own test files;
// here they are replaced by sync stand-ins so the page composition is testable.
vi.mock("@/app/_components/SessionRedirect", () => ({
  SessionRedirect: () => null,
}));
vi.mock("@/app/_components/SiteFooter", () => ({
  SiteFooter: () => <footer>VideoMax MBA</footer>,
}));

describe("Landing page", () => {
  it("renders every landing section for an unauthenticated visitor", () => {
    render(<Home />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /know what is inside your videos/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /how it works/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("exposes both entry points without requiring authentication", () => {
    render(<Home />);

    expect(
      screen.getByRole("link", { name: /create account/i }),
    ).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});
