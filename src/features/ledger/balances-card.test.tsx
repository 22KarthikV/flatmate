import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildBalancesView } from "./balance-view";
import { BalancesCard } from "./balances-card";

const ME = "00000000-0000-0000-0000-00000000000a";
const SAM = "00000000-0000-0000-0000-00000000000b";
const KIM = "00000000-0000-0000-0000-00000000000c";
const GONE = "00000000-0000-0000-0000-00000000000d";

const person = (profileId: string, displayName: string, pence: number, current = true) => ({
  profileId,
  displayName,
  pence,
  current,
});

describe("BalancesCard", () => {
  it("says everyone is square, with nothing to suggest, in a flat with no money in play", () => {
    render(
      <BalancesCard
        view={buildBalancesView([person(ME, "Alice", 0), person(SAM, "Sam", 0)], ME)}
      />,
    );
    expect(screen.getByText("Everyone is square")).toBeInTheDocument();
    expect(screen.queryByText("Suggested payments")).toBeNull();
  });

  it("leads with what the viewer is owed, and lists everyone's position", () => {
    render(
      <BalancesCard
        view={buildBalancesView(
          [person(ME, "Alice", 1200), person(SAM, "Sam", -700), person(KIM, "Kim", -500)],
          ME,
        )}
      />,
    );
    expect(screen.getByText("You are owed £12.00")).toBeInTheDocument();
    expect(screen.getByText("Alice (you)")).toBeInTheDocument();
    expect(screen.getByText("is owed £12.00")).toBeInTheDocument();
    expect(screen.getByText("owes £7.00")).toBeInTheDocument();
    expect(screen.getByText("owes £5.00")).toBeInTheDocument();
  });

  it("leads with what the viewer owes", () => {
    render(
      <BalancesCard
        view={buildBalancesView([person(ME, "Alice", -300), person(SAM, "Sam", 300)], ME)}
      />,
    );
    expect(screen.getByText("You owe £3.00")).toBeInTheDocument();
  });

  it("suggests the fewest payments, from the viewer's side", () => {
    render(
      <BalancesCard
        view={buildBalancesView(
          [person(ME, "Alice", -300), person(SAM, "Sam", 800), person(KIM, "Kim", -500)],
          ME,
        )}
      />,
    );
    const list = screen.getByText("Suggested payments").parentElement!;
    expect(within(list).getByText("Kim pays Sam £5.00")).toBeInTheDocument();
    expect(within(list).getByText("You pay Sam £3.00")).toBeInTheDocument();
  });

  it("shows former flatmates who still have money open", () => {
    render(
      <BalancesCard
        view={buildBalancesView([person(ME, "Alice", 500), person(GONE, "Dee", -500, false)], ME)}
      />,
    );
    const section = screen.getByText("Former flatmates").parentElement!;
    expect(within(section).getByText("Dee")).toBeInTheDocument();
    expect(within(section).getByText("owes £5.00")).toBeInTheDocument();
  });

  it("warns instead of suggesting payments if the balances do not add up", () => {
    render(
      <BalancesCard
        view={buildBalancesView([person(ME, "Alice", 500), person(SAM, "Sam", -400)], ME)}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("don’t add up");
    expect(screen.queryByText("Suggested payments")).toBeNull();
  });
});
