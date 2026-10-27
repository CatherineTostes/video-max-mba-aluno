import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { UploadItem } from "@/app/_lib/videos/uploadQueue";
import { UploadProgressCard } from "../UploadProgressCard";

const MB = 1024 * 1024;

function item(overrides: Partial<UploadItem> = {}): UploadItem {
  return {
    id: "item-1",
    fileName: "morning-standup.mp4",
    totalBytes: 500 * MB,
    loadedBytes: 0,
    status: "queued",
    ...overrides,
  };
}

function renderCard(overrides: Partial<UploadItem> = {}) {
  const handlers = { onCancel: vi.fn(), onRetry: vi.fn(), onDismiss: vi.fn() };

  render(<UploadProgressCard item={item(overrides)} {...handlers} />);

  return handlers;
}

describe("UploadProgressCard", () => {
  it("shows the filename, bytes transferred of total, and the percentage", () => {
    renderCard({ status: "uploading", loadedBytes: 210 * MB });

    expect(screen.getByText("morning-standup.mp4")).toBeInTheDocument();
    expect(screen.getByText("210 MB of 500 MB · 42%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "42",
    );
  });

  it("offers Cancel while uploading", () => {
    const { onCancel } = renderCard({ status: "uploading" });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledWith("item-1");
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
  });

  it("shows a waiting item's total size and lets it be cancelled", () => {
    renderCard({ status: "queued" });

    expect(screen.getByText("Waiting to upload · 500 MB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows 100% while the server finishes processing, with no Cancel", () => {
    renderCard({ status: "processing", loadedBytes: 500 * MB });

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    expect(screen.getByText(/generating thumbnail/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });

  it("shows the code-specific message and a Retry button on failure", () => {
    const { onRetry, onDismiss } = renderCard({
      status: "failed",
      error: { code: "UPL_INCOMPLETE", message: "Upload interrupted — retry" },
    });

    expect(screen.getByText("Upload interrupted — retry")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(onRetry).toHaveBeenCalledWith("item-1");
    expect(onDismiss).toHaveBeenCalledWith("item-1");
  });

  it("shows the disk-failure message from the PRD", () => {
    renderCard({
      status: "failed",
      error: {
        code: "UPL_DISK_WRITE",
        message: "Upload failed — please try again",
      },
    });

    expect(
      screen.getByText("Upload failed — please try again"),
    ).toBeInTheDocument();
  });

  it("shows a done state with the thumbnail and no actions", () => {
    const { container } = render(
      <UploadProgressCard
        item={item({
          status: "done",
          loadedBytes: 500 * MB,
          video: {
            id: "clv1",
            title: "morning-standup",
            description: "",
            originalFilename: "morning-standup.mp4",
            sizeBytes: 500 * MB,
            durationSeconds: 12,
            containerFormat: "mp4",
            status: "validating",
            thumbnailUrl: "/api/videos/clv1/thumbnail",
            hasCustomThumbnail: true,
            createdAt: "2026-10-21T00:00:00.000Z",
          },
        })}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText(/Uploaded · 500 MB/)).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/api/videos/clv1/thumbnail",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a cancelled state that can be dismissed", () => {
    renderCard({ status: "cancelled" });

    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });
});
