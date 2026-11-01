import type { PerilPhase, PerilSession } from './types';
import { richShown, type RichQuestion } from '../rich-text';

/**
 * What a Peril! screen may see. The projector gets the public view; each
 * student also gets their own seat. Nobody gets the right answer before the
 * reveal or the Treasure Trove's place before it's picked, the question stays
 * hidden while its Wager is set, and a Team's live tally and Wagers go only
 * to its own members.
 */

export type PerilStanding = {
  rank: number;
  /** The Team's name, or the student's in Solo. */
  name: string;
  points: number;
  members: { nickname: string; rightVotes: number; buzzesWon: number }[];
};

export type PerilView = {
  mode: 'peril';
  seq: number;
  code: string;
  phase: PerilPhase;
  solo: boolean;
  /** Played with no student devices: the teacher taps every choice. */
  noDevices: boolean;
  teams: {
    id: string;
    name: string;
    points: number;
    members: { id: string; nickname: string; connected: boolean }[];
  }[];
  roster: {
    id: string;
    nickname: string;
    teamId: string | null;
    points: number;
    connected: boolean;
  }[];
  control: { id: string; name: string } | null;
  board: { title: string; tiles: { value: number; played: boolean }[] }[];
  open: null | {
    column: number;
    row: number;
    value: number;
    treasureTrove: boolean;
    /** Hidden while a Treasure Trove's Wager is set. */
    prompt: string | null;
    choices: string[] | null;
    /** The words' Rich Text, when they have any; only while they're shown, with the explanation once revealed. */
    rich: RichQuestion | null;
    /** Who is answering now: a Team's or a student's name. */
    answering: string | null;
    buzzer: string | null;
    lockedOut: string[];
    voted: number;
    voters: number;
    wagered: number;
    wager: number | null;
    /** Votes per choice; only for the answering Team's own members. */
    tally: number[] | null;
    /** Each member's Wager; only for the Team's own members. */
    teamWagers: { nickname: string; amount: number }[] | null;
    /** Ms left on the running clock, measured when this view was made. */
    remainingMs: number | null;
    correct: number | null;
    explanation: string | null;
    result: null | { name: string | null; choice: number | null; correct: boolean; points: number };
  };
  standings: PerilStanding[];
  /** Only in a student's view. */
  me?: {
    id: string;
    nickname: string;
    teamId: string | null;
    /** The student's score in Solo, their Team's in Teams. */
    points: number;
    rank: number;
    canPick: boolean;
    canBuzz: boolean;
    canAnswer: boolean;
    canWager: boolean;
    canChooseTeam: boolean;
    myVote: number | null;
    myWager: number | null;
    maxWager: number;
  };
};

