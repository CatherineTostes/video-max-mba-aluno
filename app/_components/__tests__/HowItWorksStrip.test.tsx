import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HowItWorksStrip } from "../HowItWorksStrip";

describe("HowItWorksStrip", () => {
  it("renders upload, transcribe and summarize in order", () => {
    render(<HowItWorksStrip />);

    const steps = screen.getAllByRole("listitem");

    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent(/upload/i);
    expect(steps[1]).toHaveTextContent(/transcribe/i);
    expect(steps[2]).toHaveTextContent(/summarize/i);
  });
});
