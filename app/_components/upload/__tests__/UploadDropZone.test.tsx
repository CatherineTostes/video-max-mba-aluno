import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_MAX_VIDEO_BYTES } from "@/app/_lib/videos/constants";
import { UploadDropZone } from "../UploadDropZone";

const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn() }));

vi.mock("../useUploadQueue", () => ({
  useUploadQueue: () => ({
    items: [],
    enqueue: enqueueMock,
    cancel: vi.fn(),
    retry: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

function videoFile(name: string, size = 1024) {
  return new File([new Uint8Array(Math.min(size, 1024))], name, {
    type: "video/mp4",
  });
}

/** A File whose reported size is `size` without allocating that much. */
function sizedFile(name: string, size: number) {
  const file = videoFile(name);
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function drop(files: File[]) {
  fireEvent.drop(screen.getByTestId("upload-drop-zone"), {
    dataTransfer: { files, types: ["Files"] },
  });
}

beforeEach(() => {
  enqueueMock.mockClear();
});

describe("UploadDropZone", () => {
  it("renders a drop area and an Upload video button", () => {
    render(<UploadDropZone />);

    expect(screen.getByTestId("upload-drop-zone")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Drag and drop videos here" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload video" }),
    ).toBeInTheDocument();
  });

  it("enqueues a valid file dropped on it, without a warning", () => {
    render(<UploadDropZone />);
    const clip = videoFile("clip.mp4");

    drop([clip]);

    expect(enqueueMock).toHaveBeenCalledWith([clip]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rejects an unsupported extension inline and never enqueues it", () => {
    render(<UploadDropZone />);

    drop([videoFile("clip.mpg")]);

    expect(enqueueMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Only MP4, MOV, MKV, WEBM, and AVI files are supported",
    );
  });

  it("rejects a file above 2GB inline and never enqueues it", () => {
    render(<UploadDropZone />);

    drop([sizedFile("huge.mp4", DEFAULT_MAX_VIDEO_BYTES + 1)]);

    expect(enqueueMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Files must be at most 2GB",
    );
  });

  it("enqueues the valid files from a mixed drop and names the rejected one", () => {
    render(<UploadDropZone />);
    const good = videoFile("good.webm");

    drop([good, videoFile("notes.pdf")]);

    expect(enqueueMock).toHaveBeenCalledWith([good]);
    expect(screen.getByRole("alert")).toHaveTextContent("notes.pdf");
  });

  it("enqueues files picked through the file input", () => {
    render(<UploadDropZone />);
    const clip = videoFile("clip.mov");

    fireEvent.change(screen.getByLabelText("Choose video files"), {
      target: { files: [clip] },
    });

    expect(enqueueMock).toHaveBeenCalledWith([clip]);
  });

  it("restricts the file picker to the allowed extensions", () => {
    render(<UploadDropZone />);

    const input = screen.getByLabelText("Choose video files");

    expect(input).toHaveAttribute("accept", ".mp4,.mov,.mkv,.webm,.avi");
    expect(input).toHaveAttribute("multiple");
  });

  it("opens the file picker from the button", () => {
    render(<UploadDropZone />);
    const input = screen.getByLabelText<HTMLInputElement>("Choose video files");
    const click = vi.spyOn(input, "click");

    fireEvent.click(screen.getByRole("button", { name: "Upload video" }));

    expect(click).toHaveBeenCalledOnce();
  });

  it("highlights while a file is dragged over it", () => {
    render(<UploadDropZone />);
    const zone = screen.getByTestId("upload-drop-zone");

    fireEvent.dragOver(zone, { dataTransfer: { dropEffect: "none" } });

    expect(zone).toHaveAttribute("data-dragging", "true");
    expect(
      screen.getByRole("heading", { name: "Drop to upload" }),
    ).toBeInTheDocument();
  });

  it("lets the user dismiss a rejection", () => {
    render(<UploadDropZone />);
    drop([videoFile("clip.mpg")]);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
