import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteFooter } from "../SiteFooter";

describe("SiteFooter", () => {
  it("renders a contentinfo landmark with the product name", async () => {
    render(await SiteFooter());

    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getAllByText(/videomax mba/i).length).toBeGreaterThan(0);
  });

  it("shows the current year", async () => {
    render(await SiteFooter());

    expect(
      screen.getByText(new RegExp(String(new Date().getFullYear()))),
    ).toBeInTheDocument();
  });
});
