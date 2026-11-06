"use server";

import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { signOutIfStaleSession } from "@/lib/stale-session";
import type { RsvpStatus } from "@/lib/events";

/**
 * The member's side of events (D80), plus the controls a halaqah's host or a
 * branch's steward uses on the same screen.
 *
 * Every rule lives in the RPC. These are relays: a Server Action is reachable
 * by anyone who can guess its name, and the database is not.
 *
 * RECONCILE FROM THE RETURN (§4). The poll and question actions return the
 * fresh list the RPC computes, and the screen replaces its state with that. No
 * `revalidatePath` + refetch, which is the pattern that has lied before.
 */

type Result<T = null> = { data: T; error: string | null };

async function client() {
  return createClient();
}

export async function setRsvp(
  eventId: string,
  status: RsvpStatus | null,
  note?: string,
): Promise<Result<RsvpStatus | null>> {
  const supabase = await client();
  const { data, error } = await q(
    "rpc.set_rsvp",
    supabase.rpc("set_rsvp", {
      p_event: eventId,
      // The RPC takes null to clear an answer; the generated type is narrower.
      p_status: status as string,
      p_note: note,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { data: null, error: error.message };
  return { data: (data as RsvpStatus | null) ?? null, error: null };
}

export type PollRow = {
  pollId: string;
  kind: string;
  question: string;
  closesAt: string;
  options: { id: string; label: string; votes: number; mine: boolean }[];
};

export async function loadPolls(eventId: string): Promise<PollRow[]> {
  const supabase = await client();
  const { data } = await q(
    "rpc.event_polls",
    supabase.rpc("event_polls", { p_event: eventId }),
  );
  const byPoll = new Map<string, PollRow>();
  for (const r of data ?? []) {
    let p = byPoll.get(r.poll_id);
    if (!p) {
      p = {
        pollId: r.poll_id,
        kind: r.kind,
        question: r.question,
        closesAt: r.closes_at,
        options: [],
      };
      byPoll.set(r.poll_id, p);
    }
    p.options.push({
      id: r.option_id,
      label: r.label,
      votes: r.votes,
      mine: r.mine,
    });
  }
  return [...byPoll.values()];
}

export async function vote(
  eventId: string,
  pollId: string,
  optionId: string | null,
): Promise<Result<PollRow[]>> {
  const supabase = await client();
  const { error } = await q(
    "rpc.vote_poll",
    supabase.rpc("vote_poll", {
      p_poll: pollId,
      p_option: optionId as string,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { data: [], error: error.message };
  return { data: await loadPolls(eventId), error: null };
}

export async function createPoll(
  eventId: string,
  kind: string,
  question: string,
  options: string[],
): Promise<Result<PollRow[]>> {
  const supabase = await client();
  const { error } = await q(
    "rpc.create_poll",
    supabase.rpc("create_poll", {
      p_event: eventId,
      p_kind: kind,
      p_question: question,
      p_options: options,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { data: [], error: error.message };
  return { data: await loadPolls(eventId), error: null };
}

export async function deletePoll(
  eventId: string,
  pollId: string,
): Promise<Result<PollRow[]>> {
  const supabase = await client();
  const { error } = await q(
    "rpc.delete_poll",
    supabase.rpc("delete_poll", { p_poll: pollId }),
  );
  await signOutIfStaleSession(error);
  if (error) return { data: [], error: error.message };
  return { data: await loadPolls(eventId), error: null };
}

export type QuestionRow = {
  id: string;
  body: string;
  upvotes: number;
  iUpvoted: boolean;
  mine: boolean;
  answered: boolean;
  hidden: boolean;
};

export async function loadQuestions(eventId: string): Promise<QuestionRow[]> {
  const supabase = await client();
  const { data } = await q(
    "rpc.event_question_list",
    supabase.rpc("event_question_list", { p_event: eventId }),
  );
  return (data ?? []).map((r) => ({
    id: r.id,
    body: r.body,
    upvotes: r.upvotes,
    iUpvoted: r.i_upvoted,
    mine: r.mine,
    answered: r.answered,
    hidden: r.hidden,
  }));
}

async function thenQuestions(
  eventId: string,
  error: { message: string; code?: string } | null,
): Promise<Result<QuestionRow[]>> {
  await signOutIfStaleSession(error);
  if (error) return { data: [], error: error.message };
  return { data: await loadQuestions(eventId), error: null };
}

export async function askQuestion(
  eventId: string,
  body: string,
): Promise<Result<QuestionRow[]>> {
  const supabase = await client();
  const { error } = await q(
    "rpc.ask_question",
    supabase.rpc("ask_question", { p_event: eventId, p_body: body }),
  );
  return thenQuestions(eventId, error);
}

export async function upvoteQuestion(
  eventId: string,
  questionId: string,
  on: boolean,
): Promise<Result<QuestionRow[]>> {
  const supabase = await client();
  const { error } = await q(
    "rpc.upvote_question",
    supabase.rpc("upvote_question", { p_question: questionId, p_on: on }),
  );
  return thenQuestions(eventId, error);
}

export async function deleteMyQuestion(
  eventId: string,
  questionId: string,
): Promise<Result<QuestionRow[]>> {
  const supabase = await client();
  const { error } = await q(
    "rpc.delete_my_question",
    supabase.rpc("delete_my_question", { p_question: questionId }),
  );
  return thenQuestions(eventId, error);
}

export async function setQuestionState(
  eventId: string,
  questionId: string,
  answered: boolean,
  hidden: boolean,
): Promise<Result<QuestionRow[]>> {
  const supabase = await client();
  const { error } = await q(
    "rpc.set_question_state",
    supabase.rpc("set_question_state", {
      p_question: questionId,
      p_answered: answered,
      p_hidden: hidden,
    }),
  );
  return thenQuestions(eventId, error);
}

/** Cancel or restore one event, one week of a halaqah included. Stewards. */
export async function setCancelled(
  eventId: string,
  cancelled: boolean,
): Promise<{ error: string | null }> {
  const supabase = await client();
  const { error } = await q(
    "rpc.set_event_cancelled",
    supabase.rpc("set_event_cancelled", {
      p_event: eventId,
      p_cancelled: cancelled,
    }),
  );
  await signOutIfStaleSession(error);
  return { error: error?.message ?? null };
}
