import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteHeader } from "../SiteHeader";

describe("SiteHeader", () => {
  it("renders the product wordmark inside a banner landmark", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByText(/videomax/i)).toBeInTheDocument();
  });

  it("points the log in link at /login", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("gives the log in link a visible focus ring", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("link", { name: /log in/i }).className).toMatch(
      /focus-visible:outline-accent/,
    );
  });
});
