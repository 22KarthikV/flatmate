import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const logged = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({ logger: { error: logged } }));

import ErrorPage from "./error";

describe("root error boundary", () => {
  it("shows a friendly message, logs the error with its digest, and can retry", async () => {
    const retry = vi.fn();
    const error = Object.assign(new Error("kaboom"), { digest: "abc123" });

    render(<ErrorPage error={error} retry={retry} />);

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.queryByText("kaboom")).not.toBeInTheDocument();
    expect(logged).toHaveBeenCalledWith("ui.unhandled_error", { error, digest: "abc123" });

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("copes with a thrown value that is not an Error", () => {
    logged.mockClear();
    render(<ErrorPage error="just a string" retry={() => {}} />);

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(logged).toHaveBeenCalledWith("ui.unhandled_error", {
      error: "just a string",
      digest: undefined,
    });
  });
});
