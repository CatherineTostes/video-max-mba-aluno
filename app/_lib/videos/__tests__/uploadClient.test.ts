import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UploadClientError, uploadVideoFile } from "../uploadClient";

/**
 * A scriptable stand-in for XMLHttpRequest. The test drives it: emit progress,
 * answer with a status, drop the connection.
 */
class FakeXHR {
  static last: FakeXHR | null = null;

  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown = null;
  status = 0;
  responseText = "";
  responseType = "";
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  abort = vi.fn(() => this.onabort?.());

  constructor() {
    FakeXHR.last = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(body: unknown) {
    this.body = body;
  }

  // ---- test controls ----
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({
      loaded,
      total,
      lengthComputable: true,
    } as ProgressEvent);
  }

  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = typeof body === "string" ? body : JSON.stringify(body);
    this.onload?.();
  }

  dropConnection() {
    this.onerror?.();
  }
}

const file = new File([new Uint8Array(300)], "morning standup.mp4", {
  type: "video/mp4",
});

beforeEach(() => {
  FakeXHR.last = null;
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function xhr(): FakeXHR {
  if (!FakeXHR.last) {
    throw new Error("No request was made");
  }

  return FakeXHR.last;
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("Expected the upload to fail");
    },
    (error: unknown) => error,
  );
}

describe("uploadVideoFile", () => {
  it("POSTs the raw file with its name and size in the query string", () => {
    void uploadVideoFile({ file }).catch(() => undefined);

    const request = xhr();
    const url = new URL(request.url, "http://localhost");

    expect(request.method).toBe("POST");
    expect(url.pathname).toBe("/api/videos");
    expect(url.searchParams.get("name")).toBe("morning standup.mp4");
    expect(url.searchParams.get("size")).toBe("300");
    expect(request.headers["Content-Type"]).toBe("application/octet-stream");
    expect(request.body).toBe(file);
  });

  it("reports each progress event", () => {
    const onProgress = vi.fn();
    void uploadVideoFile({ file, onProgress }).catch(() => undefined);

    xhr().progress(100, 300);
    xhr().progress(200, 300);
    xhr().progress(300, 300);

    expect(onProgress.mock.calls).toEqual([
      [{ loaded: 100, total: 300 }],
      [{ loaded: 200, total: 300 }],
      [{ loaded: 300, total: 300 }],
    ]);
  });

  it("resolves with the video on 201", async () => {
    const promise = uploadVideoFile({ file });
    const dto = { id: "clv123", title: "morning standup" };

    xhr().respond(201, dto);

    await expect(promise).resolves.toEqual(dto);
  });

  it("rejects with the server's typed code on a 400", async () => {
    const promise = uploadVideoFile({ file });

    xhr().respond(400, { code: "UPL_BAD_EXTENSION", message: "nope" });
    const error = await rejection(promise);

    expect(error).toBeInstanceOf(UploadClientError);
    expect(error).toMatchObject({
      code: "UPL_BAD_EXTENSION",
      message: "Only MP4, MOV, MKV, WEBM, and AVI files are supported",
    });
  });

  it.each([
    [401, "UPL_UNAUTHORIZED"],
    [413, "UPL_TOO_LARGE"],
    [502, "UPL_DISK_WRITE"],
  ])("falls back on the status when a %d has no JSON body", async (status, code) => {
    const promise = uploadVideoFile({ file });

    xhr().respond(status, "<html>Bad Gateway</html>");

    await expect(rejection(promise)).resolves.toMatchObject({ code });
  });

  it("rejects with UPL_INCOMPLETE when the connection drops", async () => {
    const promise = uploadVideoFile({ file });

    xhr().progress(100, 300);
    xhr().dropConnection();

    await expect(rejection(promise)).resolves.toMatchObject({
      code: "UPL_INCOMPLETE",
      message: "Upload interrupted — retry",
    });
  });

  it("aborts the request when the signal fires", async () => {
    const controller = new AbortController();
    const promise = uploadVideoFile({ file, signal: controller.signal });

    controller.abort();
    const error = await rejection(promise);

    expect(xhr().abort).toHaveBeenCalledOnce();
    expect(error).toMatchObject({ name: "AbortError" });
  });

  it("never sends when the signal is already aborted", async () => {
    const error = await rejection(
      uploadVideoFile({ file, signal: AbortSignal.abort() }),
    );

    expect(FakeXHR.last).toBeNull();
    expect(error).toMatchObject({ name: "AbortError" });
  });
});