export function buildPerilView(
  session: PerilSession,
  options: { now: number; viewerId?: string },
): PerilView {
  const s = session;
  const solo = !s.settings.teams;
  const open = s.open;
  const tile = open ? s.board[open.column]?.tiles[open.row] : undefined;
  const contenderOf = (playerId: string) =>
    solo ? playerId : (s.players.find((p) => p.id === playerId)?.teamId ?? null);
  const nameOf = (contender: string | null) =>
    contender === null
      ? null
      : (s.teams.find((team) => team.id === contender)?.name ??
        s.players.find((p) => p.id === contender)?.nickname ??
        'Someone');
  const pointsOf = (contender: string | null) =>
    s.teams.find((team) => team.id === contender)?.points ??
    s.players.find((p) => p.id === contender)?.points ??
    0;
  const membersOf = (contender: string | null) =>
    s.players.filter((p) => contender !== null && contenderOf(p.id) === contender);
  const revealed = s.phase === 'REVEAL';
  const viewer = options.viewerId ? s.players.find((p) => p.id === options.viewerId) : undefined;
  const viewerContender = viewer ? contenderOf(viewer.id) : null;
  const onAnsweringTeam = !solo && !!open?.answering && viewerContender === open.answering;

  const ranked = (solo ? s.players.map((p) => p.id) : s.teams.map((team) => team.id))
    .map((id) => ({
      name: nameOf(id)!,
      points: pointsOf(id),
      members: membersOf(id)
        .map((p) => ({ nickname: p.nickname, rightVotes: p.rightVotes, buzzesWon: p.buzzesWon }))
        .sort(
          (a, b) =>
            b.rightVotes - a.rightVotes ||
            b.buzzesWon - a.buzzesWon ||
            a.nickname.localeCompare(b.nickname),
        ),
      id,
    }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const standings: (PerilStanding & { id: string })[] = ranked.map((row) => ({
    ...row,
    rank: ranked.findIndex((other) => other.points === row.points) + 1,
  }));

  const view: PerilView = {
    mode: 'peril',
    seq: s.seq,
    code: s.code,
    phase: s.phase,
    solo,
    noDevices: !!s.noDevices,
    teams: s.teams.map((team) => ({
      id: team.id,
      name: team.name,
      points: team.points,
      members: membersOf(team.id).map((p) => ({
        id: p.id,
        nickname: p.nickname,
        connected: p.connected,
      })),
    })),
    roster: s.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      teamId: p.teamId,
      points: p.points,
      connected: p.connected,
    })),
    control: s.control ? { id: s.control, name: nameOf(s.control)! } : null,
    board: s.board.map((column, c) => ({
      title: column.title,
      tiles: column.tiles.map((t, r) => ({
        value: t.value,
        played: s.played.includes(`${c}:${r}`),
      })),
    })),
    open:
      open && tile
        ? {
            column: open.column,
            row: open.row,
            value: tile.value,
            treasureTrove: tile.treasureTrove,
            prompt: s.phase === 'WAGERING' ? null : tile.question.prompt,
            choices: s.phase === 'WAGERING' ? null : tile.question.choices,
            rich: richShown(tile.question, s.phase !== 'WAGERING', !!revealed),
            answering: nameOf(open.answering),
            buzzer: open.buzzer
              ? (s.players.find((p) => p.id === open.buzzer)?.nickname ?? null)
              : null,
            lockedOut: open.lockedOut.map((c) => nameOf(c)!),
            voted: open.votes.length,
            voters: membersOf(open.answering).filter((p) => p.connected).length,
            wagered: open.wagers.length,
            wager: open.wager,
            tally:
              onAnsweringTeam && s.phase === 'ANSWERING'
                ? tile.question.choices.map(
                    (_, i) => open.votes.filter((vote) => vote.choice === i).length,
                  )
                : null,
            teamWagers: onAnsweringTeam
              ? open.wagers.map((w) => ({
                  nickname: s.players.find((p) => p.id === w.playerId)?.nickname ?? 'Someone',
                  amount: w.amount,
                }))
              : null,
            remainingMs: open.deadline === null ? null : Math.max(0, open.deadline - options.now),
            correct: revealed ? tile.question.correct : null,
            explanation: revealed ? tile.question.explanation?.trim() || null : null,
            result:
              revealed && open.result
                ? { ...open.result, name: nameOf(open.result.contender) }
                : null,
          }
        : null,
    standings: standings.map(({ id, ...row }) => {
      // The board never shows a player Id: a seat is private to its device.
      void id;
      return row;
    }),
  };

  if (viewer) {
    const contender = viewerContender;
    view.me = {
      id: viewer.id,
      nickname: viewer.nickname,
      teamId: viewer.teamId,
      points: pointsOf(contender),
      rank: standings.find((row) => row.id === contender)?.rank ?? 0,
      canPick: s.phase === 'BOARD' && contender !== null && contender === s.control,
      canBuzz: s.phase === 'BUZZING' && contender !== null && !open?.lockedOut.includes(contender),
      canAnswer: s.phase === 'ANSWERING' && (solo ? open?.buzzer === viewer.id : onAnsweringTeam),
      canWager: s.phase === 'WAGERING' && contender !== null && contender === open?.answering,
      canChooseTeam:
        s.settings.teams?.assign === 'manual' && (s.phase === 'LOBBY' || !viewer.teamId),
      myVote: open?.votes.find((vote) => vote.playerId === viewer.id)?.choice ?? null,
      myWager: open?.wagers.find((w) => w.playerId === viewer.id)?.amount ?? null,
      maxWager: Math.max(pointsOf(contender), 500),
    };
  }
  return view;
}
