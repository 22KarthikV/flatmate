// Turns the rows the database holds into what the screens show. Pure and free of server-only
// imports, so it can be tested and used from components. The rule itself lives in the database;
// this only counts for display, using the same code the shared vectors test.

import { hasMajority, leadingOptions, needsLine, type Answer, type OptionTally } from "./majority";

export type EventStatus = "voting" | "tiebreak" | "confirmed" | "cancelled";

export interface EventRow {
  id: string;
  title: string;
  description: string;
  location: string | null;
  status: EventStatus;
  organiser_id: string;
  vote_deadline: string;
  tiebreak_since: string | null;
  confirmed_option_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  cancelled_by: string | null;
  cancelled_reason: string | null;
  options: { id: string; starts_at: string; ends_at: string | null; removed_at: string | null }[];
  votes: { option_id: string; profile_id: string; answer: Answer }[];
}

export interface PersonRef {
  profileId: string;
  displayName: string;
}

export interface OptionView {
  id: string;
  startsAt: string;
  endsAt: string | null;
  tally: OptionTally;
  /** What each current member answered, in member order. */
  voters: { profileId: string; name: string; answer: Answer }[];
  needs: string;
  hasMajority: boolean;
  /** Tied for the most yes votes (at least one). */
  leading: boolean;
  confirmed: boolean;
}

export interface EventView {
  id: string;
  title: string;
  description: string;
  location: string | null;
  status: EventStatus;
  organiserId: string;
  organiserName: string;
  voteDeadline: string;
  tiebreakSince: string | null;
  startsAt: string | null;
  endsAt: string | null;
  cancelledReason: string | null;
  cancelledByName: string | null;
  members: number;
  options: OptionView[];
  /** The viewer's answer per date. */
  mine: Record<string, Answer>;
  /** Current members who have not answered on any date. */
  waitingOn: string[];
  /** Voting is open and the viewer has not answered on any date. */
  needsMyVote: boolean;
}

const FORMER = "A former flatmate";

export function buildEventView(
  row: EventRow,
  people: readonly PersonRef[],
  viewerId: string,
): EventView {
  const names = new Map(people.map((person) => [person.profileId, person.displayName]));
  const live = row.options
    .filter((option) => option.removed_at === null)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id));
  const currentVotes = row.votes.filter((vote) => names.has(vote.profile_id));
  const members = people.length;

  const tallies: OptionTally[] = live.map((option) => {
    const tally: OptionTally = { optionId: option.id, yes: 0, maybe: 0, no: 0 };
    for (const vote of currentVotes) if (vote.option_id === option.id) tally[vote.answer] += 1;
    return tally;
  });
  const leaders = new Set(leadingOptions(tallies));

  const options: OptionView[] = live.map((option, index) => {
    const tally = tallies[index]!;
    return {
      id: option.id,
      startsAt: option.starts_at,
      endsAt: option.ends_at,
      tally,
      voters: people.flatMap((person) => {
        const vote = currentVotes.find(
          (v) => v.option_id === option.id && v.profile_id === person.profileId,
        );
        return vote
          ? [{ profileId: person.profileId, name: person.displayName, answer: vote.answer }]
          : [];
      }),
      needs: needsLine(tally.yes, members),
      hasMajority: hasMajority(tally.yes, members),
      leading: leaders.has(option.id),
      confirmed: row.confirmed_option_id === option.id,
    };
  });

  const answered = new Set(currentVotes.map((vote) => vote.profile_id));
  const mine: Record<string, Answer> = {};
  for (const vote of row.votes)
    if (vote.profile_id === viewerId) mine[vote.option_id] = vote.answer;
  const hasMine = live.some((option) => mine[option.id] !== undefined);

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    status: row.status,
    organiserId: row.organiser_id,
    organiserName: names.get(row.organiser_id) ?? FORMER,
    voteDeadline: row.vote_deadline,
    tiebreakSince: row.tiebreak_since,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    cancelledReason: row.cancelled_reason,
    cancelledByName: row.cancelled_by ? (names.get(row.cancelled_by) ?? FORMER) : null,
    members,
    options,
    mine,
    waitingOn: people.filter((person) => !answered.has(person.profileId)).map((p) => p.displayName),
    needsMyVote: row.status === "voting" && !hasMine,
  };
}

export const STATUS_WORDS: Record<EventStatus, string> = {
  voting: "Voting open",
  tiebreak: "Waiting for the organiser to pick",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

export interface EventGroups {
  needsVote: EventView[];
  waitingOnOrganiser: EventView[];
  stillVoting: EventView[];
  comingUp: EventView[];
  past: EventView[];
}

/** Sorts events into the sections of the list. `now` decides what is still ahead. */
export function groupEvents(events: readonly EventView[], now: Date): EventGroups {
  const groups: EventGroups = {
    needsVote: [],
    waitingOnOrganiser: [],
    stillVoting: [],
    comingUp: [],
    past: [],
  };
  for (const event of events) {
    if (event.status === "voting") {
      (event.needsMyVote ? groups.needsVote : groups.stillVoting).push(event);
    } else if (event.status === "tiebreak") {
      groups.waitingOnOrganiser.push(event);
    } else if (event.status === "confirmed" && new Date(event.endsAt ?? event.startsAt!) >= now) {
      groups.comingUp.push(event);
    } else {
      groups.past.push(event);
    }
  }
  const byDeadline = (a: EventView, b: EventView) => a.voteDeadline.localeCompare(b.voteDeadline);
  groups.needsVote.sort(byDeadline);
  groups.stillVoting.sort(byDeadline);
  groups.waitingOnOrganiser.sort(byDeadline);
  groups.comingUp.sort((a, b) => a.startsAt!.localeCompare(b.startsAt!));
  groups.past.sort((a, b) =>
    (b.startsAt ?? b.voteDeadline).localeCompare(a.startsAt ?? a.voteDeadline),
  );
  return groups;
}
