import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Hero } from "../Hero";

describe("Hero", () => {
  it("renders the product name and the value proposition", () => {
    render(<Hero />);

    expect(screen.getByText("VideoMax MBA")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /know what is inside your videos/i }),
    ).toBeInTheDocument();
  });

  it("points the create account CTA at /register", () => {
    render(<Hero />);

    expect(
      screen.getByRole("link", { name: /create account/i }),
    ).toHaveAttribute("href", "/register");
  });

  it("styles the CTA with the accent color", () => {
    render(<Hero />);

    expect(
      screen.getByRole("link", { name: /create account/i }).className,
    ).toMatch(/\bbg-accent\b/);
  });
});
