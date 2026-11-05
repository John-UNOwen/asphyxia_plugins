// @ts-ignore
declare const K: any;
// @ts-ignore
declare const DB: any;
// @ts-ignore
declare const U: any;
// @ts-ignore
declare const R: any;
// @ts-ignore
declare const IO: any;
// @ts-ignore
declare const CONFIG: any;
// @ts-ignore
declare const console: any;
declare const require: any;
declare const Buffer: any;

import * as mahjong from "../mahjong";
import { Table } from "../taikyoku";
import type { PlayerSeat } from "./utils";
import { handleCardmng, handleVfgac } from "./eamuse";
import {
  xml_escape,
  kitem,
  serv_st_ok,
  xml_response,
  xml_error,
  SERV_ST_SESSION_LOST,
  SERV_ST_STATE_INVALID,
  SERV_ST_ALREADY_FINISHED,
  formGet,
  parseMust,
  mustInt,
  nowUnix,
  playerIdFromRefid,
  ensureProfile,
  getProfileByRefid,
  getProfileBySession,
  saveProfile,
  resolveProfile,
  sessionProfile,
  saveStateOn,
  isEvictedSession,
  isPhantomRefid,
  isQuarantinedProfile,
  isMintForbiddenRefid,
  tombstoneSessionOnProfile,
  loginGate,
  accountGateEvent,
  nameWriteGate,
  consumeCardCredential,
  presentViaPresenter,
  normalizeRefid,
  vlog,
  sanitizeCcRequest,
  CC_REQUEST_FRESH,
  MATCHES,
  TABLES,
  MATCH_LOBBY,
  PLAYER_SEAT,
  SHARED_TABLES,
  CARD_STORE_BY_REFID,
  allocateTid,
  STAMPS,
  STAMP_CURSOR,
  _stampSeq,
  incStampSeq,
  stampCursor,
  stampCursorMark,
  SERV_ST_NO_TABLE,
  SERV_ST_ACCOUNT_NOT_FOUND,
  viewerIdentity,
  archiveParticipantMatches,
  archiveParticipantSeat,
  recordKindOf,
  scrambleSchoolSetting,
  PASELI_SESSIONS,
  stateB64,
  infoData,
  eventsJson,
  proStatsJson,
  missionsJson,
  EVENT_BEGIN,
  EVENT_END,
  PORT,
  HOST,
  _gachaInfoXml,
  buildGachaInfoXml,
  gachaSeries,
  _gachaPool,
  gachaRates,
  rollGachaItems,
  cutinItemIdOf,
  cutinOidOf,
  cutinCharaIndex,
  CHARA_UNLOCK_OID_TO_CHARA,
  pickupGachaGateActive,
  CUTIN_DEFAULT_ITEM_IDS,
  MUSIC_GACHA_POOL,
  musicGachaSeedState,
  incMusicReqSeq,
  DOJO_SLOTS,
  DOJO_STOCK_MAX,
  DOJO_LESSON_SECONDS,
  gameBaseUrl,
  isTabooText,
  isTabooTextStandalone,
  SERVER_OWNED_STATE_KINDS,
  serverOwnedStateJson,
  // odekake publish consent + borrow grants (utils.ts, data/odekake.json)
  odekakePublished,
  applyOdekakePublishConsent,
  odekakePublishPolicy,
  findOdekakeGrant,
  issueOdekakeGrant,
  revokeOdekakeGrant,
  pruneOdekakeGrants,
} from "./utils";

// ---------------------------------------------------------------------------
// GMODE constants (port of server.py)
// ---------------------------------------------------------------------------
export const GMODE_TAKU: Record<number, number> = {
  1: 0, 2: 1, 3: 2, 4: 3,
  5: 0, 6: 0, 7: 2, 8: 0, 9: 0, 10: 2, 11: 0, 12: 2, 13: 0, 14: 2,
  15: 0, 16: 0, 17: 2, 18: 2, 19: 2, 20: 0, 21: 2, 22: 0, 23: 2,
};
export const GMODE_SEATS: Record<number, number> = (() => {
  const m: Record<number, number> = {};
  for (const g of Object.keys(GMODE_TAKU) as any) {
    const gi = Number(g);
    const taku = GMODE_TAKU[gi];
    // @ts-ignore - mahjong.SEATS_OF
    m[gi] = (mahjong as any).SEATS_OF[taku];
  }
  return m;
})();
export const GMODE_TENBO: Record<number, number> = (() => {
  const m: Record<number, number> = {};
  for (const g of Object.keys(GMODE_TAKU) as any) {
    const gi = Number(g);
    const taku = GMODE_TAKU[gi];
    // @ts-ignore
    m[gi] = (mahjong as any).START_SCORE[taku];
  }
  return m;
})();
export const GAME_MODES = Object.keys(GMODE_TAKU).map(n => Number(n)).sort((a, b) => a - b);

// ---------------------------------------------------------------------------
// helpers for matching
// ---------------------------------------------------------------------------
function matchingPlayerHuman(index: number, zaseki: number, profile: any, name: string): string {
  const states: string[] = [];
  for (const kind of ["player_game", "customize_item"]) {
    const b64 = stateB64(profile, kind);
    if (b64) states.push(`<state kind="${xml_escape(kind)}"><data>${xml_escape(b64)}</data></state>`);
  }
  let inner = `<name>${xml_escape(name)}</name><zaseki>${zaseki}</zaseki><cpu_level>0</cpu_level>`;
  if (states.length) inner += "<client_states>" + states.join("") + "</client_states>";
  return `<player_${index} ptype="1">${inner}</player_${index}>`;
}

function matchingPlayerCpu(index: number, zaseki: number, chara1based: number, level: number = 1): string {
  const oid = `OID_CHARACTER_${chara1based}`;
  // cpu_level doubles as the CPU's displayed dan (DanLevelType int: 6=KYU5
  // ..15=DAN5). cpu_variant is only read for Clear (Chara12) with the pro
  // event active; harmless otherwise (client null-checks it).
  const variant = chara1based === 12 ? `<cpu_variant>0</cpu_variant>` : "";
  return `<player_${index} ptype="3"><cpu_level>${level}</cpu_level><zaseki>${zaseki}</zaseki><cpu_name>${xml_escape(oid)}</cpu_name>${variant}</player_${index}>`;
}

// CPU dan badge: deterministic per table+seat so rematches look stable.
// Range KYU5(6)..DAN5(15): believable arcade opponents, never Newbie.
function cpuDanFor(tid: number, seat: number): number {
  return 6 + (((Number(tid) || 0) + seat * 3) % 10);
}

// The game mode is what the player selected: EntryGame.cs:60 posts
// gmode=(int)GameDataManager.Mahjong.GetGameMode(), and every later answer
// (mgresult, the match archive, the record list) is about the table that mode
// created. It is resolved once at entry and travels with the seat and the table -
// reading it off a request later, or hardcoding it, records a different match than
// the one that was played.
function resolveGmode(raw: any, fallback = 1): number {
  const n = Number(raw);
  const g = Number.isFinite(n) ? Math.trunc(n) : fallback;
  return g in GMODE_TAKU ? g : fallback;
}

// EntryTakuInfo.cs:27-46 parses all nine limit fields with ValueInt and
// MatchingFlow.cs:223-227 hands last_time straight to SetTimer, which counts
// seconds (CountDownTimer.cs decrements by Time.deltaTime). They are seconds:
// millisecond-shaped numbers make the lobby timer count for hours and the
// per-action budgets meaningless.
const ENTRY_LIMIT_SECONDS: Record<string, number> = {
  ste_oya1_limit_time: 20,
  ste_limit_time: 15,
  ste_reechi1_limit_time: 20,
  naki_limit_time: 15,
  agari_limit_time: 15,
  naki_choice_limit_time: 30,
  reechi_choice_limit_time: 30,
  last_cyoukou_limit_time: 30,
  last_time: 60,
};

// A lobby is forced to CPU seats after this many seconds - the same window the
// client shows as its matching countdown (last_time).
const LOBBY_FORCE_SECONDS = ENTRY_LIMIT_SECONDS.last_time;

function gameServiceUrl(ctx: any): string {
  let url = gameBaseUrl();
  try {
    const host = ctx?.req?.hostname || ctx?.req?.headers?.host || "127.0.0.1";
    let port = PORT;
    try { if (CONFIG && CONFIG.port) port = CONFIG.port; } catch { }
    url = `http://${String(host).split(":")[0]}:${port}/aog/`;
  } catch { }
  return url;
}

// The <entry> body: identical for entry_game and reconnect (EntryGame.cs and
// ReconnectGame.cs both feed EntryTakuInfo.Parse).
function entryXml(ctx: any, tid: number, pindex: number, gmode: number): string {
  const limits = Object.keys(ENTRY_LIMIT_SECONDS)
    .map(k => `<${k}>${ENTRY_LIMIT_SECONDS[k]}</${k}>`)
    .join("");
  return xml_response(
    "<entry>" +
    "<gserv_id>1</gserv_id>" +
    `<tid>${tid}</tid>` +
    `<pindex>${pindex}</pindex>` +
    "<next_sno>0</next_sno>" +
    "<last_cyoukou_num>3</last_cyoukou_num>" +
    "<cyoukou_num>3</cyoukou_num>" +
    limits +
    `<gserv_url>${xml_escape(gameServiceUrl(ctx))}</gserv_url>` +
    "<pay_mode>0</pay_mode>" +
    `<gmode>${gmode}</gmode>` +
    "</entry>"
  );
}

// Settlement the client's MahjongResultInfo.Parse reads (MahjongResultInfo.cs:150-181).
// gmode and taku_class are the table's own; the rows are the table's own standing.
// There is no fallback row set here: a caller without a table has nothing to
// settle and answers SERV_ST_NO_TABLE instead.
function mgresultXml(table: Table, viewerPindex: number = -1): string {
  const gmode = resolveGmode((table as any).gmode, 1);
  const parts: string[] = [
    `<gmode>${gmode}</gmode>`,
    `<taku_class>${Number((table as any).taku_class || 1) || 1}</taku_class>`,
    "<continue_state>0</continue_state>",
    "<continue_fee>0</continue_fee>",
  ];
  const rows: Array<[number, number, number]> = (table as any).result_rows();
  for (let i = 0; i < rows.length; i++) {
    const [rank, score, uma] = rows[i];
    parts.push(`<player_${i}><rank>${rank}</rank><score>${score}</score><uma>${uma}</uma></player_${i}>`);
  }
  const school = String((table as any).scramble || "");
  if (school) {
    // MatchingData.cs:87-104 announced the match as a scramble match, so each
    // player's own result carries it (Gread2EventResultInfo.cs:21-23: id,
    // sub_cate = a SchoolID name, win).
    const win = viewerPindex >= 0 && viewerPindex < rows.length && rows[viewerPindex][0] === 0 ? 1 : 0;
    parts.push(`<g2result><r><id>1</id><sub_cate>${school}</sub_cate><win>${win}</win></r></g2result>`);
  }
  return "<mgresult>" + parts.join("") + "</mgresult>";
}

function matchingXml(tid: number, seats: number, myPindex: number, players: Array<{ pcuid: string; mid: number; name: string; profile: any }>, isMatched: boolean, scrambleSchool: string = ""): string {
  // <pnum> is the human count and <cpu_num> the CPU count, and the client adds the
  // two to decide how many seats it parses at all (MatchingData.cs:33-35,76-81). A
  // member slot no session holds is a CPU seat, so counting it into pnum made a
  // three-human table announce four humans and no CPU, and the seat the engine drove
  // as a CPU was announced to every client as a player.
  const humans = players.filter((p) => !!p);
  const pnum = humans.length;
  const cpu_n = Math.max(0, seats - pnum);
  
  // The opponent picked for a CPU seat is chosen against the human seats' own
  // characters. Reading the polling client's character instead made the same table
  // present a different character in the same seat to each client - the CPU was a
  // different girl on every screen.
  const usedChars = new Set<number>();
  for (const p of humans) {
    if (p && p.profile) {
      try {
        const pg = JSON.parse(p.profile.states?.player_game || "{}");
        usedChars.add(Number(pg.SelectChara || 0) + 1);
      } catch {}
    }
  }
  
  const playersXml: string[] = [];
  const epdataXml: string[] = [];
  
  for (let i = 0; i < (isMatched ? seats : pnum); i++) {
    const p = players[i];
    if (p) {
      playersXml.push(matchingPlayerHuman(i, i, p.profile, p.name));
      epdataXml.push(`<epdata_${i}><name>${xml_escape(p.name)}</name><mid>${p.mid}</mid></epdata_${i}>`);
    } else if (isMatched) {
      let cpuChara = (tid + i * 7) % 19 + 1;
      while (usedChars.has(cpuChara)) {
        cpuChara = (cpuChara % 19) + 1;
      }
      usedChars.add(cpuChara);
      playersXml.push(matchingPlayerCpu(i, i, cpuChara, cpuDanFor(tid, i)));
    }
  }
  
  const playersStr = playersXml.join("");
  // MatchingData.MatchingEndNode (MatchingData.cs:87-104) reads mend>g2event>e>id:
  // id 1 is the scramble match the client then plays with its festival UI
  // (KyokuCall text, ResultFlow trophy line). Only announced when this server
  // actually designated the table one (see scrambleSchoolSetting).
  const g2event = (scrambleSchool && isMatched) ? `<g2event><e><id>1</id></e></g2event>` : "";
  const mendTag = `<mend>${playersStr}${g2event}</mend>`;
  const epdata = epdataXml.join("");
  return (
    "<mwait>" +
    `<status>${isMatched ? 1 : 0}</status>` +
    `<pnum>${pnum}</pnum>` +
    `<cpu_num>${isMatched ? cpu_n : 0}</cpu_num>` +
    `<pindex>${myPindex}</pindex>` +
    `${epdata}` +
    `${mendTag}` +
    "</mwait>"
  );
}

// The table carries the mode it was created for: the settlement, the archive and
// every later record read come from the table, so tagging it here is what keeps
// "which match was this" true after the seat is gone.
function ensureSharedTable(tid: number, taku: number, human_seats?: number[], tag?: { gmode?: number; taku_class?: number; scramble?: string }): Table {
  let table = SHARED_TABLES.get(tid) as Table | undefined;
  if (!table) {
    const seats = human_seats && human_seats.length > 0 ? human_seats : [0];
    table = new Table(taku, seats); // pass array of human seats
    (table as any).tid = tid;
    (table as any).gmode = Number(tag?.gmode) || 1;
    (table as any).taku_class = Number(tag?.taku_class) || 1;
    (table as any).scramble = String(tag?.scramble || "");
    (table as any).start_kyoku();
    SHARED_TABLES.set(tid, table);
  }
  return table;
}

// Resolve the taikyoku a match request is addressing. gget/gpost carry the table id
// in must segment 3 and end_game / kiken_game / get_haifu_data carry it as tid=
// (GGet.cs:30, GPost.cs:44, EndGame.cs:22, KikenGame.cs:22); the seat the player
// took at entry says which of those tids is theirs.
//
// Until now every one of them read the tid and then ignored it, taking whatever
// PLAYER_SEAT happened to hold for this session - and a hardcoded seat
// {tid: 1, pindex: 0, mid: 1, name: "ゲスト"} when the session had no seat at all,
// which is every session after a restart. The client kept playing on a server with
// no table behind it, so the answer had to be invented: a seat nobody was sitting
// at, an empty acknowledgement for a command nothing received, and a settlement of
// GMODE_TENBO x seats that no game produced.
// Returns null when the addressed table is not this seat's table; the caller
// answers SERV_ST_NO_TABLE, which is what the client's match flow handles.
export function addressedSeat(pcuid: string, tid: number, claimedPindex: number, tag: string): PlayerSeat | null {
  const seat = PLAYER_SEAT.get(pcuid) || null;
  if (!seat || !tid || Number(seat.tid) !== Number(tid)) {
    vlog(`[VFG] ${tag} no table behind tid=${tid} pcuid=${String(pcuid).slice(0, 8)}... ` +
      `(seat=${seat ? seat.tid : "none"}) -> serv_st ${SERV_ST_NO_TABLE}`);
    return null;
  }
  if (claimedPindex >= 0 && Number(seat.pindex) !== Number(claimedPindex)) {
    // The server's seat assignment wins; logged so a client that addresses a seat
    // it was never given is visible instead of silently served.
    vlog(`[VFG] ${tag} client claimed pindex=${claimedPindex} at tid=${tid}, server seat is ${seat.pindex}`);
  }
  (seat as any).lastSeen = Date.now();
  return seat;
}

// ---------------------------------------------------------------------------
// seat liveness
// ---------------------------------------------------------------------------

// The seat a table+index is really held by. PLAYER_SEAT is keyed by session, so a
// re-login leaves the retired session's seat sitting next to the live one, and a
// plain scan of the map hands out whichever was inserted first. The live seat is the
// one whose session has not been retired and, of those, the one polled most recently.
function seatAt(tid: number, index: number): { pcuid: string; seat: PlayerSeat; evicted: boolean } | null {
  let live: { pcuid: string; seat: PlayerSeat; evicted: boolean } | null = null;
  let dead: { pcuid: string; seat: PlayerSeat; evicted: boolean } | null = null;
  for (const [pcuid, seat] of PLAYER_SEAT.entries()) {
    if (Number(seat.tid) !== Number(tid) || Number(seat.pindex) !== Number(index)) continue;
    const evicted = isEvictedSession(String(pcuid));
    const cand = { pcuid: String(pcuid), seat, evicted };
    const seen = Number((seat as any).lastSeen || 0);
    const best = evicted ? dead : live;
    if (!best || seen > Number((best.seat as any).lastSeen || 0)) {
      if (evicted) dead = cand; else live = cand;
    }
  }
  return live || dead;
}

// A lobby only means something while its members are still sitting in it. Membership
// is append-only and a seat is released in exactly one place - end_game, which this
// client never posts - so a refresh or an abandoned lane leaves the old session's
// seat in the room. The lobby then fills on ghosts, every ghost becomes a human seat,
// and a ghost has no account behind it to render: that is how one account ends up in
// two seats (match archive tid 1073 records one mid in seats 0 and 1) and how a
// stranger sees a nameless default girl across the table.
async function pruneLobbyMembers(lobbyKey: string, lobby: { pcuids: string[]; tid: number }, tag: string): Promise<string[]> {
  const live: string[] = [];
  const taken = new Map<string, string>();
  const dropped: string[] = [];
  for (const raw of lobby.pcuids) {
    const pcuid = String(raw);
    const seat = PLAYER_SEAT.get(pcuid);
    if (!seat || Number(seat.tid) !== Number(lobby.tid) || String(seat.lobbyKey || "") !== String(lobbyKey)) {
      dropped.push(pcuid);
      continue;
    }
    if (isEvictedSession(pcuid)) {
      PLAYER_SEAT.delete(pcuid);
      dropped.push(pcuid);
      continue;
    }
    const refid = normalizeRefid(String((seat as any).refid || ""));
    if (refid && taken.has(refid)) {
      // The same account holding two seats because it logged in twice: the newer
      // session's seat is the one that stays.
      const older = taken.get(refid) as string;
      PLAYER_SEAT.delete(older);
      dropped.push(older);
      taken.set(refid, pcuid);
      live.push(pcuid);
      continue;
    }
    if (refid) taken.set(refid, pcuid);
    live.push(pcuid);
  }
  // A lobby's seat numbers are positions in this list (entry hands out pcuids.indexOf,
  // the table that forms maps the same positions), so dropping a member renumbers the
  // room. Leaving a live seat recorded at the index it no longer has is how one index
  // ends up claimed twice while another is held by nobody.
  const renumbered: string[] = [];
  for (let i = 0; i < live.length; i++) {
    const seat = PLAYER_SEAT.get(live[i]);
    if (!seat || Number(seat.pindex) === i) continue;
    renumbered.push(`${seat.pindex}->${i}`);
    seat.pindex = i;
  }
  lobby.pcuids = live;
  if (renumbered.length) {
    vlog(`[VFG] ${tag} lobby=${lobbyKey} tid=${lobby.tid} re-seated ${renumbered.join(" ")}`);
  }
  if (dropped.length) {
    vlog(`[VFG] ${tag} lobby=${lobbyKey} tid=${lobby.tid} released ${dropped.length} seat(s) nobody holds, ${live.length} live member(s)`);
  }
  return live;
}

// The seat this account is still holding in a room that is still alive. A waiting
// screen that reloads posts entry_game again with a fresh session, and the lane was
// then seated in a brand new table while the three it left kept waiting on a seat
// nobody held: one lane got a room of its own, the other three got the hole it left.
// A lobby answer falls through so the ordinary path seats the new session at the same
// index; a table answer is returned straight to the client.
async function returningSeat(
  refid: string, pcuid: string, lobbyKey: string, name: string, mid: number, profile: any,
  gmode: number, taku_class: number, guest: boolean, scramble: string,
): Promise<{ tid: number; pindex: number } | null> {
  const mine = normalizeRefid(String(refid || ""));
  if (!mine) return null;
  let best: { pcuid: string; seat: PlayerSeat } | null = null;
  for (const [heldPcuid, seat] of PLAYER_SEAT.entries()) {
    if (normalizeRefid(String((seat as any).refid || "")) !== mine) continue;
    if (isEvictedSession(String(heldPcuid))) continue;
    const heldTid = Number(seat.tid) || 0;
    if (!heldTid) continue;
    if (Number((seat as any).gmode) !== Number(gmode)) continue;
    const heldKey = String((seat as any).lobbyKey || "");
    const lobby = MATCH_LOBBY.get(heldKey);
    const inLobby = !!lobby && Number(lobby.tid) === heldTid;
    const onTable = SHARED_TABLES.has(heldTid);
    if (!inLobby && !onTable) continue;   // that room is gone; a fresh one is correct
    if (inLobby && heldKey !== String(lobbyKey)) continue; // a different room on purpose
    const seen = Number((seat as any).lastSeen || 0);
    if (!best || seen > Number((best.seat as any).lastSeen || 0)) best = { pcuid: String(heldPcuid), seat };
  }
  if (!best) return null;
  const backTid = Number(best.seat.tid);
  const backIndex = Number(best.seat.pindex) || 0;
  const backKey = String((best.seat as any).lobbyKey || lobbyKey);
  if (String(best.pcuid) !== String(pcuid)) {
    const backLobby = MATCH_LOBBY.get(backKey);
    if (backLobby && Number(backLobby.tid) === backTid) {
      const at = backLobby.pcuids.indexOf(String(best.pcuid));
      if (at >= 0) backLobby.pcuids[at] = String(pcuid);
      else backLobby.pcuids.push(String(pcuid));
    }
    PLAYER_SEAT.delete(String(best.pcuid));
    PLAYER_SEAT.set(String(pcuid), {
      tid: backTid, pindex: backIndex, name, mid, profile, lobbyKey: backKey,
      gmode, taku_class, refid, guest, scramble,
    });
  }
  vlog(`[VFG] entry back to tid=${backTid} seat=${backIndex} of mode ${gmode}: the room this account left is still live`);
  if (SHARED_TABLES.has(backTid)) return { tid: backTid, pindex: backIndex };
  return null;
}

// A seat carries the profile its session had at entry_game. When that copy cannot
// describe a player at all, the seat's account is re-read from the store by refid.
// This is a read only: player_game and customize_item are client-owned state and are
// never rewritten here.
async function seatProfile(seat: PlayerSeat): Promise<any | null> {
  const held = (seat as any).profile;
  if (held && held.states && held.states.player_game) return held;
  const refid = normalizeRefid(String((seat as any).refid || ""));
  if (!refid) return held || null;
  const fresh = await getProfileByRefid(refid);
  if (fresh) (seat as any).profile = fresh;
  return fresh || held || null;
}

// ---------------------------------------------------------------------------
// stamps
// ---------------------------------------------------------------------------
function stampPost(tid: number, mid: number, pindex: number, name: string, contents: string, param: string): number {
  if (!contents) return 0;
  const idx = incStampSeq();
  const room = STAMPS.get(tid) || [];
  room.push({
    idx,
    mid: Number(mid || 0),
    pindex: Number(pindex || 0),
    time: Date.now(),
    name: name || "",
    contents,
    param: param || "",
  });
  // keep last 40
  if (room.length > 40) room.splice(0, room.length - 40);
  STAMPS.set(tid, room);
  // Which seat a balloon belongs to, and whether a human sent it or the table did:
  // without this a sticker run cannot be read back out of a log at all.
  vlog(`[VFG] stamp tid=${tid} idx=${idx} seat=${pindex} mid=${mid} name=${name || "CPU"} contents=${contents}`);
  return idx;
}

// A finished table nobody is seated at is over: its stamp backlog and each seat's
// place in that backlog go with it. Nothing else ever dropped them, so a long-lived
// process kept the balloons of matches that ended hours ago.
function closeStampRoom(tid: number): void {
  STAMPS.delete(tid);
  const prefix = `${Number(tid) || 0}|`;
  for (const key of Array.from(STAMP_CURSOR.keys())) {
    if (String(key).startsWith(prefix)) STAMP_CURSOR.delete(key);
  }
}

function stampXml(tag: string, tid: number, since: number = 0): string {
  const room = STAMPS.get(tid) || [];
  const rows = room.filter(e => e.idx > since);
  if (!rows.length) return `<${tag}></${tag}>`;
  const body = rows.map(e =>
    `<d idx="${e.idx}" mid="${e.mid}" pindex="${e.pindex}" time="${e.time}"><name>${xml_escape(e.name)}</name><contents>${xml_escape(e.contents)}</contents><param>${xml_escape(e.param)}</param></d>`
  ).join("");
  return `<${tag}>${body}</${tag}>`;
}

const CPU_STAMP_REPLIES = ["TableSticker001", "TableSticker002", "TableSticker003", "TableSticker004"];

// The seats this table runs as CPUs: every seat that is not one of its human seats.
// That is the same list the engine drives (taikyoku.ts humans), so a reply can only
// land where a CPU actually sits.
function cpuSeatsForTid(tid: number): number[] {
  const table = SHARED_TABLES.get(tid);
  if (!table) return [];
  const seats = Number((table as any).seats) || 0;
  const humans = new Set<number>(((table as any).humans || []).map((h: any) => Number(h)));
  const out: number[] = [];
  for (let i = 0; i < seats; i++) if (!humans.has(i)) out.push(i);
  return out;
}

// A CPU at the table answers a sticker a human seat sent. It replies only from a seat
// that is a CPU seat - the old version aimed at any seat but the sender's, human or
// empty, which is why one player's sticker drew balloons on the other three players -
// and it never answers with the sticker that seat is already showing, which is the
// same-sticker-twice-on-one-seat look out of a four-item pool.
function maybeCpuStamp(tid: number, humanPindex: number): void {
  const cpuSeats = cpuSeatsForTid(tid);
  if (!cpuSeats.length) return;
  if (Math.random() > 0.55) return;
  const seat = cpuSeats[Math.floor(Math.random() * cpuSeats.length)];
  const room = STAMPS.get(tid) || [];
  let lastOnSeat = "";
  for (let i = room.length - 1; i >= 0; i--) {
    if (Number(room[i].pindex) === seat) { lastOnSeat = String(room[i].contents || ""); break; }
  }
  const pool = CPU_STAMP_REPLIES.filter((x) => x !== lastOnSeat);
  if (!pool.length) return;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  stampPost(tid, 0, seat, "CPU", pick, "");
}

// ---------------------------------------------------------------------------
// dojo helpers
// ---------------------------------------------------------------------------
function dojoState(profile: any): any[] {
  if (!profile.dojo) profile.dojo = [];
  const slots = profile.dojo as any[];
  while (slots.length < DOJO_SLOTS) slots.push({ available: false, chara: "", start: 0, next: 0, stock: 0 });
  return slots;
}
function dojoRefresh(slot: any): void {
  if (!slot.available) return;
  const now = nowUnix();
  let nxt = Number(slot.next || 0);
  while (slot.stock < DOJO_STOCK_MAX && nxt && now >= nxt) {
    slot.stock += 1;
    nxt += DOJO_LESSON_SECONDS;
  }
  slot.next = nxt;
}
function dojoSlotXml(idx: number, slot: any): string {
  if (!slot.available) return `<slot idx="${idx}"><available>0</available></slot>`;
  const has_next = slot.stock < DOJO_STOCK_MAX ? 1 : 0;
  return `<slot idx="${idx}"><available>1</available><character_obj>${xml_escape(slot.chara || "OID_CHARACTER_1")}</character_obj><start_time>${Number(slot.start || nowUnix())}</start_time><next_time>${Number(slot.next || nowUnix())}</next_time><has_next>${has_next}</has_next><reserve_souls>${Number(slot.stock || 0)}</reserve_souls><all_souls>${DOJO_STOCK_MAX}</all_souls></slot>`;
}
// The dojo document belongs to the account that owns this login session. The old
// helper fell back to ensureProfile("GUEST") whenever pcuid resolved to nothing, so
// a stale or never-issued session read AND wrote one shared scratch document: the
// live DB shows refid=GUEST carrying a running lesson (slot 0 available,
// OID_CHARACTER_7, stock 1) that every anonymous caller inherits and overwrites,
// and dojo_set_slot / dojo_gain_soul move that shared timer for everyone.
// A dojo request with no account behind it is now answered with the plugin's
// session-lost code and touches no profile at all. That is safe on the client:
// every dojo call site passes enableErrorScreenTransition:false
// (DojoFlow.cs:367 / :103 / :128, HomeFlow.cs:950, SubMonitorFlow.cs:379) and
// catches NetworkResponseException - DojoFlow leaves the dojo scene
// (DojoFlow.cs:425-428), HomeFlow drops the icon (HomeFlow.cs:951-954, 974-980).
async function dojoProfile(form: Record<string, string>): Promise<any | null> {
  const pcuid = formGet(form, "pcuid");
  if (!pcuid) return null;
  try { return await getProfileBySession(pcuid); } catch { return null; }
}
function dojoNoAccount(ctx: any, form: Record<string, string>, tag: string): void {
  const pcuid = String(formGet(form, "pcuid") || "-");
  vlog(`[VFG] ${tag} no profile behind pcuid=${pcuid.slice(0, 8)}... -> serv_st ${SERV_ST_SESSION_LOST} (no shared GUEST dojo)`);
  sendXml(ctx, xml_error(SERV_ST_SESSION_LOST));
}

// Pre-computed static XML — these never change at runtime
const _playmodeXmlCache: string = (() => {
  const parts: string[] = ["<playmode_list>"];
  for (const gmode of GAME_MODES) {
    const taku = GMODE_TAKU[gmode];
    // @ts-ignore
    const seats = (mahjong as any).SEATS_OF[taku];
    // @ts-ignore
    const tenbo = (mahjong as any).START_SCORE[taku];
    parts.push(`<mode><gmode>${gmode}</gmode><taku_class>1</taku_class><payment_mode>0</payment_mode><table_type>0</table_type><pmax>${seats}</pmax><tenbo>${tenbo}</tenbo><state>1</state><rate>0</rate><superior_border>0</superior_border></mode>`);
  }
  parts.push("</playmode_list>");
  return parts.join("");
})();

const _battleItemXmlCache: string = (() => {
  const parts: string[] = ["<battle_item_settings><basic_settings/><playmode_settings>"];
  for (const gmode of GAME_MODES) parts.push(`<setting gmode="${gmode}" taku_class="1"/>`);
  parts.push("</playmode_settings></battle_item_settings>");
  return parts.join("");
})();

function playmodeXml(): string { return _playmodeXmlCache; }
function battleItemXml(): string { return _battleItemXmlCache; }

// ---------------------------------------------------------------------------
// present box + player_item: server-side authority
// ---------------------------------------------------------------------------
// The client never persists its present box: PresentBoxGameData.Save() is dead
// code (nothing calls it) and the only write a claim produces is SaveTask ->
// POST /present_done with the claimed ids (MFG.GameData/PresentBoxGameData.cs:139-217).
// HomeFlow.cs:441 runs AutoAssignment() on every home load, and AutoAssignment
// grants everything "!IsReceived && IsAutoApply" in whatever the server just
// served (PresentBoxGameData.cs:185-202 -> ItemUtility.AddItem), so a box whose
// receipts live nowhere re-grants the same presents on every load. The receipts
// have to be stored in the server's "present_box_game" state, and the auto-apply
// income has to land in the server's "player_item" state exactly once.
//
// player_item mirrors MFG.GameData/PlayerItemGameData.cs as JsonUtility writes it:
// {DataVersion:2, Items:[{ItemID, m_count}]}, ItemID being the int value of
// MFG.Types.PlayerItem.ItemID (ItemID.cs: None=0, Present01=1, FightSpiritW=11,
// GachaTicket=12). DataVersion is kept at 2 so the client's v1 migration
// (PlayerItemGameData.cs:124-141) never re-indexes the ids we wrote.
const PI_PRESENT01 = 1;         // ギフト (PlayerItemMaster.cs:15-20)
const PI_FIGHT_SPIRIT_W = 11;
const PI_GACHA_TICKET = 12;

// Present contents the server can grant by itself. Everything else (cutins, BGM,
// voices, event items) is granted client-side by ItemUtility.AddItem, and its
// receipt arrives through present_done.
const PRESENT_CONTENT_TO_ITEMID: Record<string, number> = {
  OID_CharaExpUpPresent: PI_PRESENT01,
  OID_GachaTicket: PI_GACHA_TICKET,
  OID_FightSpirit_Wildcard: PI_FIGHT_SPIRIT_W,
};

// Welcome presents (one-time). Flag-based so the daily grant in handle_login,
// which may create the state first, never suppresses them.
const WELCOME_PRESENTS = [
  { PresentID: 9001, Title: "Welcome", Text: "Welcome gacha tickets", Content: "OID_GachaTicket", Count: 2, LimitDate: "", ReceivedDate: "", IsReceived: false, IsAutoApply: true, IsHideHistory: false },
  { PresentID: 9002, Title: "Welcome", Text: "Presents for your fight girls", Content: "OID_CharaExpUpPresent", Count: 10, LimitDate: "", ReceivedDate: "", IsReceived: false, IsAutoApply: true, IsHideHistory: false },
  { PresentID: 9003, Title: "Welcome", Text: "Spirits to unlock costumes", Content: "OID_FightSpirit_Wildcard", Count: 10, LimitDate: "", ReceivedDate: "", IsReceived: false, IsAutoApply: true, IsHideHistory: false },
];

// The client writes ReceivedDate as local "yyyy/MM/dd HH:mm" (PresentBoxGameData.cs:192).
function jstStamp(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function parseStateJson(profile: any, kind: string): any | null {
  const raw = profile ? (profile as any).states && (profile as any).states[kind] : undefined;
  if (typeof raw !== "string" || !raw) return null;
  try { return JSON.parse(raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")); } catch { return null; }
}

function presentInfosOf(profile: any): any[] {
  const obj = parseStateJson(profile, "present_box_game");
  return obj && Array.isArray(obj.PresentInfos) ? obj.PresentInfos : [];
}

function setPresentInfos(profile: any, list: any[]): void {
  if (!(profile as any).states) (profile as any).states = {};
  (profile as any).states.present_box_game = JSON.stringify({ DataVersion: 1, PresentInfos: list });
}

function normalizePlayerItems(obj: any): void {
  // 2026-11-03 A3 fix: the client serializes PlayerItemInfo.Count as [SerializeField]
  // m_count (PlayerItemInfo.cs), and JsonUtility drops unknown members. Entries written
  // before this fix used `Count`, which the client could not see and then overwrote.
  // Migrate on read so every stored entry speaks the client's spelling.
  for (const x of obj.Items) {
    if (!x) continue;
    if (x.m_count === undefined && x.Count !== undefined) x.m_count = Number(x.Count) || 0;
    if (x.m_count === undefined) x.m_count = 0;
    delete x.Count;
  }
}

function playerItemAdd(profile: any, itemID: number, count: number): { before: number; after: number } {
  const obj = parseStateJson(profile, "player_item") || { DataVersion: 2, Items: [] };
  if (!Array.isArray(obj.Items)) obj.Items = [];
  normalizePlayerItems(obj);
  // Same migration the client runs on load (PlayerItemGameData.cs:124-141): a v1
  // save without GachaTicket has its FightSpirit09+ ids shifted by one. Doing it
  // here keeps the counts we write pointed at the right ItemID.
  if (obj.DataVersion === 1 && !obj.Items.some((x: any) => Number(x && x.ItemID) === PI_GACHA_TICKET)) {
    for (const x of obj.Items) {
      if (Number(x && x.ItemID) >= 10) x.ItemID = Number(x.ItemID) + 1;
    }
  }
  obj.DataVersion = 2;
  let entry = obj.Items.find((x: any) => Number(x && x.ItemID) === itemID);
  const before = entry ? Number(entry.m_count) || 0 : 0;
  if (!entry) { entry = { ItemID: itemID, m_count: 0 }; obj.Items.push(entry); }
  entry.m_count = Math.max(0, before + Math.max(0, count));
  if (!(profile as any).states) (profile as any).states = {};
  (profile as any).states.player_item = JSON.stringify(obj);
  return { before, after: entry.m_count };
}

function playerItemCount(profile: any, itemID: number): number {
  const obj = parseStateJson(profile, "player_item");
  const entry = obj && Array.isArray(obj.Items) ? obj.Items.find((x: any) => Number(x && x.ItemID) === itemID) : null;
  return entry ? Number(entry.m_count ?? entry.Count) || 0 : 0;
}

// Grant every pending auto-apply present once, server-side, and mark it received
// in the stored box so it is never offered again.
function autoApplyPresentInfos(profile: any): { granted: Array<{ pid: number; content: string; count: number; item_id: number; count_after: number }>; changed: boolean } {
  const granted: Array<{ pid: number; content: string; count: number; item_id: number; count_after: number }> = [];
  if (!profile) return { granted, changed: false };
  const list = presentInfosOf(profile);
  if (!list.length) return { granted, changed: false };
  let changed = false;
  for (const p of list) {
    if (!p || (p as any).IsReceived === true || (p as any).IsAutoApply !== true) continue;
    const content = String((p as any).Content || "");
    const itemID = PRESENT_CONTENT_TO_ITEMID[content];
    if (itemID === undefined) continue; // client-side item: its receipt comes from present_done
    const count = Math.max(0, Number((p as any).Count) || 0);
    const res = playerItemAdd(profile, itemID, count);
    (p as any).IsReceived = true;
    (p as any).ReceivedDate = String((p as any).ReceivedDate || "") || jstStamp();
    granted.push({ pid: Number((p as any).PresentID) || 0, content, count, item_id: itemID, count_after: res.after });
    changed = true;
  }
  if (changed) setPresentInfos(profile, list);
  return { granted, changed };
}

function logGranted(profile: any, granted: any[]): void {
  for (const g of granted) {
    vlog(`[VFG] present auto-applied mid=${(profile as any).player_id} pid=${g.pid} content=${g.content} x${g.count} -> item_id=${g.item_id} now=${g.count_after}`);
  }
}

// Append any missing welcome presents. Returns true when the profile changed.
function seedWelcomePresents(profile: any): boolean {
  if (!profile || (profile as any).welcome_gifts) return false;
  const list = presentInfosOf(profile);
  const have = new Set(list.map((p: any) => Number((p as any)?.PresentID)));
  let added = false;
  for (const w of WELCOME_PRESENTS) {
    if (!have.has(w.PresentID)) { list.push({ ...w }); added = true; }
  }
  (profile as any).welcome_gifts = true;
  setPresentInfos(profile, list);
  if (added) vlog(`[VFG] seeded welcome presents mid=${(profile as any).player_id}`);
  return true;
}

// Server-side record of what this account received. Two uses: the present_done
// receipt (the client never saves its box) and the duplicate check on the next
// gacha pull (the client only writes customize_item after it applies a draw).
function markPresentsReceived(profile: any, pids: number[]): { marked: number[]; unknown: number[] } {
  const list = presentInfosOf(profile);
  const byId = new Map<number, any>();
  for (const p of list) byId.set(Number((p as any)?.PresentID) || 0, p);
  const marked: number[] = [];
  const unknown: number[] = [];
  for (const pid of pids) {
    const info = byId.get(pid);
    if (!info) { unknown.push(pid); continue; }
    if (info.IsReceived !== true) {
      info.IsReceived = true;
      info.ReceivedDate = String(info.ReceivedDate || "") || jstStamp();
      marked.push(pid);
    }
  }
  if (marked.length) setPresentInfos(profile, list);
  return { marked, unknown };
}

function receivedPresentInfo(profile: any, pid: number): any | null {
  const list = presentInfosOf(profile);
  return list.find((p: any) => (Number((p as any)?.PresentID) || 0) === pid) || null;
}

function grantLedgerOf(profile: any): string[] {
  const raw = profile ? (profile as any).gacha_granted : undefined;
  return Array.isArray(raw) ? raw.map((x: any) => String(x)) : [];
}

function rememberGachaGrants(profile: any, oids: string[]): void {
  if (!profile || !oids.length) return;
  const cur = grantLedgerOf(profile);
  const seen = new Set(cur);
  for (const oid of oids) {
    const o = String(oid || "").trim().toUpperCase();
    if (!o || seen.has(o)) continue;
    cur.push(o);
    seen.add(o);
  }
  (profile as any).gacha_granted = cur.slice(-800);
}

// Everything this account already owns as a cutin: the client's customize_item
// state (ItemID ints), the free default cutins every account owns
// (CutinItemMaster.GetDefaultItemIDs), and what this server already granted.
function ownedCutinOids(profile: any): Set<string> {
  const out = new Set<string>();
  const cust = parseStateJson(profile, "customize_item");
  const cutins = cust && Array.isArray(cust.CutinItems) ? cust.CutinItems : [];
  for (const x of cutins) {
    const raw = (x && typeof x === "object") ? (x as any).ItemID : x;
    const oid = cutinOidOf(Number(raw));
    if (oid) out.add(oid.toUpperCase());
  }
  for (const id of CUTIN_DEFAULT_ITEM_IDS) {
    const oid = cutinOidOf(id);
    if (oid) out.add(oid.toUpperCase());
  }
  for (const oid of grantLedgerOf(profile)) {
    const key = String(oid || "").trim().toUpperCase();
    if (key && cutinItemIdOf(key) !== null) out.add(key);
  }
  return out;
}

// Grant a girl's unlock in the server's own player_game copy when a draw hands
// out her dedicated unlock cutin (gacha_pools.json chara_unlock_items, i.e.
// GachaUtility.CharaUnlockItemIDDict: Chara12-21 via OID_NNAgariSR01). This is
// the server doing what the client does on the same draw
// (GachaResultInfo.cs:134-139), and it is the only place this plugin touches
// GachaCharaUsableList: adding, never taking away. Returns the CharaType index
// it added, or null when nothing changed.
function grantGachaUnlockOnDraw(profile: any, oid: string): number | null {
  const ch = CHARA_UNLOCK_OID_TO_CHARA[String(oid || "").trim().toUpperCase()];
  if (ch === undefined || !profile) return null;
  const raw = (profile as any).states ? (profile as any).states.player_game : undefined;
  if (typeof raw !== "string" || !raw) {
    // No player_game copy of this account on the server yet (the client has not
    // written one). Queue the unlock instead of inventing a client-owned state
    // document: mergePendingGachaUnlocks folds it into the next player_game
    // write, so a grant is never lost.
    const pending: number[] = Array.isArray((profile as any).gacha_unlock_pending)
      ? (profile as any).gacha_unlock_pending.map((x: any) => Number(x)).filter((x: number) => Number.isInteger(x))
      : [];
    if (pending.indexOf(ch) >= 0) return null;
    pending.push(ch);
    (profile as any).gacha_unlock_pending = pending.slice(-32);
    try { vlog(`[VFG] gacha unlock queued chara=${ch} by ${oid} mid=${(profile as any).player_id} (no player_game state yet)`); } catch { }
    return ch;
  }
  let pg: any = null;
  try { pg = JSON.parse(raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")); } catch { }
  if (!pg || typeof pg !== "object") return null;
  const list: number[] = Array.isArray(pg.GachaCharaUsableList)
    ? pg.GachaCharaUsableList.map((x: any) => Number(x)).filter((x: number) => Number.isInteger(x))
    : [];
  if (list.indexOf(ch) >= 0) return null;
  list.push(ch);
  list.sort((a: number, b: number) => a - b);
  pg.GachaCharaUsableList = list;
  (profile as any).states.player_game = JSON.stringify(pg);
  try { vlog(`[VFG] gacha unlock granted chara=${ch} by ${oid} mid=${(profile as any).player_id}`); } catch { }
  return ch;
}

// Add the queued unlocks to the player_game document the client just wrote.
// Additions only: the client's list is its own unlock record, and this is the
// one place the server touches it besides the grant in the draw itself.
function mergePendingGachaUnlocks(profile: any, decoded: string): string {
  const pending = Array.isArray((profile as any).gacha_unlock_pending) ? (profile as any).gacha_unlock_pending : [];
  if (!pending.length) return decoded;
  let obj: any = null;
  try { obj = JSON.parse(decoded); } catch { return decoded; }
  if (!obj || typeof obj !== "object") return decoded;
  const list: number[] = Array.isArray(obj.GachaCharaUsableList)
    ? obj.GachaCharaUsableList.map((x: any) => Number(x)).filter((x: number) => Number.isInteger(x))
    : [];
  let added = 0;
  for (const rawCh of pending) {
    const ch = Number(rawCh);
    if (Number.isInteger(ch) && list.indexOf(ch) < 0) {
      list.push(ch);
      added++;
    }
  }
  (profile as any).gacha_unlock_pending = [];
  if (!added) return decoded;
  list.sort((a: number, b: number) => a - b);
  obj.GachaCharaUsableList = list;
  try { vlog(`[VFG] merged ${added} queued gacha unlock(s) into player_game write mid=${(profile as any).player_id}`); } catch { }
  return JSON.stringify(obj);
}

// ---------------------------------------------------------------------------
// music_gacha: the server authors this state, and it owns the pull lifecycle
// ---------------------------------------------------------------------------
// Why this has to be server-side, from the client code:
//  - music_gacha is a READ-ONLY state for the client. ClientStateRead.cs:171-172
//    loads it into GameDataManager.MusicGacha (GameDataManager.cs:406-408) and the
//    only request that asks for it is ExecLoadAtGacha (GameDataManager.cs:275-287),
//    called on card entry and again after every pull (MusicGachaPlay.cs:82). There
//    is no ClientStateWrite call site for "music_gacha" anywhere in the client
//    (PlayerItemGameData/PlayerGameData/CustomizeGameData/... are the only writers),
//    so a state the server does not author is a state the account never has.
//  - What the client builds out of it: the series counter "PossessionCount /
//    GachaSupplyCount" (GachaSelectFlow.cs:894-907), the pull button, which locks
//    when IsAllItemPossession(SeriesID) says the series is complete
//    (GachaSelectFlow.cs:811 -> MusicGachaGameData.cs:19-22), the Kind.MusicGachaComp
//    missions, which read IsComplete for series <=92 and PossessionCount above it
//    (MissionFlow.cs:243-266), and card entry, which re-adds every
//    PossessionItemOIDs entry through ItemUtility.AddItem (CardEntryScene.cs:991 ->
//    MusicGachaGameData.cs:40-49).
function musicInfosOf(profile: any): any[] {
  const obj = parseStateJson(profile, "music_gacha");
  return obj && Array.isArray(obj.MusicGachaInfos) ? obj.MusicGachaInfos : [];
}

function setMusicInfos(profile: any, infos: any[]): void {
  if (!(profile as any).states) (profile as any).states = {};
  (profile as any).states.music_gacha = JSON.stringify({ DataVersion: 1, MusicGachaInfos: infos });
}

// Author the state for this profile: every advertised music series, with what the
// account owns. Idempotent - it rebuilds from what the state already records plus
// anything the grant ledger shows for that series (pulls a legacy profile made before
// this existed are not offered back to it), backfills a series the state is missing,
// and reports "changed" only when the document really differs. OIDs outside a series
// pool are dropped: the pool IS that series' supply and GachaSupplyCount is its size,
// so a stray entry would render a counter the account can never complete.
function seedMusicGachaState(profile: any): boolean {
  if (!profile) return false;
  const owned = new Map<number, string[]>();
  for (const info of musicInfosOf(profile)) {
    const gid = Number((info as any)?.GachaID);
    if (!Number.isInteger(gid)) continue;
    const oids = Array.isArray((info as any).PossessionItemOIDs)
      ? (info as any).PossessionItemOIDs.map((x: any) => String(x))
      : [];
    owned.set(gid, oids);
  }
  const ledger = grantLedgerOf(profile);
  if (ledger.length) {
    for (const [series, pool] of MUSIC_GACHA_POOL) {
      const up = new Set(pool.map((o: string) => String(o).toUpperCase()));
      const cur = owned.get(series) || [];
      const keys = new Set(cur.map((o: string) => String(o).toUpperCase()));
      for (const oid of ledger) {
        const key = String(oid || "").trim().toUpperCase();
        if (key && up.has(key) && !keys.has(key)) { keys.add(key); cur.push(key); }
      }
      if (cur.length) owned.set(series, cur);
    }
  }
  const rebuilt = musicGachaSeedState(owned);
  const current = (profile as any).states ? (profile as any).states.music_gacha : undefined;
  if (typeof current === "string" && current && current === rebuilt) return false;
  (profile as any).states = (profile as any).states || {};
  (profile as any).states.music_gacha = rebuilt;
  const n = musicInfosOf(profile).reduce((a: number, x: any) => a + ((x && x.PossessionItemOIDs) ? x.PossessionItemOIDs.length : 0), 0);
  vlog(`[VFG] authored music_gacha mid=${(profile as any).player_id} series=${MUSIC_GACHA_POOL.size} owned=${n}${typeof current === "string" && current ? " (rebuilt)" : " (seeded)"}`);
  return true;
}

// Author one of the server-owned state kinds (utils.ts SERVER_OWNED_STATE_KINDS).
// notice_game / receive_only are content this server owns (data/notices.json minus
// the ids this profile has acked), and the competition records are the empty
// account record for a server that runs no competition. Rebuilt on every read and
// only written when it actually differs, the same rule seedMusicGachaState follows.
function seedServerOwnedState(profile: any, kind: string): boolean {
  if (!profile) return false;
  const rebuilt = serverOwnedStateJson(kind, profile);
  if (rebuilt == null) return false;
  const states = (profile as any).states || ((profile as any).states = {});
  const current = states[kind];
  if (typeof current === "string" && current === rebuilt) return false;
  states[kind] = rebuilt;
  vlog(`[VFG] authored ${kind} mid=${(profile as any).player_id}${typeof current === "string" && current ? " (rebuilt)" : " (seeded)"}`);
  return true;
}

// The server-owned ownership record for one series: the possession list the server
// wrote, plus (for profiles predating this) anything the grant ledger already shows
// for that series. Case-insensitive on lookup, canonical spelling on store.
function ownedMusicOids(profile: any, series: number): Set<string> {
  const owned = new Set<string>();
  for (const info of musicInfosOf(profile)) {
    if (Number((info as any)?.GachaID) !== Number(series)) continue;
    for (const oid of ((info as any).PossessionItemOIDs || [])) {
      const key = String(oid || "").trim().toUpperCase();
      if (key) owned.add(key);
    }
  }
  const pool = MUSIC_GACHA_POOL.get(Number(series)) || [];
  if (pool.length) {
    const up = new Set(pool.map((o: string) => String(o).toUpperCase()));
    for (const oid of grantLedgerOf(profile)) {
      const key = String(oid || "").trim().toUpperCase();
      if (key && up.has(key)) owned.add(key);
    }
  }
  return owned;
}

// Record one granted item in the server's own state and keep the derived numbers
// the client renders/branches on in step with the list (PossessionCount, IsComplete).
function recordMusicGain(profile: any, series: number, oid: string): void {
  if (!profile) return;
  const pool = MUSIC_GACHA_POOL.get(Number(series)) || [];
  const canonical = pool.find((o: string) => String(o).toUpperCase() === String(oid).toUpperCase()) || String(oid);
  const infos = musicInfosOf(profile);
  let info = infos.find((x: any) => Number((x as any)?.GachaID) === Number(series));
  if (!info) {
    info = { GachaID: Number(series), IsComplete: false, PossessionCount: 0, GachaSupplyCount: pool.length, PossessionItemOIDs: [] };
    infos.push(info);
  }
  if (!Array.isArray(info.PossessionItemOIDs)) info.PossessionItemOIDs = [];
  const key = String(oid).toUpperCase();
  if (!info.PossessionItemOIDs.some((o: string) => String(o).toUpperCase() === key)) {
    info.PossessionItemOIDs.push(canonical);
  }
  info.GachaSupplyCount = pool.length || info.PossessionItemOIDs.length;
  info.PossessionCount = info.PossessionItemOIDs.length;
  info.IsComplete = pool.length > 0 && info.PossessionCount >= pool.length;
  setMusicInfos(profile, infos);
}

// The reserve -> play ticket lives on the profile, not in a process-global map:
// it is what ties a play to the account that reserved it, it survives a restart,
// and consuming it is what makes a replayed request_id fail. A ticket a client
// reserved and never spent (the player walked out of the consume dialog) is only
// good for MUSIC_RESERVE_TTL_SECONDS, so an old id cannot be cashed in later.
const MUSIC_RESERVES_MAX = 8;
const MUSIC_RESERVE_TTL_SECONDS = 30 * 60;

function takeMusicReserve(profile: any, requestId: number): { series: number } | null {
  const raw = Array.isArray((profile as any).music_gacha_reserves) ? (profile as any).music_gacha_reserves : [];
  const live = raw.filter((r: any) => nowUnix() - Number((r as any)?.at || 0) <= MUSIC_RESERVE_TTL_SECONDS);
  (profile as any).music_gacha_reserves = live;
  const idx = live.findIndex((r: any) => Number((r as any)?.id) === Number(requestId));
  if (idx < 0) return null;
  const rec = live[idx];
  live.splice(idx, 1);
  return { series: Number((rec as any)?.series) || 0 };
}

// Append a log the client reported to the profile document. These endpoints
// used to answer code 0 and drop the payload.
function appendProfileLog(profile: any, bucket: string, entry: any): void {
  if (!profile) return;
  const key = bucket;
  const raw = (profile as any)[key];
  const list = Array.isArray(raw) ? raw : [];
  list.push(entry);
  (profile as any)[key] = list.slice(-400);
}

// ---------------------------------------------------------------------------
// AOG handlers - each sends xml via ctx.res
// ---------------------------------------------------------------------------

// Every AOG answer goes through sendXml, so a WeakSet of response objects is
// the one place that knows whether a request has already been answered. Both
// dispatch paths can answer a request twice: the core middleware retries the
// registered fallback when the first call throws
// (AogMiddleware.ts:67-76 `try { fb(form, ctx) } catch { fb(ctx) }`) and its
// outer catch sends its own empty success after a handler threw
// (AogMiddleware.ts:82-87). A second `res.send` on an express res that already
// flushed throws ERR_HTTP_HEADERS_SENT inside the middleware's own catch, and
// the request then ends with no bytes at all. One answer per response object.
const AOG_ANSWERED: WeakSet<object> = new WeakSet<object>();

export function aogAnswered(res: any): boolean {
  if (!res) return true; // nothing to answer to
  if (AOG_ANSWERED.has(res)) return true;
  try { if ((res as any).headersSent) return true; } catch { }
  try { if ((res as any).sent) return true; } catch { } // plugin's own http.ServerResponse adapter
  return false;
}

export function aogEmptySuccess(): string {
  return xml_response();
}

function sendXml(ctx: any, xml: string): void {
  const res = ctx && (ctx as any).res;
  if (!res) return;
  if (aogAnswered(res)) {
    try { vlog(`[VFG] sendXml skipped: response already answered`); } catch { }
    return;
  }
  AOG_ANSWERED.add(res);
  try {
    res.set("Content-Type", "text/xml; charset=utf-8");
    res.send(xml);
  } catch {
    try { res.send(xml); } catch { }
  }
}

// The account a login-chain request belongs to, or none. A pcuid this server
// never issued is as dead as one a re-login superseded, and both are answered
// with the protocol session-lost code without touching a profile. The
// evicted-sessions-only check this replaces let a never-issued pcuid through,
// and the posted-mid fallback behind it then served - and overwrote - whichever
// account the request named (utils.ts sessionProfile: identity is the session).
//
// Used on the soft login-chain endpoints only (get_menudata / client_state_read /
// client_state_write / player_record / keep_alive are every one of them called
// with enableErrorScreenTransition:false, GameDataManager.cs:135-160,
// BreakTimeWindow.cs:231), so a client whose session is gone takes its re-login
// path instead of silently playing on as GUEST with every save dropped. Endpoints
// the client calls with the error screen armed - present_done
// (PresentBoxGameData.cs:215 posts it with no flags, and RequestApiBase.cs:35
// defaults enableErrorScreenTransition to true) and the item / notice log acks -
// keep answering code 0 and simply do not persist against an account they cannot
// resolve. Match endpoints (entry_game/gget/gpost/end_game/reconnect) keep
// answering as before: their seat state is keyed by pcuid, not by the login session.
async function sessionAccount(ctx: any, pcuid: string, tag: string): Promise<any | null> {
  let p: any = null;
  try { p = await sessionProfile(pcuid); } catch { p = null; }
  if (p) return p;
  vlog(`[VFG] ${tag} no account behind pcuid=${String(pcuid || "-").slice(0, 12)}... -> serv_st ${SERV_ST_SESSION_LOST} (relogin)`);
  sendXml(ctx, xml_error(SERV_ST_SESSION_LOST));
  return null;
}

export async function handle_appli_boot(form: Record<string, string>, ctx: any): Promise<void> {
  const base = gameBaseUrl(ctx?.req ? (ctx.req as any).headers?.host : undefined);
  // try to get host from req
  let url = "http://127.0.0.1:8083/aog";
  try {
    const host = ctx?.req?.hostname || ctx?.req?.headers?.host || "127.0.0.1";
    let port = PORT;
    try { if (CONFIG && CONFIG.port) port = CONFIG.port; } catch { }
    url = `http://${String(host).split(":")[0]}:${port}/aog`;
  } catch { url = gameBaseUrl(); }
  const xml = xml_response(
    "<server_setting><mask_ac_link_scene>0</mask_ac_link_scene><reviewed_version>false</reviewed_version></server_setting>" +
    `<boot_mes><status>0</status><moserv_url>${xml_escape(url)}</moserv_url><message>0</message></boot_mes>`
  );
  sendXml(ctx, xml);
}

export async function handle_appli_info(form: Record<string, string>, ctx: any): Promise<void> {
  const xml = xml_response(
    "<expire_seconds>3600</expire_seconds>" +
    infoData("events", eventsJson()) +
    infoData("pro_stats", proStatsJson())
  );
  sendXml(ctx, xml);
}

export async function handle_login(form: Record<string, string>, ctx: any): Promise<void> {
  const guest = formGet(form, "guest") === "1";
  // Accept every refid spelling the client may use; login and create_player
  // MUST resolve to the same normalized refid or names/states fork.
  const rawId = formGet(form, "user_id", "dataid", "refid", "ref_id") || "GUEST";
  const userId = String(rawId).trim().toUpperCase() || "GUEST";
  // A user_id shaped like the removed orphan fork ("MID" + the mid, padStart to a
  // minimum of 8 digits: MID00998877 for a 6-digit mid, MID1793446050 for a
  // 10-digit one; utils.ts PHANTOM_REFID_RE) is refused here, before anything is
  // adopted or minted. Login.cs:20 posts user_id=Account.DataID as free text, so
  // /login is the endpoint that makes such a document: measured on the deployment's
  // own savedata before this fix (tmp/p9repro/out_deploy_pre_unseeded.txt section 3),
  // login user_id=MID1793446050 answered code 0 with a session_id and CREATED the
  // row, and every session-keyed handler behind it (dojo_set_slot,
  // cutin_gacha_play_draw, music_gacha_play_reserve, set_favorite_character) resolves
  // through getProfileBySession, which answered that document - one pcuid that was at
  // once "no account" and a writable account. The rows the old exactly-8 pattern did
  // recognise (MID00998877 in the same savedata) were already refused here pre-fix;
  // the hole was every digit count the pattern did not name.
  // The mint guard is one step wider than the recognising (utils.ts
  // isMintForbiddenRefid: MID + digits at any length) because minting the near-miss
  // variants is the same hole: /login would otherwise create MID1234567 as a fresh
  // account out of a posted string. ensureProfile refuses the same shapes a step
  // behind this, for every other caller.
  // The refusal is the client's recoverable path: /login is posted with
  // enableErrorScreenTransition:false (GameDataManager.cs:139) and
  // ExecLoadAtCardEntry catches the NetworkResponseException (:168-173) into
  // ENTRY_NETWORK_ERROR, so no session_id is ever issued for it.
  if (isMintForbiddenRefid(userId)) {
    vlog(`[VFG] login refused user_id=${userId}: MID-prefixed refid is not an account (orphan-fork shape) -> serv_st ${SERV_ST_ACCOUNT_NOT_FOUND} (no session issued)`);
    sendXml(ctx, xml_error(SERV_ST_ACCOUNT_NOT_FOUND));
    return;
  }
  const session = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  // Never write "PLAYER" as profile.name here: that masked real registrations
  // (DB showed name=PLAYER forever, real name only inside states). Login only
  // rotates the session; create_player owns the name.
  const profile = await ensureProfile(userId, "GUEST");
  if (!profile) {
    vlog(`[VFG] login could not resolve an account for user_id=${userId} -> serv_st ${SERV_ST_ACCOUNT_NOT_FOUND} (no session issued)`);
    sendXml(ctx, xml_error(SERV_ST_ACCOUNT_NOT_FOUND));
    return;
  }
  // Rotating the session is the account holder's act, not whoever-posted-the-
  // refid's. Login.cs:20 posts user_id=Account.DataID with bypass_auth=true and
  // no credential, and the session_id answered here (Login.cs:31) is the pcuid
  // every later request carries - so an unauthenticated login for an account that
  // HAS a credential (profile.card_id, from the eamuse card flow) is a takeover:
  // it retires the pcuid the real player is playing on (tombstoneSessionOnProfile
  // below, durable on the profile document, so the eviction outlives a core
  // restart) and hands the account's whole state set to the caller. Refused
  // before a session is minted, before anything is retired, before a single
  // profile field is touched. See utils.ts accountAuthPolicy/loginGate for the
  // gate, its windows and the trust model it records. /login is posted with
  // enableErrorScreenTransition:false (GameDataManager.cs:139) and
  // ExecLoadAtCardEntry catches the failure into ENTRY_NETWORK_ERROR (:168-173),
  // so the refusal is the client's recoverable path, not an error screen.
  const gate = loginGate(profile);
  if (!gate.ok) {
    accountGateEvent("REFUSED", profile, gate, `user_id=${userId} -> serv_st ${SERV_ST_ACCOUNT_NOT_FOUND} (no session issued, no session retired, profile untouched)`);
    sendXml(ctx, xml_error(SERV_ST_ACCOUNT_NOT_FOUND));
    return;
  }
  // Spend the presentation this login is authorised by (utils.ts
  // cardCredentialUsable/consumeCardCredential): one card scan authorises one
  // login, so the stamp never sits open for VFG_CARD_AUTH_WINDOW as a bearer
  // token for the next caller who knows the refid. The card holder's next entry
  // re-mints it at cardmng. Persisted by the saveProfile below.
  consumeCardCredential(profile);
  const prevSession = String((profile as any).session_id || "");
  (profile as any).session_id = session;
  // When this session started, for utils.ts sessionIdleSeconds after a restart:
  // the in-memory activity map is gone, the document is not.
  (profile as any).session_at = nowUnix();
  (profile as any).is_guest = guest;
  if (prevSession && prevSession !== session) {
    // Write the eviction itself onto the profile document (utils.ts
    // tombstoneSessionOnProfile). The in-memory EVICTED_SESSIONS map is only
    // the read cache: a superseded pcuid has to stay dead after this process
    // is gone, and if the retirement is only memory the retired session is
    // again just a lookup key the moment the core restarts. saveProfile below
    // persists it, so the tombstone lands in the same document write.
    tombstoneSessionOnProfile(profile, prevSession);
  }
  // saveProfile also updates the in-memory cache (and evicts the old pcuid)
  await saveProfile(profile.refid, profile);
  if (prevSession && prevSession !== session) {
    // The client still holding prevSession is now a stale session: the handlers
    // answer it with SERV_ST_SESSION_LOST instead of code 0 + GUEST/mid 1 so it
    // can re-login (utils.ts EVICTED_SESSIONS over profile.evicted_sessions).
    // This is the takeover eviction, and it is logged always (utils.ts
    // accountGateEvent): who the account is, when it happened, which pcuid died
    // and which rule of the account boundary let the new login through.
    accountGateEvent(
      "TAKEOVER", profile, gate,
      `retired_session=${prevSession.slice(0, 8)}... granted_session=${session.slice(0, 8)}... (the retired pcuid is dead on the profile document; that client must relogin)`,
    );
  }
  // Daily login bonus (the client has no daily system): once per JST day,
  // append an auto-apply present. last_daily + the dated PresentID make the
  // grant itself exactly-once; autoApplyPresentInfos below makes the RECEIPT
  // exactly-once too.
  try {
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    let dirty = false;
    if ((profile as any).last_daily !== today) {
      const pid = 91000000 + Number(today.slice(2).replace(/-/g, ""));
      const list = presentInfosOf(profile);
      if (!list.some((p: any) => Number((p as any)?.PresentID) === pid)) {
        list.push({ PresentID: pid, Title: "Daily Bonus", Text: "Daily login bonus", Content: "OID_CharaExpUpPresent", Count: 3, LimitDate: "", ReceivedDate: "", IsReceived: false, IsAutoApply: true, IsHideHistory: false });
        setPresentInfos(profile, list);
      }
      (profile as any).last_daily = today;
      dirty = true;
      vlog(`[VFG] daily bonus mid=${(profile as any).player_id} day=${today}`);
    }
    // The auto-apply income is granted here, on the server, and receipted in the
    // same write. The client can never persist its box (PresentBoxGameData.Save
    // is never called), so this is where the receipt has to live.
    const applied = autoApplyPresentInfos(profile);
    if (applied.changed) {
      dirty = true;
      logGranted(profile, applied.granted);
    }
    if (dirty) await saveProfile(profile.refid, profile);
  } catch { }
  vlog(`[VFG] login refid=${userId} guest=${guest} mid=${(profile as any).player_id} session=${session.slice(0, 8)}... auth=${gate.reason} keys=${Object.keys(form).join(",")}`);
  const xml = xml_response(`<auth><session_id>${session}</session_id></auth>`);
  sendXml(ctx, xml);
}

export async function handle_logout(form: Record<string, string>, ctx: any): Promise<void> {
  // Logout.cs:16 posts pcuid=<AppSessionID> and GameoverFlow.cs:88 sends it when the
  // play ends (enableErrorScreenTransition:false). Retiring the session is the
  // holder's own act, and it is what makes the account honestly idle: utils.ts
  // loginGate will not let an unauthenticated login take over a session that is
  // still live, so a lane that ended cleanly can log straight back in and only a
  // killed one has to wait out VFG_SESSION_TAKEOVER_GRACE.
  const pcuid = formGet(form, "pcuid");
  let p: any = null;
  try { p = await sessionProfile(pcuid); } catch { p = null; }
  if (p) {
    tombstoneSessionOnProfile(p, pcuid);
    (p as any).session_id = "";
    await saveProfile((p as any).refid, p);
    vlog(`[VFG] logout retired session ${String(pcuid).slice(0, 8)}... of refid=${(p as any).refid} (no live session on the account now)`);
  }
  const xml = xml_response();
  sendXml(ctx, xml);
}

// The web front's presenter call (docs/28 hosting plan): "this account's web
// session was just verified, its own DataID is the card credential". It binds
// the credential the first time and stamps the presentation every time, so
// the /login the front relays right after passes the card branch of utils.ts
// loginGate - and a caller that skipped the web front and posted the DataID
// straight to /login does not. All rules live in utils.ts presentViaPresenter
// (secret, canonical id, card == own DataID); this handler is the wire around
// them. A refusal is the protocol's account-not-found code with the reason in
// a <msg> the front logs.
async function handle_vfg_card_present(form: Record<string, string>, ctx: any): Promise<void> {
  const refid = formGet(form, "refid");
  const cardid = formGet(form, "cardid");
  const secret = formGet(form, "presenter");
  let answer: { ok: boolean; bound: boolean; reason: string };
  try {
    answer = await presentViaPresenter(refid, cardid, secret);
  } catch (e: any) {
    answer = { ok: false, bound: false, reason: `presenter threw: ${e && e.message ? e.message : e}` };
  }
  if (!answer.ok) {
    console.log(`[VFG] card_present REFUSED refid=${refid || "?"}: ${answer.reason}`);
    sendXml(ctx, xml_error(SERV_ST_ACCOUNT_NOT_FOUND, `<msg>${xml_escape(answer.reason)}</msg>`));
    return;
  }
  sendXml(ctx, xml_response(`<presented><bound>${answer.bound ? 1 : 0}</bound></presented>`));
}

export async function handle_create_player(form: Record<string, string>, ctx: any): Promise<void> {
  const name = (formGet(form, "name", "player_name") || "PLAYER").trim() || "PLAYER";
  // profile.name is the name every other player sees (it feeds the friend/odekake
  // rows, the match seat and the haifu archive). The shipping client always posts
  // "PLAYER" here (GameDataManager.cs:135, CardEntryManager.cs:245/398) and the
  // real name arrives later through player_game.PlayerName - screened client-side
  // at NewRegistrationFlow.cs:243-263 and server-side by the state-write gate
  // (stateWriteTabooHit) - so screening this parameter closes the same door for a
  // caller that posts create_player directly. This is ENTRY screening (utils.ts
  // isTabooText: substring on every entry, so カス野郎 is caught by カス and cuntface
  // by cunt) - a NEW name entering the system, not a stored one being echoed back.
  // CreatePlayer is posted with
  // enableErrorScreenTransition:false (GameDataManager.cs:135), so the refusal is
  // ExecLoadAtCardEntry's ENTRY_NETWORK_ERROR path, not an ERROR_STOP screen.
  const tabooCreateName = isTabooText(name);
  if (tabooCreateName) {
    vlog(`[VFG] create_player refused name='${name.slice(0, 40)}': hits taboo word '${tabooCreateName}' (data/taboowords.json) - profile not created`);
    sendXml(ctx, xml_error(SERV_ST_STATE_INVALID));
    return;
  }
  let rawId = formGet(form, "user_id", "dataid", "refid", "ref_id");
  // The account the caller PROVES it is playing as: the pcuid resolves through the
  // session, the only identity in this plugin. Resolved whether or not a user_id
  // was posted, because "I hold this session" is the only credential-shaped thing
  // a create_player carries, and it must name the account the name is written to.
  let sessionRef = "";
  try {
    const sess = await getProfileBySession(formGet(form, "pcuid"));
    if (sess) sessionRef = normalizeRefid((sess as any).refid);
  } catch { }
  if (!rawId) {
    // Some clients send only pcuid+name: resolve refid via session so the
    // name lands on the SAME profile that login created (not a random fork).
    rawId = sessionRef;
  }
  if (!rawId) rawId = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  const userId = String(rawId).trim().toUpperCase();
  // Same rule as /login (see handle_login): a MID-prefixed refid is the shape of
  // the removed orphan fork, so registration may not mint one either - at any
  // digit count, which is the point of the wider mint guard. CreatePlayer is
  // posted with enableErrorScreenTransition:false (GameDataManager.cs:135), so the
  // refusal lands in ExecLoadAtCardEntry's catch, not an error screen.
  if (isMintForbiddenRefid(userId)) {
    vlog(`[VFG] create_player refused user_id=${userId}: MID-prefixed refid is not an account (orphan-fork shape) -> serv_st ${SERV_ST_ACCOUNT_NOT_FOUND}`);
    sendXml(ctx, xml_error(SERV_ST_ACCOUNT_NOT_FOUND));
    return;
  }
  // Registration is not the same act as a rename, and posting a refid proves
  // neither. The account behind this request is the one its session resolves to
  // (CreatePlayer.cs:19 posts no pcuid at all, so the shipping client's own
  // create_player never carries one) or the one whose credential was just
  // presented at the card flow. An account that does not exist yet is a
  // registration and registration owns the initial name; an account that exists
  // is only renamed by somebody who can name its owner. utils.ts nameWriteGate
  // is that test, and the measured bypass it closes is create_player
  // name=RenamedByStranger user_id=VICTIMCCC answering code 0 with the victim's
  // profile.name changed (tmp/audit_r2/adv3.cjs). A refusal answers
  // SERV_ST_ACCOUNT_NOT_FOUND: CreatePlayer is posted with
  // enableErrorScreenTransition:false (GameDataManager.cs:135,
  // CardEntryManager.cs:245/398), so it lands in the client's
  // ENTRY_NETWORK_ERROR / NetworkError path, not an ERROR_STOP screen.
  const existing = await getProfileByRefid(userId);
  const ownsSession = !!sessionRef && sessionRef === userId;
  const nameGate = existing
    ? nameWriteGate(existing, name, ownsSession)
    : { allow: true, write: true, reason: "new account: create_player owns the initial name" };
  if (!nameGate.allow) {
    vlog(`[VFG] create_player refused user_id=${userId} name='${name.slice(0, 40)}': ${nameGate.reason} -> serv_st ${SERV_ST_ACCOUNT_NOT_FOUND} (profile untouched)`);
    sendXml(ctx, xml_error(SERV_ST_ACCOUNT_NOT_FOUND));
    return;
  }
  // A name this caller may not write must not even reach ensureProfile's
  // GUEST -> name upgrade: pass the placeholder for an account that already
  // exists and let the gate below decide what its name becomes.
  const p = await ensureProfile(userId, existing ? "GUEST" : name);
  if (!p) {
    vlog(`[VFG] create_player could not resolve an account for user_id=${userId} -> serv_st ${SERV_ST_ACCOUNT_NOT_FOUND}`);
    sendXml(ctx, xml_error(SERV_ST_ACCOUNT_NOT_FOUND));
    return;
  }
  if (nameGate.write) {
    // Registration is explicit: store the chosen name (login never does).
    (p as any).name = name;
    // Also mirror into states.player_game.PlayerName if present, so menudata
    // and matching show the same name even for old clients.
    try {
      const st = (p as any).states || {};
      if (st.player_game && typeof st.player_game === "string" && st.player_game.includes("PlayerName")) {
        const obj = JSON.parse(st.player_game);
        if (obj && obj.PlayerName !== name) { obj.PlayerName = name; st.player_game = JSON.stringify(obj); }
      }
    } catch { }
  }
  await saveProfile(p.refid, p);
  vlog(`[VFG] create_player refid=${userId} ${nameGate.write ? `name=${name}` : `name kept=${(p as any).name}`} mid=${(p as any).player_id} auth=${nameGate.reason}`);

  const card = CARD_STORE_BY_REFID.get(userId);
  if (card) {
    card.bound = true;
    card.updated_at = nowUnix();
    try {
      const prof: any = await getProfileByRefid(userId);
      if (prof) {
        prof.card_bound = true;
        await saveProfile(userId, prof);
      }
    } catch (e) { try { console.error("saveProfile create_player error:", e); } catch {} }
  }

  const xml = xml_response();
  sendXml(ctx, xml);
}

export async function handle_get_menudata(form: Record<string, string>, ctx: any): Promise<void> {
  const pcuid = formGet(form, "pcuid");
  // The menu names the account the login session belongs to, or it is refused.
  // Answering mid=1/"GUEST" for a pcuid that resolves to nothing is what put a
  // client into a no-identity state every later client_state_write then failed
  // against while still looking like it saved, and it advertised mid 1 - a value
  // any caller can post - as the shape of "no account".
  const p = await sessionAccount(ctx, pcuid, "get_menudata");
  if (!p) return;
  const name = (p as any).name || "GUEST";
  const mid = Number((p as any).player_id || 1);
  // The menu is the other point where the client rebuilds its whole view, so
  // any auto-apply present still pending is granted once here, before the
  // states are read back.
  try {
    const applied = autoApplyPresentInfos(p);
    const seeded = seedMusicGachaState(p);
    if (applied.changed) logGranted(p, applied.granted);
    if (applied.changed || seeded) await saveProfile((p as any).refid, p);
  } catch { }
  const xml = xml_response(
    "<menudata>" +
    `<mpdata><mid>${mid}</mid><name>${xml_escape(name)}</name></mpdata>` +
    playmodeXml() +
    battleItemXml() +
    "</menudata>"
  );
  sendXml(ctx, xml);
}

export async function handle_keep_alive(form: Record<string, string>, ctx: any): Promise<void> {
  if (!await sessionAccount(ctx, formGet(form, "pcuid"), "keep_alive")) return;
  sendXml(ctx, xml_response());
}

export async function handle_client_state_read(form: Record<string, string>, ctx: any): Promise<void> {
  const pcuid = formGet(form, "pcuid");
  const one = formGet(form, "one_kind");
  // The session is the whole identity here. The two lines this replaced resolved
  // the account from the posted mid whenever the pcuid matched nothing, which
  // served a stranger's full state set (31-32 states for mid 10/11, player_game
  // with its PlayerName) to a caller holding a pcuid this server never issued.
  // mid is kept only as what the logs name the account by.
  const profile: any = await sessionAccount(ctx, pcuid, "client_state_read");
  if (!profile) return;
  const mid = Number((profile as any).player_id) || 0;

  // Present box work happens BEFORE this response is encoded: the client loads
  // its whole inventory out of these chunks, so the grant, the receipt and the
  // copies served back have to agree. Seed the welcome presents, then apply
  // whatever auto-apply is still pending exactly once.
  let healed = false;
  if (profile && (!one || one === "present_box_game")) {
    if (seedWelcomePresents(profile)) healed = true;
  }
  // music_gacha is the other state this server has to author. ExecLoadAtGacha asks
  // for it by one_kind on entry to the gacha scene (GameDataManager.cs:275-287), so
  // a legacy profile without the document is seeded right before it is served.
  if (profile && (!one || one === "music_gacha")) {
    if (seedMusicGachaState(profile)) healed = true;
  }
  // friend_game is the third state only this server writes (see the authoring note
  // under seedFriendGameState): seed it once if the profile has none, otherwise keep
  // the stored document and only re-check the flags on it.
  if (profile && (!one || one === "friend_game")) {
    if (await seedFriendGameState(profile)) healed = true;
  }
  // The rest of the server-owned kinds (utils.ts SERVER_OWNED_STATE_KINDS):
  // receive_only, notice_game and the four competition records. ClientStateRead.cs
  // can load every one of them (:102-197) and no client-side Save posts any of them
  // back, so they exist on an account only because this server wrote them.
  // notice_game / receive_only are re-authored from data/notices.json on every read
  // minus what this profile has acked, which is what makes a new notice appear and
  // an acknowledged one disappear for good.
  if (profile) {
    for (const kind of SERVER_OWNED_STATE_KINDS) {
      if (one && one !== kind) continue;
      if (seedServerOwnedState(profile, kind)) healed = true;
    }
  }
  const applied = profile ? autoApplyPresentInfos(profile) : { granted: [] as any[], changed: false };
  if (applied.changed) {
    healed = true;
    logGranted(profile, applied.granted);
  }

  const chunks: string[] = [];
  const states = (profile || {}).states || {};
  const items: Array<[string, string]> = one ? (states[one] ? [[one, states[one]]] : []) : Object.entries(states) as any;
  for (const [kind, payload] of items) {
    let sanitized = String(payload);
    let cleanStr = sanitized.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
    let isJson = false;
    try {
      JSON.parse(cleanStr);
      isJson = true;
    } catch {}

    if (isJson) {
      if (kind === "player_game") {
        try {
          let pg = JSON.parse(cleanStr);
          let modified = false;

          // The client serializes List<CharaType> with JsonUtility.ToJson,
          // which emits ints (11 = Chara12). Never serve "CharaXX" strings:
          // FromJson can't parse them and IsCharaSelectable() fails, which
          // locks previously unlocked gacha/exchange characters in My Room.
          const toCharaIdx = (x: any): number | null => {
            if (typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 20) return x;
            if (typeof x === "string") {
              const m = /^Chara(\d{1,2})$/.exec(x.trim());
              if (m) {
                const n = parseInt(m[1], 10) - 1;
                if (n >= 0 && n <= 20) return n;
              }
              const n = Number(x);
              if (Number.isInteger(n) && n >= 0 && n <= 20) return n;
            }
            return null;
          };
          const normalizeList = (arr: any): number[] => {
            const out: number[] = [];
            const seen = new Set<number>();
            for (const x of (arr || [])) {
              const n = toCharaIdx(x);
              if (n != null && !seen.has(n)) { seen.add(n); out.push(n); }
            }
            return out;
          };
          if (Array.isArray(pg.GachaCharaUsableList)) {
            const norm = normalizeList(pg.GachaCharaUsableList);
            if (JSON.stringify(norm) !== JSON.stringify(pg.GachaCharaUsableList)) {
              pg.GachaCharaUsableList = norm;
              modified = true;
            }
          } else {
            pg.GachaCharaUsableList = [];
            modified = true;
          }
          if (Array.isArray(pg.PurchaseCharaList)) {
            const norm = normalizeList(pg.PurchaseCharaList);
            if (JSON.stringify(norm) !== JSON.stringify(pg.PurchaseCharaList)) {
              pg.PurchaseCharaList = norm;
              modified = true;
            }
          } else {
            pg.PurchaseCharaList = [];
            modified = true;
          }

          // Unlock proof is a REPORT, never a rewrite. GachaCharaUsableList is
          // the client's authoritative record of which girls the account
          // unlocked (GameDataManager.IsCharaSelectable reads exactly this
          // list, GameDataManager.cs:760-796), and the client adds to it on
          // gacha AND on cutin exchange (GachaResultInfo.cs:134-139,
          // CutinItemExchange/ConfirmWindow.cs:175-178) before it writes the
          // state back. Recomputing it here from whatever customize_item copy
          // this read happens to see revoked girls the account had legitimately
          // unlocked - a read landing between the draw and the customize_item
          // write, an exchange grant, a re-granted present - which locked them
          // in My Room and disabled their banners' pull buttons
          // (IsGachaEnableFromChara). The server grants the unlock where it
          // hands the unlock cutin out: see grantGachaUnlockOnDraw.
          if (states["customize_item"]) {
            try {
              const cust = JSON.parse(String(states["customize_item"]).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ""));
              const cutins = new Set<number>();
              for (const x of (cust.CutinItems || [])) {
                const raw = (x && typeof x === "object") ? (x as any).ItemID : x;
                const n = typeof raw === "number" ? raw : Number(raw);
                if (Number.isInteger(n)) cutins.add(n);
              }
              const UNLOCK_ITEM_TO_CHARA: Record<number, number> = {176:11,206:12,247:13,279:14,305:15,338:16,386:17,411:18,439:19,493:20};
              const list = (pg.GachaCharaUsableList as number[]) || [];
              const proven = new Set<number>();
              for (const [itemStr, ch] of Object.entries(UNLOCK_ITEM_TO_CHARA)) {
                if (cutins.has(Number(itemStr))) proven.add(Number(ch));
              }
              const unproven = list.filter((ch: number) => !proven.has(ch));
              const missing = [...proven].filter((ch: number) => !list.includes(ch)).sort((a, b) => a - b);
              if (unproven.length || missing.length) {
                try {
                  vlog(`[VFG] gacha unlock report mid=${mid} usable=[${list}] unlock_cutin_owned_without_chara=[${missing.join(",")}] usable_without_unlock_cutin=[${unproven.sort((a, b) => a - b).join(",")}] (kept as stored)`);
                } catch { }
              }
            } catch {}
          }

          if (modified) {
            cleanStr = JSON.stringify(pg);
          }
        } catch {}
      }
      sanitized = cleanStr;
    } else if (cleanStr.trim().startsWith("{") || cleanStr.trim().startsWith("[")) {
      vlog(`[VFG] Skipping heavily corrupted JSON state '${kind}' for mid=${mid || "?"}`);
      continue;
    }
    // cc_request guard (see issue: populated m_ccInfos bricked continue):
    // never serve bytes the client can't load. Heal the stored copy so an
    // already-broken profile recovers on next continue instead of needing
    // manual Save.json surgery. Original is preserved in quarantine.
    if (kind === "cc_request" && profile) {
      try {
        const res = sanitizeCcRequest(sanitized);
        if (!res.ok || res.changed) {
          if (!(profile as any).quarantine_cc_request) {
            (profile as any).quarantine_cc_request = { at: nowUnix(), dropped: res.dropped, raw: String(sanitized).slice(0, 20000) };
          }
          if (!(profile as any).states) (profile as any).states = {};
          (profile as any).states[kind] = res.clean;
          healed = true;
          sanitized = res.clean;
          vlog(`[VFG] healed cc_request on read mid=${mid} dropped=${res.dropped} ok=${res.ok}`);
        }
      } catch { }
    }
    // A3 follow-through (2026-11-03): player_item used to be served with its
    // stored bytes as-is, so the 136 docs still spelled Count stayed invisible
    // to the client until some grant touched them. Normalize on the serve path
    // too and persist the migrated copy.
    if (kind === "player_item" && profile) {
      try {
        const pi = JSON.parse(String(sanitized).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ""));
        if (pi && Array.isArray(pi.Items)) {
          normalizePlayerItems(pi);
          const migrated = JSON.stringify(pi);
          if (migrated !== sanitized) {
            sanitized = migrated;
            if (!(profile as any).states) (profile as any).states = {};
            (profile as any).states[kind] = migrated;
            healed = true;
            vlog(`[VFG] normalized player_item on read mid=${mid} entries=${pi.Items.length}`);
          }
        }
      } catch { }
    }
    let b64 = "";
    try { b64 = Buffer.from(sanitized, "utf-8").toString("base64"); } catch { b64 = ""; }
    chunks.push(`<state kind="${xml_escape(kind)}"><data>${b64}</data></state>`);
  }
  if (applied.granted.length && !chunks.some(c => c.includes('kind="player_item"'))) {
    // A server-side grant must show up in the same response that marks the
    // present received: otherwise the client keeps the pre-grant inventory it
    // loaded earlier and its next player_item write drops the items.
    try {
      const b64 = Buffer.from(String(states["player_item"] || ""), "utf-8").toString("base64");
      if (b64) chunks.push(`<state kind="player_item"><data>${b64}</data></state>`);
    } catch { }
  }
  // friend_game is served out of the profile's stored document like every other
  // kind (seeded/flag-checked above). It used to be replaced here, on every read,
  // with a freshly synthesized list of all other profiles.
  if (healed && profile) {
    try { await saveProfile((profile as any).refid, profile); } catch { }
  }
  sendXml(ctx, xml_response(...chunks));
}

// ---------------------------------------------------------------------------
// friend_game / odekake
// ---------------------------------------------------------------------------
// friend_game has no client writer: FriendGameData.Save exists (FriendGameData.cs:21-26)
// and nothing in the assembly calls it, so the account's copy exists only if this server
// writes it (ClientStateRead.cs:168-169 -> GameDataManager.Apply:402-405, requested by
// one_kind at GameDataManager.cs:242-251). Authoring it is therefore required, but it is
// authored ONCE on the profile and stored - the same rule as music_gacha and the present
// box - and after that the read serves what is saved.
//
// IsUsable is computed, never asserted. My Room shows only usable entries
// (MyRoomFriendWindow.cs:27, MyRoomMainWindow.cs:145, HomeFlow.cs:501-504) and an entry
// leads to exactly one thing: MyRoomFlow.OdekakeDecide (MyRoomFlow.cs:184-205), which
// commits the borrow first (BeforeChara / OdekakeChara / SelectChara at :191-193) and then
// dereferences resultData.OdekakeInfo.CharaData.CostumeItemEquip at :196 with no null
// check. A listed-but-unservable lender leaves the account spending the session as a
// borrowed chara with no chara data behind it. So an entry is usable exactly when
// handle_odekake_done answers success 1 for it - both go through borrowableLender().
const CHARA_MAX = 20; // CharaType.Chara01..Chara21 (MFG.Types/CharaType.cs:3-26)

interface BorrowableLender {
  refid: string; mid: number; name: string; dan: number; chara: number;
  playerGame: string; customize: string;
}

function charaDataLength(profile: any): number | null {
  const pg = parseStateJson(profile, "player_game");
  const list = pg && Array.isArray(pg.CharaData) ? pg.CharaData : null;
  return list ? list.length : null;
}

// One lender, checked against what a borrow actually needs. `why` reports the reason a
// candidate was rejected, for the denial log and for auditing a friend list.
function borrowableLender(lender: any, viewer: any, why?: (reason: string) => void): BorrowableLender | null {
  const no = (reason: string): null => { if (why) why(reason); return null; };
  if (!lender) return no("no such profile");
  const refid = String((lender as any).refid || "").trim().toUpperCase();
  const mid = Number((lender as any).player_id || 0);
  if (!refid) return no("lender has no refid");
  // friendRowsForViewer walks a raw profile scan, not a resolver, so the phantom
  // refusal has to be here too: a document the orphan fork minted must never be
  // published as a lender to a real account, quarantined or not.
  if (isPhantomRefid(refid) || isQuarantinedProfile(lender)) return no("legacy MID phantom document is not an account and never a lender");
  if (!mid) return no("lender has no player_id: odekake_id cannot resolve to it");
  // PUBLISH CONSENT, before anything about the lender's data is looked at: an
  // account is a lender only if it published (utils.ts odekakePublished, backed by
  // profile.odekake_publish and data/odekake.json). The client has no way to say
  // this - FriendInfo.cs:7-20 is six fields, none of them a consent, and nothing in
  // MFG.GameRequest posts one - so it is server state, and it is private unless a
  // deployment says otherwise. Both sides of the feature run this one test: the row
  // a viewer is shown and the borrow that row answers go through borrowableLender,
  // so an unpublished account is neither published in friend_game nor servable.
  if (!odekakePublished(lender)) return no("lender has not published its character (no publish consent: profile.odekake_publish, data/odekake.json publish_default)");
  if (viewer && String((viewer as any).refid || "").toUpperCase() === refid) return no("lender is the viewer");
  const states = (lender as any).states || {};
  const pgRaw = typeof states.player_game === "string" ? states.player_game : "";
  const customize = typeof states.customize_item === "string" ? states.customize_item : "";
  if (!pgRaw) return no("lender has no player_game on the server");
  if (!customize) return no("lender has no customize_item on the server");
  const pg = parseStateJson(lender, "player_game");
  if (!pg || typeof pg !== "object") return no("lender player_game is not JSON");
  // What the borrow hands the client is CharaData[SelectChara] of the LENDER's document
  // (OdekakeDone.cs:38-42 -> PlayerGameData.cs:302-309), and that same index becomes the
  // borrower's SelectChara (MyRoomFlow.cs:192-193) - which the borrower's own account is
  // then read through (PlayerGameData.cs:308, HomeFlow.cs:458-459, MissionFlow.cs:171).
  const chara = Number(pg.SelectChara);
  if (!Number.isInteger(chara) || chara < 0 || chara > CHARA_MAX) return no(`lender SelectChara=${JSON.stringify(pg.SelectChara)}`);
  const lenderList = Array.isArray(pg.CharaData) ? pg.CharaData : null;
  if (!lenderList || !lenderList[chara]) return no(`lender CharaData has no entry for chara ${chara}`);
  const ownLen = charaDataLength(viewer);
  if (ownLen !== null && chara >= ownLen) return no(`viewer CharaData covers 0..${ownLen - 1}, not ${chara}`);
  let name = String((lender as any).name || "").trim();
  const pn = typeof pg.PlayerName === "string" ? pg.PlayerName.trim() : "";
  if (pn) name = pn;
  // A placeholder account is not a person: PLAYER/GUEST are the client's own unfilled
  // names (create_player owns the real one), and lending from the shared scratch
  // accounts is what put the GUEST dojo in the last audit.
  if (!name || name === "GUEST" || name === "PLAYER") return no(`placeholder name '${name}'`);
  let dan = 1;
  const d = Number(pg.m_danLevel);
  if (Number.isInteger(d) && d >= 0) dan = d;
  return { refid, mid, name, dan, chara, playerGame: pgRaw, customize };
}

// The two documents odekake_done answers with, built from the lender's states
// instead of copied out of them. OdekakeDone.cs:31-48 loads both and consumes
// exactly three things out of them: `CharaData[SelectChara]` of the served
// player_game (OdekakeDone.cs:41 -> PlayerGameData.cs:302-309), the customize
// document's item lists (MahjongPlayFlow.cs:1634-1638 feeds
// ApplyCustomizeItemEquip from `OdekakeCustomizeData.CustomizeItems` and takes the
// whole `CutinItems` list), and nothing else - PlayerGameData's own lists, records,
// dojo slots, dan, FightStar, YellRank, competition ids and any field a document
// happens to carry are not read on this path. So the borrow gets those three things
// and the lender's remaining save stays home.
//
// The CharaData list keeps its index: PlayerGameData.Validate() pads by APPENDING
// entries for the indices past the end (PlayerGameData.cs:475-486), CharaGameData's
// charaType is [NonSerialized] (CharaGameData.cs:32-33) so the list index IS the
// chara in JSON, and GetCurrentChara reads `CharaData[SelectChara]` (:308). Compacting
// the list to the one borrowed entry would move it off its index and the client would
// "succeed" into a padded default entry. The prefix is kept, blanked with `{}` entries
// that CharaGameData.OnAfterDeserialize fills with complete defaults
// (CharaGameData.cs:197-213, and the costume cross-check is skipped for CostumeItemEquip
// 0 at :223). DataVersion 14 is PlayerGameData.CurrentDataVersion (PlayerGameData.cs:28)
// because LoadFromJson feeds the parsed value into m_dataVersionCharaNum
// (PlayerGameData.cs:455-460/:371-378) and a value outside 1..14 throws there, inside
// MyRoomFlow's empty catch (MyRoomFlow.cs:200-202). customize_item keeps the five
// item lists and drops the TotalGacha* counters - spend history the borrow never reads.
function odekakeLenderPayload(lender: any, chara: number): { playerGame: string; customize: string } | null {
  const pg = parseStateJson(lender, "player_game");
  if (!pg || typeof pg !== "object") return null;
  const src = Array.isArray(pg.CharaData) ? pg.CharaData : null;
  if (!src || !src[chara] || typeof src[chara] !== "object") return null;
  const list: any[] = [];
  for (let i = 0; i < chara; i++) list.push({});
  list.push(src[chara]);
  const name = typeof pg.PlayerName === "string" ? pg.PlayerName : String((lender as any).name || "");
  const servedGame = { DataVersion: 14, PlayerName: name, SelectChara: chara, CharaData: list };
  const cust = parseStateJson(lender, "customize_item");
  if (!cust || typeof cust !== "object") return null;
  const servedCust: any = { DataVersion: Number.isInteger(cust.DataVersion) ? cust.DataVersion : 2 };
  for (const k of ["CustomizeItems", "CutinItems", "CostumeItems", "CatchphraseItems", "MatchingBGItems"]) {
    if (Array.isArray(cust[k])) servedCust[k] = cust[k];
  }
  return { playerGame: JSON.stringify(servedGame), customize: JSON.stringify(servedCust) };
}

// The lender rows this viewer could borrow right now, in FriendGameData shape.
// Field names stay PascalCase (Unity JsonUtility, FriendInfo.cs:7-20).
//
// A row is not the lender's identity pair. OdekakeDataID is the ticket this server
// issued for this (viewer, lender) pair (utils.ts issueOdekakeGrant), FriendID is
// empty because the client never reads it (FriendInfo.cs:11 has no reader anywhere in
// the assembly, and OdekakeDone's <id> is parsed into a field nothing consumes), and
// the lender's player_id / card refid are not put in the document at all - the
// refid's own prefix is what playerIdFromRefid turns into a mid, so publishing the
// pair published a guessable account number. What the viewer gets is a handle into
// its own grant table, which is the only thing odekake_done accepts.
async function friendRowsForViewer(viewer: any): Promise<any[]> {
  let all: any[] = [];
  try {
    // @ts-ignore
    all = await DB.Find(null, { collection: "profile" }) || [];
  } catch { return []; }
  const max = odekakePublishPolicy().max_lenders;
  const rows: any[] = [];
  for (const p of all) {
    // consent + servability, in that order, inside borrowableLender
    const b = borrowableLender(p, viewer);
    if (!b) continue;
    const grant = issueOdekakeGrant(viewer, b.refid);
    if (!grant) continue;
    rows.push({ OdekakeDataID: grant.ticket, FriendID: "", PlayerName: b.name, Dan: b.dan, IsUsable: true, CharaType: b.chara });
    if (rows.length >= max) break;
  }
  return rows;
}

// Seed once, then keep. A stored document is served as saved: the same rows, in the
// same order, nothing synthesized and no friend dropped from a list that still works.
// What gets corrected is what this server owns and can re-check - IsUsable, the row's
// grant number, and the descriptive fields of a row whose lender has moved (name / dan /
// chara of a live account, and the row must name the chara odekake_done will actually
// serve). "changed" is reported only when the stored document really differs, the same
// rule seedMusicGachaState follows.
//
// The row's OdekakeDataID is a grant ticket, not an account number, and a row is
// identified by the grant it carries (or, for documents this server wrote before the
// ticket existed, by the FriendID it stored) - never by the number in the row. The
// mid-keyed re-resolution this replaces (row.OdekakeDataID -> getProfileByPlayerId)
// was the second path where a stored number named an account, and it is what let a
// forged friend_game write turn a stranger into a usable lender.
async function seedFriendGameState(viewer: any): Promise<boolean> {
  if (!viewer) return false;
  const states = ((viewer as any).states = (viewer as any).states || {});
  // The account's own publish consent, recorded on its own document (never from
  // another account's read), so lending state is auditable and revocable per account.
  let changed = applyOdekakePublishConsent(viewer);
  const stored = typeof states.friend_game === "string" ? states.friend_game : "";
  let doc: any = null;
  if (stored) { try { doc = JSON.parse(stored); } catch { doc = null; } }
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.FriendInfos)) {
    const rows = await friendRowsForViewer(viewer);
    states.friend_game = JSON.stringify({ DataVersion: 1, FriendInfos: rows });
    pruneOdekakeGrants(viewer, rows.map((r: any) => {
      const g = findOdekakeGrant(viewer, Number(r?.OdekakeDataID) || 0);
      return g ? g.lender : "";
    }));
    vlog(`[VFG] authored friend_game mid=${(viewer as any).player_id} friends=${rows.length}${stored ? " (stored copy was not a friend list, rebuilt)" : " (seeded)"} publish=${odekakePublished(viewer) ? 1 : 0}`);
    return true;
  }
  for (const row of doc.FriendInfos) {
    if (!row || typeof row !== "object") { changed = true; continue; }
    const ticket = Number(row.OdekakeDataID || 0);
    let lenderRefid = "";
    const grant = findOdekakeGrant(viewer, ticket);
    if (grant) lenderRefid = grant.lender;
    else {
      // Migration for documents seeded before the grant table existed: those rows named
      // the lender by refid. The old OdekakeDataID there was the lender's mid, and a mid
      // resolves no account - it is re-keyed to a ticket below or the row is scrubbed.
      lenderRefid = String(row.FriendID || "").trim().toUpperCase();
    }
    let lender: any = null;
    try { if (lenderRefid) lender = await getProfileByRefid(lenderRefid); } catch { }
    let reason = "";
    const b = borrowableLender(lender, viewer, (r: string) => { reason = r; });
    let usable = !!b;
    if (row.IsUsable !== usable) {
      row.IsUsable = usable;
      changed = true;
      vlog(`[VFG] friend_game mid=${(viewer as any).player_id} entry ${lenderRefid || ticket} IsUsable=${usable ? 1 : 0}${usable ? "" : " (" + reason + ")"}`);
    }
    if (b) {
      // Keep the row describing the borrow it offers: the client borrows row.CharaType
      // (MyRoomFlow.cs:192) while odekake_done serves the lender's live SelectChara, and
      // the number the client posts back has to be this server's grant for that lender.
      const g = issueOdekakeGrant(viewer, b.refid);
      if (!g) { row.IsUsable = usable = false; changed = true; }
      else {
        if (Number(row.OdekakeDataID) !== g.ticket) { row.OdekakeDataID = g.ticket; changed = true; }
        if (String(row.FriendID || "") !== "") { row.FriendID = ""; changed = true; }
        if (Number(row.CharaType) !== b.chara) { row.CharaType = b.chara; changed = true; }
        if (String(row.PlayerName || "") !== b.name) { row.PlayerName = b.name; changed = true; }
        if (Number(row.Dan) !== b.dan) { row.Dan = b.dan; changed = true; }
      }
    } else if (ticket || String(row.FriendID || "")) {
      // A row that offers nothing keeps no identity: the number it used to carry (an
      // account mid in documents seeded before this change) and the lender's card refid
      // are taken back out of the viewer's savedata.
      row.OdekakeDataID = 0;
      row.FriendID = "";
      changed = true;
    }
  }
  // A document that offers nothing is not a friend list to preserve. An account that
  // read the game while nobody had published has an empty - or fully scrubbed -
  // stored list, and "seed once, then serve as saved" must not freeze that into
  // "never has a friend": with the consent gate off by default every existing
  // document would be empty the moment a deployment turns lending on. So when the
  // stored document has no servable row and the published set is not empty, it is
  // rebuilt from what is published now - the same heal-on-read a profile that
  // predates a server-authored state gets (seedMusicGachaState), and it settles after
  // one read because the rebuilt rows are servable.
  if (!doc.FriendInfos.some((r: any) => r && r.IsUsable)) {
    const fresh = await friendRowsForViewer(viewer);
    if (fresh.length) {
      doc.FriendInfos = fresh;
      changed = true;
      vlog(`[VFG] friend_game mid=${(viewer as any).player_id} rebuilt from ${fresh.length} published lender(s)`);
    }
  }
  if (pruneOdekakeGrants(viewer, doc.FriendInfos.filter((r: any) => r && r.IsUsable).map((r: any) => {
    const g = findOdekakeGrant(viewer, Number(r?.OdekakeDataID) || 0);
    return g ? g.lender : "";
  }))) changed = true;
  if (changed) {
    states.friend_game = JSON.stringify(doc);
    const n = doc.FriendInfos.filter((r: any) => r && r.IsUsable).length;
    vlog(`[VFG] re-flagged stored friend_game mid=${(viewer as any).player_id} rows=${doc.FriendInfos.length} usable=${n} publish=${odekakePublished(viewer) ? 1 : 0}`);
  }
  return changed;
}

// Server-side name screening on state writes.
// The client screens a player-facing name exactly once, at registration
// (NewRegistrationFlow.cs:243-263 -> ChkTabooword.cs:25 posts str=, :37 the
// client treats taboo_chk/result != 0 as unavailable), and never on a save:
// PlayerGameData.Save posts the whole player_game document, PlayerName included
// (PlayerGameData.cs:38 declared, :452 posted), and CardConnectGameData.Save
// posts the memorial-card link rows whose CardConnectInfo.name names a player
// (CardConnectGameData.cs:29, CardConnectInfo.cs:14). /client_state_write is a
// plain POST (ClientStateWrite.cs:20-22 posts kind= + data=<base64 JSON>), so
// without a gate here the registration screening is bypassable by writing the
// state document directly - which is how a profane name reaches the views that
// quote it back to other players (match seats, the friend/odekake rows built
// from profile.name, haifu).
//
// The gate is on the WRITE side only, never on the read side: a stored document
// is served as stored (client_state_read keeps answering what is on the profile,
// and screening there would drop an account's own savedata). The kinds screened
// are the ones whose payload is the account's own text; the server-authored
// documents are not screened because the server published that text itself -
// friend_game rows (FriendInfo.cs:13 PlayerName) and notice_game rows
// (NoticeInfo.cs:20-22 Title/Text) are the server's own list echoed back and are
// overwritten on the next read by seedServerOwnedState anyway.
// A refusal is the client's defined failure path: every ClientStateWrite call
// site posts with enableErrorScreenTransition:false (PlayerGameData.cs:452,
// CardConnectGameData.cs:29, PlayerConfigGameData.cs:274, ... every one of the
// 24 Save methods in MFG.GameData), and PlayerGameData.Save's catch flags
// PlayerConfig.IsDataSaveFailed (:440-444) - no ERROR_STOP screen, and the
// last-good state on the profile is left untouched.
//
// What the gate polices is a CHANGE, not the bytes a Save carries. The client types
// a name once (NewRegistrationFlow) and every later Save posts back the document
// this server served, so screening a value the server itself stored means: an
// account whose stored name trips today's list - the list is data
// (data/taboowords.json plus VFG_TABOO_EXTRA), and a name can predate the entry
// that catches it - fails every later save with PlayerConfig.IsDataSaveFailed, and
// with no rename path in the client it can never persist player_game again. So a
// screened field that repeats what this server already has for this account is
// accepted as the echo, and only a NEW value is screened.
//
// Which rule screens the new value depends on what a refusal costs (utils.ts has both:
// isTabooText - substring on every entry - and isTabooTextStandalone - a short entry
// must stand alone):
//   - player_game.PlayerName is the account's OWN text, and a refusal costs the player
//     one rename, not their savedata: the name the account already has keeps saving as
//     the echo. It is screened with the entry rule, the same one /chk_tabooword uses -
//     which is what catches a compound insult (カス野郎, 売春婦, cuntface) posted
//     straight to /client_state_write instead of through the registration screen.
//   - a cc_request row carries text the poster cannot rewrite: the client fills
//     CardConnectInfo.name from the item master (GachaResultInfo.cs:178,
//     MissionFlow.cs:302-304, VoteWindow.cs:586 - "MemorialCard" rows), a name this
//     server published in its own item data. A false positive there (カス ⊂ カスミ,
//     rape ⊂ Grape) is a save the account can never make, so this field keeps the
//     narrowing.
const TABOO_SCREENED_STATE_FIELDS: Record<string, { fields: string[]; ownText: boolean }> = {
  player_game: { fields: ["PlayerName"], ownText: true },
  cc_request: { fields: ["name"], ownText: false },
};

function screenedEntries(doc: any, fields: string[]): Array<{ field: string; value: string }> {
  const out: Array<{ field: string; value: string }> = [];
  const walk = (node: any, depth: number): void => {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) { for (const item of node) walk(item, depth + 1); return; }
    if (typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "string") { if (fields.includes(key)) out.push({ field: key, value }); }
      else if (value && typeof value === "object") walk(value, depth + 1);
    }
  };
  walk(doc, 0);
  return out;
}

// What this server already has for this account and kind: profile.name (mirrored
// from every player_game write, and what get_menudata serves) plus the document
// stored for that kind (what client_state_read serves). A posted value equal to one
// of them is the server's own text coming back, not a new one going out.
function stateWriteTabooHit(kind: string, doc: any, profile: any): { field: string; value: string; word: string } | null {
  const spec = TABOO_SCREENED_STATE_FIELDS[kind];
  if (!spec || !doc || typeof doc !== "object") return null;
  const fields = spec.fields;
  const screen = spec.ownText ? isTabooText : isTabooTextStandalone;
  const served = new Set<string>();
  const remember = (v: string): void => { served.add(v); served.add(v.trim()); };
  if (kind === "player_game") remember(String(((profile as any) || {}).name ?? ""));
  try {
    const stored = String((((profile as any) || {}).states || {})[kind] ?? "");
    for (const { value } of screenedEntries(JSON.parse(stored), fields)) remember(value);
  } catch { }
  for (const { field, value } of screenedEntries(doc, fields)) {
    if (served.has(value) || served.has(value.trim())) {
      const echoWord = screen(value);
      if (echoWord) vlog(`[VFG] client_state_write kind=${kind}: '${field}'='${value.slice(0, 40)}' trips taboo word '${echoWord}' but is already the value this server stores for this account - accepted as an echo (refusing it would fail every later save)`);
      continue;
    }
    const word = screen(value);
    if (word) return { field, value: value.slice(0, 40), word };
  }
  return null;
}

export async function handle_client_state_write(form: Record<string, string>, ctx: any): Promise<void> {
  let mid = Number(formGet(form, "mid") || 0) || 0;
  const kind = formGet(form, "kind") || "unknown";
  const data = formGet(form, "data");
  const pcuid = formGet(form, "pcuid");

  // Identity first, payload second: a state write only counts when it lands on
  // the account the login session belongs to. mid is not an identity - it is
  // playerIdFromRefid's 31-bit refid-prefix hash (utils.ts:202-213), a small
  // enumerable integer in a real savedata, so resolving an account from it let a
  // caller holding a never-issued pcuid overwrite whoever's mid it named
  // (mid=11's player_config replaced with {"入侵":"by-mid-only"} with no session
  // at all) - the same hole the removed MID phantom minting used to widen.
  const profile = await sessionAccount(ctx, pcuid, "client_state_write");
  if (!profile) return;
  if (mid && mid !== Number((profile as any).player_id)) {
    // A posted mid that is not this session's account is a claim, never a route:
    // it is written down and the payload lands on the session's own profile.
    vlog(`[VFG] client_state_write kind=${kind} posted mid=${mid} is not the account behind pcuid=${String(pcuid || "-").slice(0, 12)}... (mid=${(profile as any).player_id})`);
  }
  mid = Number((profile as any).player_id || mid) || mid;

  if (!data) {
    vlog(`[VFG] client_state_write rejected empty payload kind=${kind} mid=${mid} (nothing saved)`);
    sendXml(ctx, xml_error(SERV_ST_STATE_INVALID));
    return;
  }

  // The client posts urlencoded base64, but some payloads arrive with
  // literal '+' (raw base64) — and our old form-decode turned every '+'
  // into a space, silently corrupting the stream from that point on
  // (valid JSON head + mojibake tail, always breaking at the same spot
  // for identical prefixes, e.g. cc_request). Try each strategy and keep
  // the first one that yields valid JSON.
  const CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g;
  const b64 = (s: string): string | null => {
    try {
      const out = Buffer.from(s, "base64").toString("utf-8");
      return out ? out : null;
    } catch { return null; }
  };
  const variants: Array<{ text: string; via: string }> = [];
  try { const f = decodeURIComponent(data.replace(/\+/g, " ")); const d = b64(f); if (d) variants.push({ text: d, via: "form" }); } catch { }
  try { const r = decodeURIComponent(data); const d = b64(r); if (d) variants.push({ text: d, via: "raw+" }); } catch { }
  try { const d = b64(data); if (d) variants.push({ text: d, via: "raw" }); } catch { }
  variants.push({ text: data, via: "plain" });
  let decoded = data;
  let via = "plain";
  let isJson = false;
  for (const v of variants) {
    const clean = v.text.replace(CONTROL_RE, "");
    try {
      JSON.parse(clean);
      decoded = clean;
      via = v.via;
      isJson = true;
      break;
    } catch { }
  }
  if (!isJson) {
    // Nothing parsed. This used to log a discard and still answer code 0 (and,
    // on the legacy first-non-empty-decode branch, store the mojibake verbatim
    // - AUDITPROBE00001 still carries 30 corrupted states from that path).
    // Every state the shipping client posts is a JsonUtility JSON document
    // (ClientStateWrite.cs:20-22), so an unparsable payload is a failed write
    // and the client has to be told: it catches the resulting
    // NetworkResponseException and flags PlayerConfig.IsDataSaveFailed
    // (PlayerGameData.cs:440-444, ResultFlow.cs:241-245, GameoverFlow.cs:29).
    let bad = decoded;
    for (const v of variants) {
      if (v.text) { bad = v.text.replace(CONTROL_RE, ""); via = v.via + "?"; break; }
    }
    let reason = "unparseable";
    try { JSON.parse(bad); } catch (e) { reason = String((e as any)?.message || e).slice(0, 160); }
    vlog(`[VFG] Rejecting unparseable state '${kind}' (mid=${mid}) via=${via} rawlen=${(data || "").length} declen=${bad.length} err=${reason} head=${bad.slice(0, 200)} tail=${bad.slice(-120)}`);
    sendXml(ctx, xml_error(SERV_ST_STATE_INVALID));
    return;
  }
  decoded = decoded.replace(CONTROL_RE, "");
  if (via !== "form") vlog(`[VFG] state '${kind}' decoded via ${via} (mid=${mid})`);

  // cc_request guard: validate MemorialCard entries before they touch the
  // DB. Invalid payloads are quarantined on the profile (never overwrite
  // last-good data) and the write is reported as rejected; malformed-but-
  // salvageable ones are canonicalized. This keeps one bad gacha reward from
  // bricking the whole profile on next continue.
  if (kind === "cc_request") {
    const res = sanitizeCcRequest(decoded);
    if (!res.ok) {
      if (!(profile as any).quarantine_cc_request) {
        (profile as any).quarantine_cc_request = { at: nowUnix(), dropped: res.dropped, raw: String(decoded).slice(0, 20000) };
        await saveProfile((profile as any).refid, profile);
      }
      vlog(`[VFG] quarantined invalid cc_request write mid=${mid} refid=${(profile as any).refid} (kept last-good)`);
      sendXml(ctx, xml_error(SERV_ST_STATE_INVALID));
      return;
    }
    if (res.changed) {
      if (!(profile as any).quarantine_cc_request) {
        (profile as any).quarantine_cc_request = { at: nowUnix(), dropped: res.dropped, raw: String(decoded).slice(0, 20000) };
      }
      vlog(`[VFG] sanitized cc_request write mid=${mid} dropped=${res.dropped}`);
    }
    decoded = res.clean;
  }

  // Profanity gate on the account's own text (see stateWriteTabooHit above).
  // Screened after the cc_request sanitization, so a memorial-card row is judged
  // on the bytes that would really be stored, and before any mirror or save, so
  // a rejected document leaves the profile exactly as it was.
  let tabooDoc: any = null;
  try { tabooDoc = JSON.parse(decoded); } catch { }
  const tabooHit = stateWriteTabooHit(kind, tabooDoc, profile);
  if (tabooHit) {
    vlog(`[VFG] client_state_write rejected kind=${kind} mid=${mid} refid=${(profile as any).refid}: '${tabooHit.field}'='${tabooHit.value}' hits taboo word '${tabooHit.word}' (data/taboowords.json) - state NOT saved, last-good kept`);
    sendXml(ctx, xml_error(SERV_ST_STATE_INVALID));
    return;
  }

  // Mirror states -> profile on EVERY player_game write. The client only ever
  // carries the real name inside player_game JSON (create_player arrives as
  // name=PLAYER), and a rename changes PlayerName again. The old rule mirrored
  // once - only while profile.name was still a placeholder - so the name froze
  // at the first real value and get_menudata / matchmaking kept showing the
  // stale one after every later rename. The client's own placeholder names
  // (PLAYER/GUEST) stay rejected; ゲスト is a name the shipping client really
  // puts in PlayerName, so it mirrors like any other value.
  if (kind === "player_game") {
    decoded = mergePendingGachaUnlocks(profile, decoded);
    try {
      const obj = JSON.parse(decoded);
      const pn = String((obj && (obj.PlayerName || obj.playerName)) || "").trim();
      if (pn && pn !== "PLAYER" && pn !== "GUEST" && pn !== String((profile as any).name || "")) {
        (profile as any).name = pn;
        vlog(`[VFG] mirrored PlayerName '${pn}' to profile ${(profile as any).refid}`);
      }
    } catch { }
  }

  // music_gacha is authored by the server, not mirrored from the client: the
  // shipping client has no write path for it (no ClientStateWrite call site, only
  // ClientStateRead.cs:171-172), and it is the record the pull lifecycle and the
  // duplicate check are decided from. A write of it is refused instead of letting a
  // posted document overwrite the ledger the server just built.
  if (kind === "music_gacha") {
    vlog(`[VFG] client_state_write rejected kind=music_gacha mid=${mid} (server-owned state — authored by /music_gacha_play)`);
    sendXml(ctx, xml_error(SERV_ST_STATE_INVALID));
    return;
  }

  // receive_only is the same case in the client itself: ReceiveOnlyGameData has no
  // Save method at all, so there is no write path for it and a posted document can
  // only come from somewhere that is not the game (penalty flag, comeback/serial
  // campaign info, the important notices this server publishes). Refused, like
  // music_gacha. notice_game is NOT refused: NoticeGameData.Save is in the contract
  // (NoticeGameData.cs:140-145) even though nothing in the assembly calls it, and
  // whatever lands there is overwritten on the next read by the server's own notice
  // list minus this profile's acks (seedServerOwnedState).
  if (kind === "receive_only") {
    vlog(`[VFG] client_state_write rejected kind=receive_only mid=${mid} (server-owned state — ReceiveOnlyGameData has no Save)`);
    sendXml(ctx, xml_error(SERV_ST_STATE_INVALID));
    return;
  }

  // friend_game is the third state with no writer in the shipping client:
  // FriendGameData.Save exists (FriendGameData.cs:21-26) and nothing in the assembly
  // calls it, so this server authors the document (seedFriendGameState) and a posted
  // one can only be hand-made. It used to be accepted, which made it a second way to
  // name an account: a forged row's OdekakeDataID was resolved with
  // getProfileByPlayerId and marked IsUsable, and the borrow then served whoever that
  // mid named. The rows are now borrow grants this server issues onto the account's
  // own profile, so a posted friend list cannot grant anything; refused outright,
  // the same shape as music_gacha / receive_only (code SERV_ST_STATE_INVALID, which
  // every ClientStateWrite call site takes as its own failure path - they all post
  // with enableErrorScreenTransition:false).
  if (kind === "friend_game") {
    vlog(`[VFG] client_state_write rejected kind=friend_game mid=${mid} refid=${(profile as any).refid} (server-owned state — FriendGameData.Save has no caller; OdekakeDataID is an issued grant, not a value the client may write)`);
    sendXml(ctx, xml_error(SERV_ST_STATE_INVALID));
    return;
  }

  await saveStateOn(profile, kind, decoded);
  sendXml(ctx, xml_response());
}


// ---------------------------------------------------------------------------
// match
// ---------------------------------------------------------------------------
export async function handle_entry_game(form: Record<string, string>, ctx: any): Promise<void> {
  const gmode = resolveGmode(formGet(form, "gmode"), 1);
  const taku_class = Number(formGet(form, "taku_class") || 1) || 1;
  const pcuid = formGet(form, "pcuid");
  // NOTE: the client always sends passphrase=<space> when no passphrase was
  // entered — trim it or every public lobby collapses into one shared key.
  const passphrase = formGet(form, "passphrase").trim();
  const seats = GMODE_SEATS[gmode];
  const profile = await getProfileBySession(pcuid);
  // No profile behind the session: mid 0, never 1. mid 1 is a legal mid for a
  // real account, and an entry that stamps mid 1 onto its seat stamps it onto the
  // match archive afterwards - which is how an anonymous match ended up attributed
  // to that account's records.
  const mid = Number((profile as any)?.player_id || 0) || 0;
  const refid = String((profile as any)?.refid || "");
  const guest = !!(profile as any)?.is_guest;
  let name = (profile as any)?.name || "ゲスト";
  try {
    const pg = JSON.parse((profile as any)?.states?.player_game || "{}");
    if (pg.PlayerName) name = pg.PlayerName;
  } catch {}
  // Scramble festival: the client says it is in a team match (EntryGame.cs:36-40,
  // 60 teammatch=(int)TeamType), but the school a scramble match is scored for is
  // a server event property the client never sends. Designate only when this
  // server has one configured (VFG_SCRAMBLE_SCHOOL); otherwise the match is an
  // ordinary one and every g2_scramble count stays empty.
  const teammatch = Number(formGet(form, "teammatch") || 0) || 0;
  const schoolSetting = scrambleSchoolSetting();
  const scramble = teammatch > 0 && schoolSetting ? schoolSetting : "";

  const lobbyKey = passphrase ? `${gmode}_${passphrase}` : `${gmode}`;

function sendDiscordWebhook(url: string, payload: any) {
  try {
    const https = require("https");
    const data = JSON.stringify(payload);
    const { URL } = require("url");
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, (res: any) => {
      res.on('data', () => {}); 
    });
    req.on('error', (e: any) => { console.error(`Discord Webhook error: ${e.message}`); });
    req.write(data);
    req.end();
  } catch (e) {
    console.error(`Failed to send Discord webhook: ${e}`);
  }
}

  let tid: number;
  let pindex = 0;
  // 2-seat (Nima) is CPU-only by design: never park these players in the
  // shared lobby, or two strangers entering at once get paired together.
  // Each player gets an instant private table (seat 0 human, rest CPU).
  // Passphrase lobbies still match humans together for private Versus.
  if (seats <= 2 && !passphrase) {
    tid = await allocateTid();
    const taku = GMODE_TAKU[gmode] ?? 0;
    ensureSharedTable(tid, taku, [0], { gmode, taku_class, scramble });
    PLAYER_SEAT.set(pcuid, { tid, pindex: 0, name, mid, profile, lobbyKey: `solo_${tid}`, gmode, taku_class, refid, guest, scramble });
    vlog(`[VFG] solo 2P table tid=${tid} name=${name} mid=${mid} gmode=${gmode}${scramble ? " scramble=" + scramble : ""}`);
  } else {
    const back = await returningSeat(refid, pcuid, lobbyKey, name, mid, profile, gmode, taku_class, guest, scramble);
    if (back) {
      sendXml(ctx, entryXml(ctx, back.tid, back.pindex, gmode));
      return;
    }
    let lobby = MATCH_LOBBY.get(lobbyKey);
    if (lobby) {
      await pruneLobbyMembers(lobbyKey, lobby, "entry");
    }
    if (!lobby) {
      const cTime = nowUnix();
      lobby = { pcuids: [], tid: await allocateTid(), createdAt: cTime };
      MATCH_LOBBY.set(lobbyKey, lobby);

      try {
        // @ts-ignore
        const webhookUrl = typeof U !== "undefined" && U.GetConfig("VFG_DISCORD_WEBHOOK");
        if (webhookUrl && webhookUrl.startsWith("http")) {
          let modeName = `Mode ${gmode}`;
          let winds = "東";
          if (gmode === 1) { modeName = "Tonpuusen"; winds = "東"; }
          else if (gmode === 2) { modeName = "Hanchan"; winds = "東南"; }
          else if (gmode === 3) { modeName = "Sanma"; winds = "東"; }
          else if (gmode === 4) { modeName = "Nima"; winds = "東南"; }

          sendDiscordWebhook(webhookUrl, {
            embeds: [
              {
                title: "🀄 New Lobby Created!",
                color: 14177041,
                fields: [
                  { name: "Creator", value: name || "Player", inline: true },
                  { name: "Mode", value: modeName, inline: true },
                  { name: "Player capacity", value: `${seats} Players`, inline: true },
                  { name: "Wind rounds", value: winds, inline: false },
                  { name: "Time Since Creation", value: `<t:${cTime}:R>`, inline: false },
                  { name: "Lobby created on", value: `<t:${cTime}:f>`, inline: false }
                ]
              }
            ]
          });
        }
      } catch { }
    }

    if (!lobby.pcuids.includes(pcuid)) {
      lobby.pcuids.push(pcuid);
      const joinedIdx = lobby.pcuids.length;
      if (joinedIdx > 1) {
        try {
          // @ts-ignore
          const webhookUrl = typeof U !== "undefined" && U.GetConfig("VFG_DISCORD_WEBHOOK");
          if (webhookUrl && webhookUrl.startsWith("http")) {
            let modeName = `Mode ${gmode}`;
            if (gmode === 1) modeName = "Tonpuusen (東)";
            else if (gmode === 2) modeName = "Hanchan (東南)";
            else if (gmode === 3) modeName = "Sanma (東)";
            else if (gmode === 4) modeName = "Nima (東南)";

            sendDiscordWebhook(webhookUrl, {
              embeds: [
                {
                  title: "👥 Player Joined Lobby!",
                  color: 3066993, // green
                  fields: [
                    { name: "Player", value: name || "Unknown", inline: true },
                    { name: "Mode", value: modeName, inline: true },
                    { name: "Seats Filled", value: `${joinedIdx}/${seats}`, inline: true }
                  ]
                }
              ]
            });
          }
        } catch { }
      }
    }

    pindex = lobby.pcuids.indexOf(pcuid);
    tid = lobby.tid;
    PLAYER_SEAT.set(pcuid, { tid: lobby.tid, pindex, name, mid, profile, lobbyKey, gmode, taku_class, refid, guest, scramble });
    // Which table this entry landed in and which seat it was given: without this a
    // matching run cannot be read back at all, and "did these lanes share a table" is
    // the first question any waiting-room report has to answer.
    vlog(`[VFG] entry lobby=${lobbyKey} tid=${lobby.tid} seat=${pindex} of ${seats} gmode=${gmode} name=${name} members=${lobby.pcuids.length}`);

    if (lobby.pcuids.length >= seats) {
      const taku = GMODE_TAKU[gmode] ?? 0;
      const human_seats = lobby.pcuids.map((id, i) => i);
      ensureSharedTable(lobby.tid, taku, human_seats, { gmode, taku_class, scramble });
      MATCH_LOBBY.delete(lobbyKey);
      vlog(`[VFG] lobby=${lobbyKey} tid=${lobby.tid} filled: seats ${human_seats.join(",")} human, ${seats - human_seats.length} CPU seat(s)`);
    }
  }

  sendXml(ctx, entryXml(ctx, tid, pindex, gmode));
}

export async function handle_reconnect(form: Record<string, string>, ctx: any): Promise<void> {
  const pcuid = formGet(form, "pcuid");
  const seatInfo = PLAYER_SEAT.get(pcuid);
  if (seatInfo && SHARED_TABLES.has(seatInfo.tid)) {
    const table = SHARED_TABLES.get(seatInfo.tid);
    if (table && !(table as any).humans.includes(seatInfo.pindex)) {
      (table as any).humans.push(seatInfo.pindex);
      (seatInfo as any).lastSeen = Date.now();
      vlog(`[VFG] Player ${seatInfo.name} in seat ${seatInfo.pindex} reconnected. Taking back control from CPU.`);
    }
    sendXml(ctx, entryXml(ctx, seatInfo.tid, seatInfo.pindex, resolveGmode(seatInfo.gmode, 1)));
    return;
  }
  return handle_entry_game(form, ctx);
}

export async function handle_gget(form: Record<string, string>, ctx: any): Promise<void> {
  const pcuid = formGet(form, "pcuid");
  const ready = formGet(form, "ready") === "1";
  const parts = parseMust(form);
  // must = appver/pcuid/tid/pindex/mid/nextSeqNo (GGet.cs:30): segment 3 is the
  // table this poll addresses, and six segments is all the client sends.
  const tid = mustInt(parts, 2, 0);
  const claimedPindex = mustInt(parts, 3, -1);
  const nextSno = mustInt(parts, 5, 0);

  const seatInfo = addressedSeat(pcuid, tid, claimedPindex, "gget");
  if (!seatInfo) {
    sendXml(ctx, xml_error(SERV_ST_NO_TABLE));
    return;
  }
  const gmode = resolveGmode(seatInfo.gmode, 1);
  const seats = GMODE_SEATS[gmode] || 4;
  const lobbyKey = seatInfo.lobbyKey || String(gmode);

  let lobby = MATCH_LOBBY.get(lobbyKey);
  if (lobby && (lobby.tid !== seatInfo.tid || lobby.pcuids.indexOf(pcuid) < 0)) lobby = undefined;

  if (lobby) {
    await pruneLobbyMembers(lobbyKey, lobby, "gget");
    if (!lobby.pcuids.length) {
      // Nobody is waiting in this lobby any more and it is not a table: it is not
      // something a poll can be answered from.
      MATCH_LOBBY.delete(lobbyKey);
      lobby = undefined;
    }
  }
  if (lobby && nowUnix() - lobby.createdAt > LOBBY_FORCE_SECONDS) {
    const taku = GMODE_TAKU[gmode] ?? 0;
    const human_seats = lobby.pcuids.map((id, i) => i);
    ensureSharedTable(lobby.tid, taku, human_seats, { gmode, taku_class: seatInfo.taku_class, scramble: seatInfo.scramble });
    MATCH_LOBBY.delete(lobbyKey);
    lobby = undefined;
    vlog(`[VFG] lobby=${lobbyKey} tid=${seatInfo.tid} matching window closed: seats ${human_seats.join(",")} human, ${seats - human_seats.length} CPU seat(s)`);
  }

  let table = SHARED_TABLES.get(seatInfo.tid);
  if (!table && !lobby) {
    // Seated, but neither a table nor the lobby behind that seat exists: the
    // taikyoku this poll addresses is gone (a restart clears both). The client
    // handles a non-zero code on gget by leaving the match.
    sendXml(ctx, xml_error(SERV_ST_NO_TABLE));
    return;
  }
  if (table && !(table as any).finished) {
    const now = Date.now();
    for (let i = (table as any).humans.length - 1; i >= 0; i--) {
      const h_seat = (table as any).humans[i];
      const heldSeat = seatAt(seatInfo.tid, h_seat);
      const h_info = heldSeat ? heldSeat.seat : null;
      
      if (h_info) {
        if (!(h_info as any).lastSeen) {
          (h_info as any).lastSeen = now;
        } else if (now - (h_info as any).lastSeen > 60000) {
          vlog(`[VFG] Player ${h_info.name} in seat ${h_seat} disconnected for >60s. Converting to CPU.`);
          (table as any).humans.splice(i, 1);
          
          if ((table as any).state === "discard" && (table as any).turn === h_seat) {
            (table as any)._cpu_turn(h_seat);
            (table as any).flush_pending();
          } else if ((table as any).state === "call") {
            if ((table as any).sute_choices && (table as any).sute_choices[h_seat]) {
              const choice = (table as any).sute_choices[h_seat];
              delete (table as any).sute_choices[h_seat];
              
              let anyHumanCanCall = false;
              for (const rem_h of (table as any).humans) {
                if ((table as any).sute_choices[rem_h]) {
                  anyHumanCanCall = true;
                  break;
                }
              }
              if (!anyHumanCanCall && typeof (table as any)._cpu_calls === "function") {
                (table as any)._cpu_calls(choice.discarder, choice.tile);
                (table as any).flush_pending();
              }
            }
          }
        }
      }
    }
  }

  let isMatched = false;
  
  const players = [];
  if (table) {
    isMatched = true;
    // The member list comes from the table: a seat is human exactly when the engine
    // is running it as a human seat (taikyoku.ts humans), and the player in it is the
    // session that actually holds it. Building the list out of PLAYER_SEAT instead
    // announced a seat a CPU had taken over as a human, and handed out whichever
    // session's seat was inserted first.
    const humanSeats = new Set<number>(((table as any).humans || []).map((h: any) => Number(h)));
    for (let i = 0; i < seats; i++) {
      if (!humanSeats.has(i)) { players.push(null); continue; }
      const held = seatAt(seatInfo.tid, i);
      if (!held || held.evicted) {
        // Nobody is sitting at this seat any more. The engine would still wait on it
        // for a discard no client is going to send, so it goes to the CPU the table
        // will actually play - out of the table's own human list and out of the
        // answer, in the same breath, so both sides describe the same seat.
        if (held) PLAYER_SEAT.delete(held.pcuid);
        (table as any).humans = ((table as any).humans || []).filter((h: any) => Number(h) !== i);
        humanSeats.delete(i);
        vlog(`[VFG] gget tid=${seatInfo.tid} seat ${i} has no live seat behind it, handed to CPU`);
        players.push(null);
        continue;
      }
      const prof = await seatProfile(held.seat);
      players.push({ pcuid: held.pcuid, mid: Number(held.seat.mid || 0) || 0, name: held.seat.name, profile: prof });
    }
  } else if (lobby) {
    // If still in lobby, gather players from lobby
    for (const puid of lobby.pcuids) {
      const s = PLAYER_SEAT.get(puid);
      if (!s) continue;
      const prof = await seatProfile(s);
      players.push({ pcuid: puid, mid: s?.mid || 0, name: s?.name || "ゲスト", profile: prof });
    }
  } else {
    players.push({ pcuid, mid: seatInfo.mid, name: seatInfo.name, profile: seatInfo.profile });
  }

  const mwait = matchingXml(seatInfo.tid, seats, seatInfo.pindex, players as any, isMatched,
    String((table as any)?.scramble || seatInfo.scramble || ""));

  let tai = "";
  let allReady = 0;
  if (ready && table) {
    // @ts-ignore
    table.flush_pending();
    tai = table.cells_from(nextSno);
    allReady = 1;
  }
  // The stamp backlog is delivered against the server's own cursor for this seat:
  // gget carries no cursor (GGet.cs:30), and the client filters the rows it gets
  // by their idx= against what it has already shown (MatchingFlow.cs:549,560).
  const room = STAMPS.get(seatInfo.tid) || [];
  const chat = stampXml("chat", seatInfo.tid, stampCursor(seatInfo.tid, pcuid));
  if (room.length) stampCursorMark(seatInfo.tid, pcuid, Number(room[room.length - 1].idx) || 0);
  const xml = xml_response(`<game><all_ready>${allReady}</all_ready>${mwait}${tai}</game>${chat}`);
  sendXml(ctx, xml);
}

export async function handle_gpost(form: Record<string, string>, ctx: any): Promise<void> {
  const pcuid = formGet(form, "pcuid");
  const parts = parseMust(form);
  // must = appver/pcuid/tid/pindex/mid/seqNo/kind/tepaiPos/tepaiPos2/paiID/
  // tepaiID/tepaiID2/reachFlag/tsumoGiriFlag/chiNaki (GPost.cs:44)
  const tid = mustInt(parts, 2, 0);
  const kind = mustInt(parts, 6, 0);
  const claimedPindex = mustInt(parts, 3, -1);
  const pai = mustInt(parts, 9, 0);
  const tepai_id = mustInt(parts, 10, 0);
  const tepai_id2 = mustInt(parts, 11, 0);
  const reach = mustInt(parts, 12, 0);
  const tsumogiri = mustInt(parts, 13, 0);

  const seatInfo = addressedSeat(pcuid, tid, claimedPindex, "gpost");
  if (!seatInfo) {
    sendXml(ctx, xml_error(SERV_ST_NO_TABLE));
    return;
  }
  const table = SHARED_TABLES.get(seatInfo.tid);
  if (!table) {
    // The command was addressed to a table this server does not have. Answering
    // `<game></game>` with code 0 told the client the command landed and let it
    // wait for a cell stream that no table was producing.
    vlog(`[VFG] gpost kind=${kind} has no table behind tid=${seatInfo.tid} -> serv_st ${SERV_ST_NO_TABLE}`);
    sendXml(ctx, xml_error(SERV_ST_NO_TABLE));
    return;
  }

  const start = table.cells.length;
  // The seat the server assigned at entry is authoritative over the pindex the
  // request claims (addressedSeat logs the difference).
  table.on_command(kind, seatInfo.pindex, pai, tepai_id, tepai_id2, reach, tsumogiri);
  
  // flush if needed for certain kinds
  const S_NAKINASHI = 11, S_PON = 5, S_CHI = 6, S_MINKAN = 8, S_ANKAN = 7, S_KAKAN = 9, S_NEXT_KYOKU_READY = 15;
  if ([S_NAKINASHI, S_PON, S_CHI, S_MINKAN, S_ANKAN, S_KAKAN, S_NEXT_KYOKU_READY].includes(kind)) {
    table.flush_pending();
  }
  const tai = table.cells_from(start);
  const room = STAMPS.get(seatInfo.tid) || [];
  const chat = stampXml("chat", seatInfo.tid, stampCursor(seatInfo.tid, pcuid));
  if (room.length) stampCursorMark(seatInfo.tid, pcuid, Number(room[room.length - 1].idx) || 0);
  const xml = xml_response(`<game>${tai}</game>${chat}`);
  sendXml(ctx, xml);
}

export async function handle_end_or_kiken(form: Record<string, string>, ctx: any): Promise<void> {
  const pcuid = formGet(form, "pcuid");
  // EndGame.cs:22 and KikenGame.cs:22 post web_id/area_id/pcuid/tid/pindex/mid -
  // tid is the table being closed, and there is no gmode on this request: the mode
  // is whatever the table was entered with.
  const tid = Number(formGet(form, "tid") || 0) || 0;
  const claimedPindex = Number(formGet(form, "pindex") || 0) || 0;
  const seatInfo = addressedSeat(pcuid, tid, claimedPindex, "end_game");
  if (!seatInfo) {
    sendXml(ctx, xml_error(SERV_ST_NO_TABLE));
    return;
  }
  const table = SHARED_TABLES.get(seatInfo.tid);
  if (!table) {
    vlog(`[VFG] end_game/kiken_game has no table behind tid=${seatInfo.tid} -> serv_st ${SERV_ST_NO_TABLE}`);
    sendXml(ctx, xml_error(SERV_ST_NO_TABLE));
    return;
  }
  const gmode = resolveGmode((table as any).gmode ?? seatInfo.gmode, 1);
  const scrambleSchool = String((table as any).scramble || seatInfo.scramble || "");

  if (!(table as any).archiveSaved) {
    (table as any).archiveSaved = true;
    // Only archive naturally finished matches: a kiken mid-game would
    // record bogus ranks into player_record histories.
    if ((table as any).finished) {
      const rows = (table as any).result_rows() as Array<[number, number, number]>;
      const seats = Number((table as any).seats || 0);
      const yaku = ((table as any).yakuman || []) as number[];
      const playersInfo = rows.map((r, i) => {
        const s = Array.from(PLAYER_SEAT.values()).find(x => x.tid === seatInfo.tid && x.pindex === i);
        const seatProfile: any = s ? (s as any).profile : null;
        return {
          pindex: i,
          name: s ? s.name : "CPU",
          mid: s ? Number(s.mid || 0) : 0,
          refid: s ? (String((s as any).refid || "") || String(seatProfile?.refid || "")) : "",
          // What kind of account this seat was, recorded so a guest match cannot
          // be pulled up later as a card account's record.
          guest: s ? !!(s as any).guest : false,
          rank: r[0],
          score: r[1],
          uma: r[2],
          yakuman: Number(yaku[i] || 0),
          buttobi: r[1] < 0,
          // Scramble festival result for this seat (player_record g2_scramble):
          // the school the match was designated for and whether this seat won it.
          ...(scrambleSchool ? { scramble: { belong: scrambleSchool, win: r[0] === 0 ? 1 : 0 } } : {}),
        };
      });
      // @ts-ignore
      DB.Insert({
        collection: 'match_archive',
        tid: seatInfo.tid,
        gmode,
        taku_class: Number((table as any).taku_class || 1) || 1,
        seats,
        timestamp: Date.now(),
        players: playersInfo,
        // Full cell stream for get_haifu_data replay: same
        // cell_data_N format the live client already parses.
        cells: Array.isArray((table as any).cells) ? [...(table as any).cells] : [],
      }).catch((e: any) => console.error(e));
    }
  }
  table.state = "game_end";
  table.finished = true;

  PLAYER_SEAT.delete(pcuid);

  let seatsLeft = 0;
  for (const s of PLAYER_SEAT.values()) if (Number(s.tid) === Number(seatInfo.tid)) seatsLeft++;
  if (!seatsLeft) closeStampRoom(seatInfo.tid);

  const body = mgresultXml(table, seatInfo.pindex);
  sendXml(ctx, xml_response(body));
}

export async function handle_end_show(form: Record<string, string>, ctx: any): Promise<void> {
  const voltage = Number(formGet(form, "voltage") || 0) || 0;
  const contribute = Number(formGet(form, "contribute_percent") || 100) || 100;
  const bonus = Number(formGet(form, "bonus") || 0) || 0;
  const xml = xml_response(
    "<showresult>" +
    `<voltage>${voltage}</voltage>` +
    `<contribute_percent>${contribute}</contribute_percent>` +
    "<card_effect_percent>0</card_effect_percent>" +
    "<item_effect_percent>0</item_effect_percent>" +
    `<bonus>${bonus}</bonus>` +
    `<get_point>${Math.max(0, Math.floor(voltage / 10))}</get_point>` +
    "</showresult>"
  );
  sendXml(ctx, xml);
}

// ---------------------------------------------------------------------------
// sticker chat
// ---------------------------------------------------------------------------
export async function handle_gchat(form: Record<string, string>, ctx: any): Promise<void> {
  const pcuid = formGet(form, "pcuid");
  const tid = Number(formGet(form, "tid") || 0) || 0;
  // The seat a sticker belongs to is the seat this session was seated at, not the
  // pindex the request claims. Every other match request resolves the seat this way
  // (addressedSeat); gchat was the one handler that took the claim on faith, so a
  // lane whose seat had moved posted its stickers onto somebody else's seat where
  // every other player could see them.
  const seatInfo = addressedSeat(pcuid, tid, Number(formGet(form, "pindex") || 0), "gchat");
  if (!seatInfo) {
    sendXml(ctx, xml_error(SERV_ST_NO_TABLE));
    return;
  }
  const mid = Number(seatInfo.mid || 0) || 0;
  const pindex = Number(seatInfo.pindex) || 0;
  let name = formGet(form, "name");
  let contents = formGet(form, "contents");
  const param = formGet(form, "param");
  // Table stamps carry the sender's PlayerName and the sticker ItemID
  // (GChat.cs:25-27), and every seat in the room sees them, so both fields go
  // through the entry screen (utils.ts isTabooText, substring on every entry) with
  // the same list the registration name uses (data/taboowords.json).
  const badName = isTabooText(name);
  const badContents = isTabooText(contents);
  if (badName || badContents) {
    vlog(`[VFG] gchat stamp blocked tid=${tid} mid=${mid} name=${badName ? "taboo" : "ok"} contents=${badContents ? "taboo" : "ok"}`);
    name = badName ? "" : name;
    contents = badContents ? "" : contents;
  }
  if (contents) {
    stampPost(tid, mid, pindex, name, contents, param);
    maybeCpuStamp(tid, pindex);
  }
  // Same cursor as gget/gpost for this seat: the room backlog is sent once, the
  // client keeps what it has already shown (StampData.cs:29 idx,
  // MatchingFlow.cs:549).
  const room = STAMPS.get(tid) || [];
  const chat = stampXml("chat", tid, stampCursor(tid, pcuid));
  if (room.length) stampCursorMark(tid, pcuid, Number(room[room.length - 1].idx) || 0);
  sendXml(ctx, xml_response(chat));
}

export async function handle_gget_stamp_info(form: Record<string, string>, ctx: any): Promise<void> {
  const parts = parseMust(form);
  const tid = mustInt(parts, 2, 1);
  let pindex = mustInt(parts, 3, 0);
  let mid = mustInt(parts, 4, 0);
  // Same seat rule as /gchat: the sticker lands on the seat this session holds.
  const pcuid = formGet(form, "pcuid");
  if (pcuid) {
    const seatInfo = addressedSeat(pcuid, tid, pindex, "gget_stamp_info");
    if (seatInfo) { pindex = Number(seatInfo.pindex) || 0; mid = Number(seatInfo.mid || 0) || 0; }
  }
  const info = (formGet(form, "stamp_info") || "").split(",");
  let since = 0;
  try { since = Number(info[1] || 0) || 0; } catch { since = 0; }
  if (info.length >= 3 && info[2]) {
    // Same screening as /gchat: this is the second path a table stamp arrives by.
    // Entry rule (utils.ts isTabooText): substring on every entry.
    const badName = isTabooText(info[3] || "");
    const badContents = isTabooText(info[2]);
    if (badName || badContents) {
      vlog(`[VFG] gget_stamp_info stamp blocked tid=${tid} mid=${mid} name=${badName ? "taboo" : "ok"} contents=${badContents ? "taboo" : "ok"}`);
      sendXml(ctx, xml_response(stampXml("stamp_info", tid, since)));
      return;
    }
    stampPost(tid, mid, pindex, info[3] || "", info[2], "");
    maybeCpuStamp(tid, pindex);
  }
  // gget and gchat remember what they delivered to this seat; this path did not, so
  // the same backlog could be shown to the same client twice.
  const room = STAMPS.get(tid) || [];
  if (pcuid && room.length) stampCursorMark(tid, pcuid, Number(room[room.length - 1].idx) || 0);
  sendXml(ctx, xml_response(stampXml("stamp_info", tid, since)));
}

// ---------------------------------------------------------------------------
// dojo
// ---------------------------------------------------------------------------
export async function handle_dojo_get_status(form: Record<string, string>, ctx: any): Promise<void> {
  const p = await dojoProfile(form);
  if (!p) { dojoNoAccount(ctx, form, "dojo_get_status"); return; }
  const slots = dojoState(p);
  for (const s of slots) dojoRefresh(s);
  await saveProfile((p as any).refid, p);
  const body = slots.map((s, i) => dojoSlotXml(i, s)).join("");
  sendXml(ctx, xml_response(`<dojo><slot_nr>${DOJO_SLOTS}</slot_nr>${body}</dojo>`));
}

export async function handle_dojo_set_slot(form: Record<string, string>, ctx: any): Promise<void> {
  const slotIdRaw = Number(formGet(form, "slot_id") || 0) || 0;
  const chara = formGet(form, "set_character") || "OID_CHARACTER_1";
  const p = await dojoProfile(form);
  if (!p) { dojoNoAccount(ctx, form, "dojo_set_slot"); return; }
  const slots = dojoState(p);
  const slotId = Math.max(0, Math.min(slotIdRaw, DOJO_SLOTS - 1));
  const slot = slots[slotId];
  Object.assign(slot, { available: true, chara, start: nowUnix(), next: nowUnix() + DOJO_LESSON_SECONDS, stock: 0 });
  await saveProfile((p as any).refid, p);
  const body = dojoSlotXml(slotId, slot);
  sendXml(ctx, xml_response(`<dojo><slot_id>${slotId}</slot_id><updated>1</updated>${body}</dojo>`));
}

export async function handle_dojo_gain_soul(form: Record<string, string>, ctx: any): Promise<void> {
  const slotIdRaw = Number(formGet(form, "slot_id") || 0) || 0;
  const p = await dojoProfile(form);
  if (!p) { dojoNoAccount(ctx, form, "dojo_gain_soul"); return; }
  const slots = dojoState(p);
  const slotId = Math.max(0, Math.min(slotIdRaw, DOJO_SLOTS - 1));
  const slot = slots[slotId];
  dojoRefresh(slot);
  const got = Number(slot.stock || 0);
  slot.stock = 0;
  slot.start = nowUnix();
  slot.next = nowUnix() + DOJO_LESSON_SECONDS;
  await saveProfile((p as any).refid, p);
  const body = dojoSlotXml(slotId, slot);
  sendXml(ctx, xml_response(`<dojo><slot_id>${slotId}</slot_id><get_nr>${got}</get_nr>${body}</dojo>`));
}

// ---------------------------------------------------------------------------
// gacha
// ---------------------------------------------------------------------------
export async function handle_gacha_info(form: Record<string, string>, ctx: any): Promise<void> {
  const xml = xml_response(_gachaInfoXml());
  sendXml(ctx, xml);
}

export async function handle_req_draw_gacha(form: Record<string, string>, ctx: any): Promise<void> {
  const txn = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  const p = await getProfileBySession(formGet(form, "pcuid"));
  if (p) {
    (p as any).gacha_txn = { id: txn, gacha: formGet(form, "gacha_name"), times: Number(formGet(form, "times") || 1) || 1 };
    await saveProfile(p.refid, p);
  }
  sendXml(ctx, xml_response(`<transaction_info><transaction_id>${txn}</transaction_id></transaction_info>`));
}

export async function handle_get_gacha_result(form: Record<string, string>, ctx: any): Promise<void> {
  const times = Number(formGet(form, "times") || 1) || 1;
  const rows = Array.from({ length: Math.max(1, Math.min(times, 5)) }, () => `<data><character_id>0</character_id><unique_id>${Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}</unique_id></data>`).join("");
  sendXml(ctx, xml_response(`<lottery_result>${rows}</lottery_result><gift><acquired>0</acquired><prev>0</prev><after>0</after></gift>`));
}

// Pending-draw tracker: diagnoses the "gacha freezes showing results" bug.
// The client must call cutin_gacha_play_apply after presenting each draw.
// If a draw never gets its apply, the client hung during the results screen
// and the rolled OIDs logged here are the prime suspects (bad icon asset,
// missing movie, or NRE on that item). Watch for the WARN lines.
const PENDING_DRAWS: Map<string, { at: number; pcuid: string; gacha: number; rolled: string[] }> = new Map();
const PENDING_BY_PCUID: Map<string, string> = new Map();

export async function handle_cutin_gacha_play_draw(form: Record<string, string>, ctx: any): Promise<void> {
  const playCount = Number(formGet(form, "play_count") || 1);
  const gachaId = Number(formGet(form, "gacha_id") || 140);
  const isTicket = formGet(form, "is_ticket");
  const giftCfg = formGet(form, "gift_config");
  const enChara = formGet(form, "enable_charas");
  const pcuid = String(formGet(form, "pcuid") || "");
  // The account behind the draw: its cutins decide duplicate vs new, and its
  // player_item copy is where duplicate gift points are credited.
  let profile: any = null;
  try { profile = await getProfileBySession(pcuid); } catch { }
  // The series type is whatever gacha_info advertised for this id: a draw must
  // roll the banner as the schedule presented it, not as a hardcoded guess.
  let stype = "Pickup";
  try {
    const advertised = gachaSeries().filter((row: [number, string, number, string]) => Number(row[0]) === gachaId);
    if (advertised.length) stype = advertised[0][3];
  } catch { }
  // This endpoint is the cutin gacha: the client pulls Music banners through
  // music_gacha_play, never here. If anything does ask for one, answer with
  // cutins - music OIDs would not resolve through CutinItemMaster.
  const rollType = stype === "Music" ? "Normal" : stype;
  const pool = _gachaPool(gachaId, rollType);
  const rates = gachaRates(gachaId, rollType, pool);
  vlog(`[VFG] gacha_draw id=${gachaId} type=${stype} x${playCount} ticket=${isTicket} gift_cfg=${giftCfg} enable_charas=${String(enChara).slice(0, 80)} items=${(pool.items || []).length} pickup=${(pool.pickup || []).length} limited=${(pool.limited || []).length} cells=${rates.length}`);

  // enable_charas is the client's own IsCharaSelectable() answer, posted per
  // draw (CutinGachaPlayDraw.cs:56-59 -> GameDataManager.GetCharaSelectableList(),
  // CharaType ints). gift_config is PlayerConfig.UnableCharaGachaState: the
  // choice the player made in UnableCharaGachaSelectWindow for cutins of girls
  // the account has NOT unlocked - Get keeps them, Gift turns them into gift
  // points (GachaResultInfo.cs:112 and 130). Both only bind Pickup/Limited
  // banners: for a Normal/Unlock draw the client grants whatever it is given.
  const enableCharas = new Set<number>();
  for (const tok of String(enChara || "").split(",")) {
    const n = parseInt(tok.trim(), 10);
    if (Number.isInteger(n) && n >= 0 && n <= 20) enableCharas.add(n);
  }
  const giftRaw = String(giftCfg || "").trim().toLowerCase();
  const giftMode = (giftRaw === "get" || giftRaw === "1") ? "get" : (giftRaw === "gift" || giftRaw === "2") ? "gift" : "none";
  const giftGate = stype === "Pickup" || stype === "Limited";
  // Freeze bisection: VFG_GACHA_CHARAS / VFG_GACHA_SAFE / VFG_GACHA_EXCLUDE are
  // applied inside _gachaPool, to the advertised pools too, so a banner never
  // advertises odds over items it will not hand out.

  // Shop sells 1-pull and 5-pull (client GachaPlayUtility.Count). Clamp to the
  // shop's own maximum: the 25 ceiling belonged to the reverted 20-pull experiment.
  const wanted = Math.max(1, Math.min(playCount, 5));
  let picks = rollGachaItems(pool, rates, wanted);
  if (!picks.length) {
    // Never emit unknown OIDs: the client resolves every gain oid through
    // CutinItemMaster and an unresolvable one corrupts the saved inventory.
    // Fall back to the standard pool (always non-empty when pools load).
    try {
      const { getGachaPools } = await import("./utils");
      const std = (getGachaPools() as any)?.standard_pool || [];
      if (std.length) {
        const flat = { ...pool, items: [...std], buckets: {} };
        picks = rollGachaItems(flat, gachaRates(gachaId, stype, flat), wanted);
      }
    } catch { }
  }
  if (!picks.length) {
    sendXml(ctx, xml_response(`<gacha_draw><is_success>0</is_success><request_id>0</request_id><gain_items></gain_items><gift>0</gift></gacha_draw>`));
    return;
  }

  // Gift handling. The client reads gift_type as MFG.Types.GachaGiftType
  // (GachaGiftType.cs: IsNew 0, DuplicateGift 1, ConfigGift 2) and the <gift>
  // number becomes AcquiredGiftCount, which GachaResultInfo credits onto
  // player_item Present01 (GachaResultInfo.cs:73-75 and 146-149). The server
  // credits the same number on its own player_item copy: the client's write is
  // an absolute Set(prev + gift), so both sides land on the same total.
  //   owned cutin              -> gift_type 1 (client counts AcquiredCountInGacha5)
  //   Pickup/Limited draw of a girl the account has not unlocked, gift_config
  //   Gift                     -> gift_type 2: AffectToGameData deliberately does
  //     not grant that cutin (GachaResultInfo.cs:112 and 130), so the payout is
  //     gift points and the item stays un-owned on the server side too
  //   same case, gift_config Get -> gift_type 0: the client keeps the cutin
  const owned = ownedCutinOids(profile);
  let gainItems = "";
  const rolled: string[] = [];
  const spirits: number[] = [];
  const granted: string[] = [];
  const giftTypes: number[] = [];
  const unlockedChars: number[] = [];
  let gift = 0;
  let configGifts = 0;
  let unpayable = 0;
  for (const randomOid of picks) {
    rolled.push(randomOid);
    if (!/^OID_\d{2}[A-Za-z]+\d+$/.test(String(randomOid || ""))) {
      console.log(`[VFG] WARN gacha_draw id=${gachaId}: suspicious OID format '${randomOid}' — client may not resolve it (freeze risk)`);
    }
    const oidKey = String(randomOid || "").trim().toUpperCase();
    const chara = cutinCharaIndex(randomOid);
    // No enable_charas list (old/odd client) = no gate known: grant as new.
    const selectable = chara === null || !enableCharas.size ? true : enableCharas.has(chara);
    const dup = owned.has(oidKey) || granted.indexOf(randomOid) >= 0;
    let giftType = 0;
    if (dup) {
      giftType = 1;
      gift++;
    } else if (giftGate && !selectable && giftMode === "gift") {
      giftType = 2;
      gift++;
      configGifts++;
    } else if (giftGate && !selectable && giftMode === "none") {
      // Gacha robustness patch (2026-11-03): this branch used to DROP the item
      // from <gain_items> - the client iterates the play scene off the mode
      // count (GachaPlayFlow GachaDirection), so a short payout froze the scene
      // (19 draws in the log dropped all 5). State None now falls back to Gift
      // semantics: deliver as ConfigGift (gift_type 2, not owned anywhere),
      // the client grants nothing for it and the payout length always matches
      // play_count. The client-side gates (Get/Gift window on Pickup banners,
      // cutinItems[-1] guard) close the other half of the hole.
      giftType = 2;
      gift++;
      configGifts++;
      try { vlog(`[VFG] gacha_draw gift-converted ${randomOid}: gift_config none, chara ${chara} not selectable`); } catch { }
    } else {
      granted.push(randomOid);
    }
    giftTypes.push(giftType);
    gainItems += `<item><oid>${randomOid}</oid><gift_type>${giftType}</gift_type></item>`;
    // Fight spirit income: the client grants +1 spirit per <fight_spirits>
    // entry (GachaResultInfo adds ToFightSpiritItemID(chara)). Costumes cost
    // 50-100 spirits, so without this they are unreachable (official draws
    // include spirits; we grant the spirit of the drawn item's chara,
    // parsed from the OID_XX prefix, 0-based to match CharaType).
    const m = /^OID_(\d{2})/.exec(String(randomOid || ""));
    if (m) {
      const ch = parseInt(m[1], 10) - 1;
      if (ch >= 0 && ch <= 20) spirits.push(ch);
    }
    // Unlock grant: handing out the dedicated unlock cutin of a girl is what
    // unlocks her, on the client (GachaResultInfo.cs:134-139 adds her to
    // GachaCharaUsableList) and here, so the unlock stands on the server even
    // if the client's state write never arrives.
    const unlocked = grantGachaUnlockOnDraw(profile, randomOid);
    if (unlocked !== null) unlockedChars.push(unlocked);
  }
  if (giftTypes.length !== wanted) {
    console.log(`[VFG] WARN gacha_draw payout length ${giftTypes.length} != requested ${wanted} (id=${gachaId})`);
  }
  let giftCount = playerItemCount(profile, PI_PRESENT01);
  if (profile) {
    if (gift > 0) giftCount = playerItemAdd(profile, PI_PRESENT01, gift).after;
    // Only what the client actually keeps: a ConfigGift draw is paid in gift
    // points and the account still does not own that cutin.
    rememberGachaGrants(profile, granted);
    try { await saveProfile((profile as any).refid, profile); } catch { }
  }
  vlog(`[VFG] gacha_draw id=${gachaId} type=${stype} rolled=${rolled.join(",")} spirits=${spirits.join(",")} gift_type=[${giftTypes.join(",")}] gift=${gift} config_gift=${configGifts} dropped=${unpayable} unlocked=[${unlockedChars.join(",")}] present01=${giftCount}`);
  const reqId = Math.floor(Math.random() * 1000000000).toString();
  try {
    // Same-session check first, then any stale pending (covers game restart
    // after a freeze: new pcuid, old draw still without apply).
    const stale: Array<[string, { at: number; pcuid: string; gacha: number; rolled: string[] }]> = [];
    const prev = PENDING_BY_PCUID.get(pcuid);
    if (prev && PENDING_DRAWS.has(prev)) {
      stale.push([prev, PENDING_DRAWS.get(prev)!]);
    } else {
      const now = Date.now();
      for (const [rid, p] of PENDING_DRAWS) {
        if (now - p.at > 5 * 60 * 1000) stale.push([rid, p]);
      }
    }
    for (const [rid, p] of stale) {
      console.log(`[VFG] WARN previous draw req=${rid} (id=${p.gacha} rolled=${p.rolled.join(",")}) never got apply after ${Date.now() - p.at}ms — client likely froze on those results`);
      PENDING_DRAWS.delete(rid);
    }
    if (PENDING_DRAWS.size > 200) {
      const oldest = PENDING_DRAWS.keys().next().value as string;
      PENDING_DRAWS.delete(oldest);
    }
    PENDING_DRAWS.set(reqId, { at: Date.now(), pcuid, gacha: gachaId, rolled: [...rolled] });
    if (pcuid) PENDING_BY_PCUID.set(pcuid, reqId);
  } catch {}
  const spiritsXml = spirits.length ? `<fight_spirits>${spirits.map(s => `<item>${s}</item>`).join("")}</fight_spirits>` : "";
  const xml = `<gacha_draw><is_success>1</is_success><request_id>${reqId}</request_id><gain_items>${gainItems}</gain_items><gift>${gift}</gift>${spiritsXml}</gacha_draw>`;
  sendXml(ctx, xml_response(xml));
}

export async function handle_cutin_gacha_play_apply(form: Record<string, string>, ctx: any): Promise<void> {
  const reqId = formGet(form, "request_id") || "123456789";
  try {
    const p = PENDING_DRAWS.get(String(reqId));
    if (p) {
      const el = Date.now() - p.at;
      PENDING_DRAWS.delete(String(reqId));
      if (PENDING_BY_PCUID.get(p.pcuid) === String(reqId)) PENDING_BY_PCUID.delete(p.pcuid);
      vlog(`[VFG] gacha_apply request_id=${reqId} elapsed=${el}ms rolled=${p.rolled.join(",")}`);
      if (el > 120000) console.log(`[VFG] WARN gacha_apply request_id=${reqId} took ${el}ms since draw — results presentation stalled, near-freeze`);
    } else {
      vlog(`[VFG] gacha_apply request_id=${reqId} (no pending record — restart or legacy id)`);
    }
  } catch {}
  const xml = `<gacha_apply><is_success>1</is_success><request_id>${reqId}</request_id></gacha_apply>`;
  sendXml(ctx, xml_response(xml));
}

export async function handle_gacha_log(form: Record<string, string>, ctx: any): Promise<void> {
  const raw = formGet(form, "log");
  if (raw) {
    try {
      const txt = Buffer.from(decodeURIComponent(raw.replace(/\+/g, " ")), "base64").toString("utf-8");
      // Always print: the client only sends this on gacha anomalies, and it
      // is our only window into client-side failures (freezes show no error).
      console.log(`[VFG] [gacha-log] ${txt.slice(0, 500)}`);
    } catch { }
  }
  sendXml(ctx, xml_response());
}

export async function handle_music_gacha_play_reserve(form: Record<string, string>, ctx: any): Promise<void> {
  const series = Number(formGet(form, "gacha_id") || 0) || 0;
  const pcuid = formGet(form, "pcuid");
  const profile = await getProfileBySession(pcuid);

  // The client has no catch-free path for a failed reserve: GachaSelectFlow.cs:436-449
  // reads is_success and re-enables the buttons on 0, while an error serv_st throws
  // NetworkResponseException -> ERROR_STOP. So every refusal here is answered as
  // is_success 0, with request_id present (MusicGachaPlayReserve.cs:29-34 reads both
  // as chained Element() hops).
  const fail = (why: string): void => {
    vlog(`[VFG] music_gacha_reserve refused mid=${profile ? (profile as any).player_id : "?"} series=${series}: ${why}`);
    sendXml(ctx, xml_response(`<gacha_reserve><is_success>0</is_success><request_id>0</request_id></gacha_reserve>`));
  };

  if (!profile) return fail("no profile behind this session");
  // Seed before deciding: this is the state that says what the account owns.
  if (seedMusicGachaState(profile)) { try { await saveProfile((profile as any).refid, profile); } catch { } }

  const pool = MUSIC_GACHA_POOL.get(series);
  if (!pool || !pool.length) return fail("series is not an advertised music series");

  const owned = ownedMusicOids(profile, series);
  if (owned.size >= pool.length) return fail("series already complete");

  const id = incMusicReqSeq();
  const list = Array.isArray((profile as any).music_gacha_reserves) ? (profile as any).music_gacha_reserves : [];
  list.push({ id, series, at: nowUnix() });
  (profile as any).music_gacha_reserves = list.slice(-MUSIC_RESERVES_MAX);
  try { await saveProfile((profile as any).refid, profile); } catch { }
  vlog(`[VFG] music_gacha_reserve mid=${(profile as any).player_id} series=${series} request_id=${id} owned=${owned.size}/${pool.length}`);
  sendXml(ctx, xml_response(`<gacha_reserve><is_success>1</is_success><request_id>${id}</request_id></gacha_reserve>`));
}

export async function handle_music_gacha_play(form: Record<string, string>, ctx: any): Promise<void> {
  const pcuid = formGet(form, "pcuid");
  let req = 0;
  try { req = Number(formGet(form, "request_id") || 0) || 0; } catch { req = 0; }

  // Identity and reservation first. The ticket this play is validated against is the
  // one /music_gacha_play_reserve wrote onto THIS profile: not a global map any
  // session could hit, and not a client state the client never writes. Unknown id,
  // replayed id, another account's id -> the play never happens: no item, no grant,
  // no gift points.
  const profile = await getProfileBySession(pcuid);
  if (!profile) {
    vlog(`[VFG] music_gacha_play refused request_id=${req}: no profile behind this session`);
    sendXml(ctx, xml_error(SERV_ST_SESSION_LOST));
    return;
  }
  const res = takeMusicReserve(profile, req);
  if (!res || !MUSIC_GACHA_POOL.get(res.series)) {
    // StatusCode.AlreadyFinishedTransaction (930): the transaction behind this id is
    // not open. The client cannot render is_success 0 - MusicGachaPlay.cs:112 indexes
    // GainItems[0] without checking - so the honest answer is the error code it does
    // catch (NetworkResponseException -> its "could not run" error screen).
    vlog(`[VFG] music_gacha_play refused mid=${(profile as any).player_id} request_id=${req}: no server reservation behind it`);
    sendXml(ctx, xml_error(SERV_ST_ALREADY_FINISHED));
    return;
  }
  const series = res.series;
  const pool = MUSIC_GACHA_POOL.get(series) as string[];
  try { await saveProfile((profile as any).refid, profile); } catch { }

  seedMusicGachaState(profile);

  // Duplicate protection against the server-owned ledger. The old lookup read the
  // "music_gacha" state expecting the client to maintain it; the client only ever
  // reads that state, so the inventory it saw was always empty and items the account
  // already owned were offered back.
  const owned = ownedMusicOids(profile, series);
  const unowned = pool.filter((oid: string) => !owned.has(String(oid).toUpperCase()));
  let oid: string;
  let duplicate = false;
  if (unowned.length > 0) {
    oid = unowned[Math.floor(Math.random() * unowned.length)];
    recordMusicGain(profile, series, oid);
  } else {
    // Whole series owned: this pull can only be a duplicate. Nothing is added to the
    // possession ledger; the pull is paid for in gift points (see below).
    oid = pool[Math.floor(Math.random() * pool.length)];
    duplicate = true;
  }
  rememberGachaGrants(profile, [oid]);

  // Gift points, P3 semantics: the server credits them once in its own player_item
  // copy so the totals agree with what the client credits locally
  // (MusicGachaPlay.cs:115 adds Present01 x2 on every successful pull, duplicate
  // included - a duplicate is converted into exactly those 2 points), and <gift> is
  // the number the client's result flow trusts.
  let present01 = playerItemCount(profile, PI_PRESENT01);
  present01 = playerItemAdd(profile, PI_PRESENT01, 2).after;
  try { await saveProfile((profile as any).refid, profile); } catch { }

  const infos = musicInfosOf(profile).find((x: any) => Number((x as any)?.GachaID) === Number(series));
  vlog(`[VFG] music_gacha_play mid=${(profile as any).player_id} series=${series} request_id=${req} oid=${oid} dup=${duplicate ? 1 : 0} poss=${infos ? infos.PossessionCount : "?"}/${pool.length} present01=${present01}`);

  sendXml(ctx, xml_response(`<gacha_result><is_success>1</is_success><gain_items><item>${xml_escape(oid)}</item></gain_items><gift>2</gift><fight_spirits></fight_spirits></gacha_result>`));
}

export async function handle_get_jongstone_info(form: Record<string, string>, ctx: any): Promise<void> {
  sendXml(ctx, xml_response("<jongstone_info><free_point>0</free_point><record_point>0</record_point></jongstone_info>"));
}

export async function handle_get_mg(form: Record<string, string>, ctx: any): Promise<void> {
  sendXml(ctx, xml_response("<mg_info><mg>0</mg><additional_mg>0</additional_mg></mg_info>"));
}

export async function handle_mission_date(form: Record<string, string>, ctx: any): Promise<void> {
  sendXml(ctx, xml_response(infoData("missions", missionsJson())));
}

function fmtRecordDate(ts: number): string {
  try {
    const d = new Date(Number(ts) || 0);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  } catch { return ""; }
}

// ---------------------------------------------------------------------------
// match archives: player_record / get_haifu_list / get_haifu_data
// ---------------------------------------------------------------------------

// The archives this session's account actually played in, newest first, each with
// the account's own row. One identity rule for all three endpoints
// (utils.ts archiveParticipantMatches): a recorded refid is the identity; an
// archive written without one is matched on mid only when that mid is a real one
// (not 0 = CPU, not 1 = the old entry placeholder); and a match recorded as a
// guest match is not a card account's match, nor the other way round.
async function myArchives(pcuid: string): Promise<Array<{ doc: any; row: any }>> {
  const me = await getProfileBySession(pcuid);
  if (!me) return [];
  const id = viewerIdentity(me);
  let docs: any[] = [];
  try {
    // @ts-ignore - PluginSpace scan (object-form query targets __s='plugins')
    docs = await DB.Find({ collection: 'match_archive' }) || [];
  } catch { docs = []; }
  const out: Array<{ doc: any; row: any }> = [];
  for (const doc of docs) {
    const players = (doc as any).players;
    if (!Array.isArray(players)) continue;
    const row = players.find((p: any) => archiveParticipantMatches(p, id));
    if (row) out.push({ doc, row });
  }
  out.sort((a, b) => (Number((b.doc as any).timestamp) || 0) - (Number((a.doc as any).timestamp) || 0));
  return out;
}

// total>g2_scramble and info>g2_scramble (PlayerTotalRecordInfo.cs:15-25,
// PlayerRecordInfo.cs:40-49): one history per school, win_nr = the scramble
// matches this account won for that school. The rows come from what the archive of
// a designated scramble match recorded per participant (handle_end_or_kiken); the
// block is always emitted so the client's trophy panel reads a real 0 instead of a
// missing record.
function g2ScrambleXml(rows: any[]): string {
  const wins = new Map<string, number>();
  for (const r of rows) {
    const s = (r as any).scramble;
    if (!s) continue;
    const belong = String((s as any).belong || "");
    if (!belong) continue;
    wins.set(belong, (wins.get(belong) || 0) + (Number((s as any).win) || 0));
  }
  const hist = Array.from(wins.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([belong, n]) => `<history><belong>${xml_escape(belong)}</belong><win_nr>${n}</win_nr></history>`)
    .join("");
  return `<g2_scramble>${hist}</g2_scramble>`;
}

export async function handle_player_record(form: Record<string, string>, ctx: any): Promise<void> {
  const pcuid = formGet(form, "pcuid");
  if (!await sessionAccount(ctx, pcuid, "player_record")) return;
  const mine = await myArchives(pcuid);
  // GetRecord.cs:31-35 hands the whole player_record element to
  // PlayerRecordGameData.Parse, which reads <total> for the aggregate scramble
  // counts. It used to be missing entirely, so MyRoomRecordWindow's scramble
  // panel had nothing to show.
  let out = `<total>${g2ScrambleXml(mine.map(m => m.row))}</total>`;
  const groups = new Map<string, any[]>();
  for (const m of mine) {
    const seats = Number((m.doc as any).seats) === 3 ? 3 : Number((m.doc as any).seats) === 2 ? 2 : 4;
    const kind = recordKindOf(seats);
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind)!.push({ ...m.row, ts: Number((m.doc as any).timestamp) || 0, seats });
  }
  for (const kind of ["Yonma", "Sanma", "Nima"]) {
    const rows = groups.get(kind);
    if (!rows || !rows.length) continue;
    const seats = Number(rows[0].seats || 4);
    const counts = new Array(seats).fill(0);
    let yaku = 0;
    for (const r of rows) {
      const rk = Number(r.rank || 0);
      if (rk >= 0 && rk < seats) counts[rk]++;
      yaku += Number(r.yakuman || 0);
    }
    const hist = rows.slice(0, 20).map(r => {
      const bt = (r as any).buttobi != null ? !!((r as any).buttobi) : Number(r.score || 0) < 0;
      return `<history><rank>${Number(r.rank || 0)}</rank><score>${Number(r.score || 0)}</score>` +
        `<is_yakuman>${Number(r.yakuman || 0) > 0 ? 1 : 0}</is_yakuman>` +
        `<is_buttobi>${bt ? 1 : 0}</is_buttobi>` +
        `<date>${xml_escape(fmtRecordDate(Number((r as any).ts) || 0))}</date></history>`;
    }).join("");
    out += `<info><kind>${kind}</kind><rank_list>${counts.map(c => `<rank_count>${c}</rank_count>`).join("")}</rank_list>` +
      `<yakuman_num>${yaku}</yakuman_num>${g2ScrambleXml(rows)}<histories>${hist}</histories></info>`;
  }
  sendXml(ctx, xml_response(`<player_record>${out}</player_record>`));
}

export async function handle_get_haifu_list(form: Record<string, string>, ctx: any): Promise<void> {
  const pcuid = formGet(form, "pcuid");
  const mine = (await myArchives(pcuid)).slice(0, 50);
  const rows = mine.map(({ doc, row }) => {
    const gmode = resolveGmode((doc as any).gmode, 1);
    const tid = Number((doc as any).tid || 0) || 0;
    const endSec = Math.floor((Number((doc as any).timestamp) || 0) / 1000);
    const bySeat = new Map<number, any>();
    for (const p of ((doc as any).players || [])) bySeat.set(Number((p as any).pindex || 0), p);
    // Client always reads 4 seats (name0-3/rank0-3/score0-3); pad short tables.
    let infos = "";
    for (let i = 0; i < 4; i++) {
      const p = bySeat.get(i);
      const nm = p ? String((p as any).name || "CPU") : "CPU";
      const rk = p ? Number((p as any).rank || 0) : i;
      const sc = p ? Number((p as any).score || 0) : 0;
      infos += `<name${i}>${xml_escape(nm)}</name${i}><rank${i}>${rk}</rank${i}><score${i}>${sc}</score${i}>`;
    }
    // gmode and taku_class are the archived match's own (GetHaifuList.cs reads both
    // and the kifu list labels each row with them); pindex is where this account sat.
    return `<haifu><gmode>${gmode}</gmode><taku_class>${Number((doc as any).taku_class || 1) || 1}</taku_class><tid>${tid}</tid>` +
      `<pindex>${Number((row as any).pindex || 0) || 0}</pindex><end_date>${endSec}</end_date>${infos}</haifu>`;
  }).join("");
  sendXml(ctx, xml_response(`<haifu_list>${rows}</haifu_list>`));
}

export async function handle_get_haifu_data(form: Record<string, string>, ctx: any): Promise<void> {
  const pcuid = formGet(form, "pcuid");
  const tid = Number(formGet(form, "tid") || 0) || 0;
  if (tid) {
    // GetHaifuData.cs:21 posts the tid of a kifu and the pcuid asking for it.
    // A kifu is only this account's to read if it sat at that table: without the
    // check any logged-in session could pull any tid out of the archive, and while
    // tids repeated across restarts the answer was a different match than the one
    // the list offered. Newest match with this tid that the viewer actually played.
    const mine = (await myArchives(pcuid)).filter(({ doc }) => Number((doc as any).tid) === tid);
    const doc = mine.length ? mine[0].doc : null;
    const cells: string[] = (doc && Array.isArray((doc as any).cells)) ? (doc as any).cells : [];
    if (doc && cells.length) {
      const gmode = resolveGmode((doc as any).gmode, 1);
      const seats = Number((doc as any).seats || 4) || 4;
      // HaifuData.Parse reads: core_io[0] in/tmake (gmode, pnum),
      // core_io[1] out/tmake (zaseki per seat) + taikyoku/cell_info with
      // the recorded cell_data_N stream. pnum=seats keeps all seats human
      // (no random CPU fill); zaseki emitted for 4 seats covers every taku.
      let zas = "";
      for (let i = 0; i < 4; i++) zas += `<zaseki_${i}>${i}</zaseki_${i}>`;
      const body =
        `<core_io><in><tmake><play_mode><gmode>${gmode}</gmode></play_mode><pnum>${seats}</pnum></tmake></in></core_io>` +
        `<core_io><out><tmake>${zas}</tmake><taikyoku><cell_info>` +
        `<cell_sno count="${cells.length}"></cell_sno>` + cells.join("") +
        `</cell_info></taikyoku></out></core_io>`;
      vlog(`[VFG] haifu_data tid=${tid} cells=${cells.length}`);
      sendXml(ctx, xml_response(body));
      return;
    }
    vlog(`[VFG] haifu_data tid=${tid} pcuid=${String(pcuid).slice(0, 8)}... not a participant or no recorded cells`);
  }
  sendXml(ctx, xml_response());
}

// POST /present_done (MFG.GameRequest/PresentDone.cs:38-66): the client lists the
// PresentIDs it took. It is the ONLY present write the client ever makes, so the
// receipt has to land in the server's stored present_box_game here; echoing the
// rows and keeping the stored box pending re-offered the same presents on every
// following load.
export async function handle_present_done(form: Record<string, string>, ctx: any): Promise<void> {
  const ids = (formGet(form, "done_ids") || "").split(",").map(s => s.trim()).filter(Boolean);
  const pcuid = formGet(form, "pcuid");
  const mid = Number(formGet(form, "mid") || 0) || 0;
  let profile: any = null;
  try { profile = await resolveProfile(mid, pcuid); } catch { }
  const pids = ids.map(s => Number(s)).filter(n => Number.isFinite(n));
  if (profile && pids.length) {
    const res = markPresentsReceived(profile, pids);
    if (res.unknown.length) vlog(`[VFG] present_done unknown pid(s) mid=${(profile as any).player_id} [${res.unknown.join(",")}]`);
    if (res.marked.length) {
      try { await saveProfile((profile as any).refid, profile); } catch { }
      vlog(`[VFG] present_done receipted mid=${(profile as any).player_id} pids=[${res.marked.join(",")}]`);
    }
  }
  const rows = ids.map(raw => {
    const info = profile ? receivedPresentInfo(profile, Number(raw)) : null;
    const content = xml_escape(String((info as any)?.Content || ""));
    const amount = Number((info as any)?.Count) || 0;
    // success 0 means "grant completed": ValueBool makes nonzero true
    // (MFG.Sytem.Utilities.Xml/Extensions.cs:38-45) and PresentBoxGameData.Apply
    // treats IsSuccess as "the server-side acquire failed" (PresentBoxGameData.cs:172-181).
    return `<data><id>${xml_escape(raw)}</id><success>0</success><content>${content}</content><amount>${amount}</amount></data>`;
  }).join("");
  sendXml(ctx, xml_response(`<present>${rows}</present>`));
}

// Competition entry / final-result acknowledgement (CompetitionEntry.cs:35 posts
// compe_id= and appends &displayed_result=1 when it is the "result already seen"
// mode). The parser reads two root-level containers
// (CompetitionEntry.cs:44-60): <entry> with result / is_entry / reason, and
// <displayed_result> with result / is_check_result. A nested shape is invisible to
// it, and a missing <result> inside a container the client found is a
// NullReferenceException, not the NeedNotNodeNotFoundException this parse catches
// (Extensions.cs:25 is the only helper that throws it) - so every container served
// carries its full set, like the reference answer in mock/specs/competition_entry.xml.
// The server runs no competition (competition_game is an empty record, see
// utils.ts serverOwnedStateJson), so the honest answers are "request ok" and
// "not entered": CompetitionEntryWindow.cs:148-163 stores IsEntried straight from
// is_entry, and every displayed_result caller (CompetitionGameData.cs:129,
// EventResultFlow.cs:178) ignores the returned fields.
export async function handle_competition_entry(form: Record<string, string>, ctx: any): Promise<void> {
  const compeId = formGet(form, "compe_id");
  const displayed = formGet(form, "displayed_result");
  try { vlog(`[VFG] competition_entry compe_id=${compeId} displayed_result=${displayed || "0"} -> entry/is_entry=0`); } catch { }
  sendXml(ctx, xml_response(
    "<entry><result>1</result><is_entry>0</is_entry><reason></reason></entry>" +
    "<displayed_result><result>1</result><is_check_result>1</is_check_result></displayed_result>"
  ));
}

export async function handle_log_only(form: Record<string, string>, ctx: any): Promise<void> {
  const raw = formGet(form, "log");
  if (raw) {
    try {
      const txt = Buffer.from(decodeURIComponent(raw.replace(/\+/g, " ")), "base64").toString("utf-8");
      // @ts-ignore
      vlog(`[itemlog] ${txt}`);
    } catch { }
  }
  sendXml(ctx, xml_response());
}

// POST /item_gain_log and /item_consume_log (ItemGainLog.cs:28-40,
// ItemConsumeLog.cs:32-46): the client posts a base64 JsonUtility document
// ({"ItemOID","GainType","ConsumeNum"} / {"ItemOID","ConsumeCount","BeforeCount",
// "AfterCount","ConsumeType"}). Both used to answer code 0 and throw the payload
// away, which made all item income and consumption invisible server-side. The
// entries are appended to the profile document instead. ("log" is not used for
// this: the client owns that state kind as its own taikyoku log,
// LogGameData.cs:60.)
export async function handle_item_log(form: Record<string, string>, ctx: any, endpoint: string): Promise<void> {
  const raw = formGet(form, "log");
  const pcuid = formGet(form, "pcuid");
  const mid = Number(formGet(form, "mid") || 0) || 0;
  let entry: any = null;
  if (raw) {
    try {
      const txt = Buffer.from(decodeURIComponent(raw.replace(/\+/g, " ")), "base64").toString("utf-8");
      const parsed = JSON.parse(txt);
      if (parsed && typeof parsed === "object") entry = parsed;
    } catch { }
  }
  if (!entry) {
    vlog(`[VFG] ${endpoint}: no parsable log payload`);
    sendXml(ctx, xml_response());
    return;
  }
  try {
    const profile = await resolveProfile(mid, pcuid);
    if (profile) {
      appendProfileLog(profile, "item_logs", { t: nowUnix(), src: endpoint, ...entry });
      await saveProfile((profile as any).refid, profile);
      vlog(`[VFG] ${endpoint} stored mid=${(profile as any).player_id} ${JSON.stringify(entry)}`);
    } else {
      vlog(`[VFG] ${endpoint}: no profile behind pcuid=${String(pcuid).slice(0, 8)}... (log dropped)`);
    }
  } catch (e: any) {
    vlog(`[VFG] ${endpoint} store failed: ${e && e.message ? e.message : e}`);
  }
  sendXml(ctx, xml_response());
}

// POST /notice_done + /important_notice_done (NoticeDone.cs:14-19): the client
// reports which notices it has shown. The ack is persisted on the profile
// instead of being swallowed by an empty code-0 answer.
async function handle_notice_ack(endpoint: string, bucket: string, form: Record<string, string>, ctx: any): Promise<void> {
  const ids = (formGet(form, "done_ids") || "").split(",").map(s => s.trim()).filter(Boolean);
  try {
    const profile = await resolveProfile(Number(formGet(form, "mid") || 0) || 0, formGet(form, "pcuid"));
    if (profile && ids.length) {
      const raw = (profile as any)[bucket];
      const cur = Array.isArray(raw) ? raw.map((x: any) => String(x)) : [];
      const seen = new Set(cur);
      for (const id of ids) {
        if (!seen.has(id)) { cur.push(id); seen.add(id); }
      }
      (profile as any)[bucket] = cur.slice(-400);
      await saveProfile((profile as any).refid, profile);
      vlog(`[VFG] ${endpoint} acked mid=${(profile as any).player_id} ids=[${ids.join(",")}]`);
    }
  } catch { }
  sendXml(ctx, xml_response());
}

// The name screen the registration flow runs before it lets a name through
// (NewRegistrationFlow.cs:243-259 -> ChkTabooword.cs:25 posts str=, :37 reads
// taboo_chk/result and treats nonzero as unavailable). The list lives in
// data/taboowords.json (utils.ts TABOO_WORDS); an empty list here used to make the
// whole endpoint a no-op that accepted every name. This is the entry screen:
// utils.ts isTabooText, substring on every entry, so a compound insult (カス野郎,
// fuckyou, cuntface) is refused by the short entry inside it.
export async function handle_chk_tabooword(form: Record<string, string>, ctx: any): Promise<void> {
  const word = formGet(form, "str");
  const hit = isTabooText(word);
  if (hit) vlog(`[VFG] chk_tabooword rejected '${String(word).slice(0, 32)}' (matched '${hit}')`);
  sendXml(ctx, xml_response(`<taboo_chk><result>${hit ? 1 : 0}</result></taboo_chk>`));
}

// Route table: one entry per endpoint the shipping client actually posts (the
// 45-name front-server list in docs/inventory/flow-trace.md). Invented aliases
// no client can reach are not registered: `get_record` (the client posts
// /player_record, GetRecord.cs:21) and `coop_done` (it posts /eashop_done,
// CoopDone.cs:17) were named after the request classes, not the wire path.
export const AOG_HANDLER_MAP: Record<string, (f: any, c: any) => Promise<void>> = {
  appli_boot: handle_appli_boot,
  appli_info: handle_appli_info,
  login: handle_login,
  logout: handle_logout,
  create_player: handle_create_player,
  // docs/28 web hosting: the presentation a hosted account answers /login with.
  // The shipping client never posts this route - the web front does, right
  // before relaying that account's login, because a browser has no card reader
  // to make the presentation any other way (utils.ts presentViaPresenter).
  vfgcard_present: handle_vfg_card_present,
  // Web lane card bridge (rebuild patch): card-login verbs posted by the WebGL
  // client's xrpc shim - dispatched to handleCardmng/handleVfgac via
  // handle_card_bridge (see below registerAogRoutes).
  inquire: handle_card_bridge,
  getrefid: handle_card_bridge,
  authpass: handle_card_bridge,
  bindmodel: handle_card_bridge,
  bindcard: handle_card_bridge,
  getdatalist: handle_card_bridge,
  update_refer: handle_card_bridge,
  get_menudata: handle_get_menudata,
  keep_alive: handle_keep_alive,
  client_state_read: handle_client_state_read,
  client_state_write: handle_client_state_write,
  entry_game: handle_entry_game,
  gget: handle_gget,
  gpost: handle_gpost,
  end_game: handle_end_or_kiken,
  kiken_game: handle_end_or_kiken,
  end_show: handle_end_show,
  reconnect: handle_reconnect,
  chk_tabooword: handle_chk_tabooword,
  dojo_get_status: handle_dojo_get_status,
  dojo_set_slot: handle_dojo_set_slot,
  dojo_gain_soul: handle_dojo_gain_soul,
  gacha_info: handle_gacha_info,
  gacha_log: handle_gacha_log,
  req_draw_gacha: handle_req_draw_gacha,
  get_gacha_result: handle_get_gacha_result,
  cutin_gacha_play_draw: handle_cutin_gacha_play_draw,
  cutin_gacha_play_apply: handle_cutin_gacha_play_apply,
  music_gacha_play: handle_music_gacha_play,
  music_gacha_play_reserve: handle_music_gacha_play_reserve,
  gchat: handle_gchat,
  gget_stamp_info: handle_gget_stamp_info,
  player_record: handle_player_record,
  get_haifu_list: handle_get_haifu_list,
  get_haifu_data: handle_get_haifu_data,
  get_jongstone_info: handle_get_jongstone_info,
  get_mg: handle_get_mg,
  mission_date: handle_mission_date,
  present_done: handle_present_done,
  competition_entry: handle_competition_entry,
  item_gain_log: (f: any, c: any) => handle_item_log(f, c, "item_gain_log"),
  item_consume_log: (f: any, c: any) => handle_item_log(f, c, "item_consume_log"),
  janpon_log: handle_log_only,
  notice_done: (f: any, c: any) => handle_notice_ack("notice_done", "notice_done_ids", f, c),
  important_notice_done: (f: any, c: any) => handle_notice_ack("important_notice_done", "important_notice_done_ids", f, c),
  set_favorite_character: async (f: any, c: any) => {
    try {
      const oid = formGet(f, "object_id");
      const p = await getProfileBySession(formGet(f, "pcuid"));
      if (p && oid) {
        (p as any).favorite_character = String(oid).slice(0, 64);
        await saveProfile((p as any).refid, p);
      }
    } catch { }
    sendXml(c, xml_response());
  },
  odekake_done: async (f: any, c: any) => {
    // Borrow a lender's chara.
    //
    // `odekake_id` names a GRANT, not an account. The client posts the friend row's
    // FriendInfo.OdekakeDataID (FriendInfo.cs:9) straight back (MyRoomFlow.cs:194 ->
    // OdekakeDone.cs:11/:60, a long) and reads that field nowhere else in the assembly,
    // so the number is the server's to define. It is issued per (viewer, lender) onto
    // the viewer's own profile (utils.ts issueOdekakeGrant) and it is resolved only
    // against that account's own grant table (findOdekakeGrant); the lender is then
    // fetched by the refid the grant names. What this replaces - resolving the posted
    // number with getProfileByPlayerId - handed any account's save to any session that
    // posted that account's mid, a 31-bit refid-prefix hash that friend_game itself
    // used to publish. A number can now reach an account only if this server already
    // authorised that account for this caller.
    //
    // And the authorisation is a decision, not an accident: borrowableLender refuses any
    // lender without publish consent (profile.odekake_publish, data/odekake.json), and
    // a grant whose lender has stopped publishing is taken back here, on the spot.
    //
    // A denial is always code 0 + success 0, never a serv_st code: MyRoomFlow sends
    // this one with no flags (MyRoomFlow.cs:194) and RequestApiBase defaults
    // enableErrorScreenTransition to true (RequestApiBase.cs:35), so a non-zero code goes
    // through ExecErrorScreenTransition -> ErrorControl.SetError(2600, ERROR_STOP) - the
    // hard error page. success 0 is the client's own abort path (OdekakeDone.cs:27-30).
    //
    // The two states ARE the borrow: OdekakeDone.cs:31-48 turns customize_item into
    // OdekakeCustomizeData and player_game's CharaData[SelectChara] into
    // OdekakeCharaGameData + OdekakeCharaCostume (MyRoomFlow.cs:195-197), which is what
    // the match then renders (MahjongPlayFlow.cs:1596-1638, PlayerInfo.cs:245) and what
    // releases itself at the result screen (ResultFlow.cs:219 -> PlayerGameData.OdekakeInit,
    // PlayerGameData.cs:354-369). Same borrowability test the friend list publishes its
    // IsUsable flags from, so an offered row is a servable borrow - which is why a
    // denial has to be honest here rather than a row the client already committed to.
    try {
      const borrower = await getProfileBySession(formGet(f, "pcuid"));
      const oid = Number(formGet(f, "odekake_id") || 0) || 0;
      let reason = "";
      if (!borrower) {
        reason = `no profile behind pcuid=${String(formGet(f, "pcuid") || "-").slice(0, 8)}...`;
      } else if (!oid) {
        reason = "no odekake_id in the request";
      } else {
        const grant = findOdekakeGrant(borrower, oid);
        if (!grant) {
          reason = `odekake_id=${oid} is not a borrow grant this account was issued`;
        } else {
          const lender = await getProfileByRefid(grant.lender);
          if (!lender) {
            if (revokeOdekakeGrant(borrower, grant.lender)) { try { await saveProfile((borrower as any).refid, borrower); } catch { } }
            reason = `grant ${oid} names ${grant.lender}, which is no longer an account`;
          } else if (!odekakePublished(lender)) {
            if (revokeOdekakeGrant(borrower, grant.lender)) { try { await saveProfile((borrower as any).refid, borrower); } catch { } }
            reason = `grant ${oid}: ${grant.lender} has withdrawn publish consent`;
          } else {
            const b = borrowableLender(lender, borrower, (r: string) => { reason = r; });
            const payload = b ? odekakeLenderPayload(lender, b.chara) : null;
            const cb = payload ? Buffer.from(payload.customize, "utf-8").toString("base64") : "";
            const pb = payload ? Buffer.from(payload.playerGame, "utf-8").toString("base64") : "";
            if (b && payload && cb && pb) {
              vlog(`[VFG] odekake_done borrower=${(borrower as any).refid} mid=${(borrower as any).player_id} lender=${b.refid} grant=${grant.ticket} chara=${b.chara} -> success 1 (served ${pb.length}+${cb.length} b64 chars of the ${String((lender as any).states?.player_game || "").length}+${String((lender as any).states?.customize_item || "").length} stored document)`);
              sendXml(c, xml_response(
                // <id> is OdekakeInfo.FriendID (OdekakeDone.cs:15/:25) and nothing in the
                // assembly reads it, so it carries the grant, not the lender's card id.
                `<odekake><id>${grant.ticket}</id><success>1</success>` +
                `<state kind="customize_item"><data>${cb}</data></state>` +
                `<state kind="player_game"><data>${pb}</data></state></odekake>`
              ));
              return;
            }
            if (b) reason = "lender states would not build the borrow payload";
          }
        }
      }
      vlog(`[VFG] odekake_done borrower=${(borrower as any)?.refid || "-"} odekake_id=${oid} -> success 0 (${reason})`);
    } catch (e: any) {
      try { vlog(`[VFG] odekake_done error: ${e && e.message ? e.message : e}`); } catch { }
    }
    sendXml(c, xml_response(`<odekake><id></id><success>0</success></odekake>`));
  },
  eashop_done: async (f: any, c: any) => sendXml(c, xml_response()),
  chara_enabled: async (f: any, c: any) => {
    // Pickup-gacha gate: the client asks this right after a draw unlocks a
    // Chara12-21 girl (GachaResultInfo.cs:93-100) and only arms the pickup
    // notice when the answer is yes. Answer it from the schedule: active
    // exactly when an advertised banner really has a Pickup pool behind it.
    // Both fields are read off the document ROOT (CharaEnabledSend.cs:34-37 reads
    // root/is_gacha_enabled and root/end_date, baseElem = <root> from
    // RequestApiBase.cs:113), so wrapping them in <chara_enabled> made the client
    // see neither: Element() returned null and the whole parse fell through its
    // catch, leaving IsGachaEnable false and EndDate default(DateTimeOffset).
    const gate = pickupGachaGateActive();
    try { vlog(`[VFG] chara_enabled chara=${formGet(f, "enabled_chara")} pickup_gate=${gate ? 1 : 0}`); } catch {}
    sendXml(c, xml_response(`<is_gacha_enabled>${gate ? 1 : 0}</is_gacha_enabled><end_date>${EVENT_END}</end_date>`));
  },
};


// ---------------------------------------------------------------------------
// Routing: request URL -> endpoint name
// ---------------------------------------------------------------------------
// The AOG URLs the shipping client builds are not "one path segment = one
// endpoint":
//  - reconnect posts `{front}{gserv_id:00}.{tail}{gserv_url}reconnect/{appver}/
//    {session}/{webid}/` (Reconnect.cs:18): the endpoint name sits mid-path, the
//    path ends in a slash, and with a gserv_url that carries no trailing slash
//    the name is glued to the segment before it (".../1reconnect/...").
//  - every other request posts `{FrontServerUrl}/<name>` where FrontServerUrl
//    already carries the /aog path, which the client emits with a doubled slash
//    (".../aog//gget").
// A last-segment rule (core AogMiddleware.ts:13-18) extracts "" for any trailing
// slash and never sees a mid-path `reconnect`, which is how a registered route
// becomes undispatchable. Scan the segments for a registered name instead:
// deepest first, exact match before a glued-substring match, longest name first
// so gget_stamp_info is never read as gget.
export function extractAogName(pathOrUrl: string): string {
  let p = String(pathOrUrl || "");
  const cut = p.search(/[?#]/);
  if (cut >= 0) p = p.slice(0, cut);
  const scheme = p.indexOf("://");
  if (scheme >= 0) {
    const slash = p.indexOf("/", scheme + 3);
    p = slash < 0 ? "/" : p.slice(slash);
  }
  p = p.replace(/\/{2,}/g, "/");                 // .../aog//gget
  while (p.startsWith("/aog")) p = p.slice(4);   // core prefix, and the /aog<gserv_url> glue
  p = p.replace(/^\/+/, "").replace(/\/+$/, ""); // a trailing slash is not an endpoint
  if (!p) return "";
  const segs = p.split("/");
  if (Object.prototype.hasOwnProperty.call(AOG_HANDLER_MAP, p)) return p;
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    if (s && Object.prototype.hasOwnProperty.call(AOG_HANDLER_MAP, s)) return s;
  }
  const names = Object.keys(AOG_HANDLER_MAP).sort((a, b) => b.length - a.length);
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = String(segs[i] || "").toLowerCase();
    if (!s) continue;
    for (const n of names) if (s.includes(n)) return n;
  }
  return segs[segs.length - 1] || ""; // not ours: pass the raw name to the unhandled handler
}

// The core middleware calls the registered fallback as `fb(form, ctx)`
// (AogMiddleware.ts:67-76), so a fallback written to the `R.AogUnhandled(ctx)`
// signature receives the form object as its ctx, finds no ctx.res, and the
// middleware then returns having sent nothing: the client sits on a request that
// is never answered. Accept either calling convention, recover the endpoint name
// from the URL the middleware handed over, run the matching handler once, and
// always answer - the empty-success XML for anything that is not ours.
export async function handleAogUnhandled(a: any, b: any): Promise<void> {
  let ctx: any = null;
  try {
    ctx = hasRes(a) ? a : (hasRes(b) ? b : null);
    const passedForm: any = (ctx === a ? b : a) || {};
    if (!ctx || !ctx.res) {
      try { vlog(`[VFG] AOG unhandled: fallback called with no response object`); } catch { }
      return;
    }
    if (aogAnswered(ctx.res)) return; // one answer per request
    // Whichever argument carries the fields: core hands the form as the first
    // arg and mirrors it on the ctx; a (ctx)-only call has it on the ctx alone.
    const ctxForm: any = (ctx as any).form;
    const form: any = (passedForm && Object.keys(passedForm).length) ? passedForm : (ctxForm || {});
    const url: string = (ctx as any).url || (ctx.req && ((ctx.req as any).originalUrl || (ctx.req as any).url)) || "";
    const given: string = typeof (ctx as any).name === "string" ? (ctx as any).name : "";
    const name = Object.prototype.hasOwnProperty.call(AOG_HANDLER_MAP, given)
      ? given
      : (extractAogName(url) || given);
    const handler: any = Object.prototype.hasOwnProperty.call(AOG_HANDLER_MAP, name)
      ? (AOG_HANDLER_MAP as any)[name]
      : null; // never an inherited Object member (`/aog/constructor` is not a route)
    if (handler) {
      const t0 = Date.now();
      try { vlog(`[VFG] AOG ${name} keys=${Object.keys(form).join(",")} via=${url}`); } catch { }
      try {
        await handler(form, { ...ctx, name, url });
      } catch (e) {
        try { console.error(`[VFG] AOG ${name} handler threw: ${e}`); } catch { }
      } finally {
        try { vlog(`[VFG] AOG ${name} done ${Date.now() - t0}ms`); } catch { }
      }
    } else {
      try { vlog(`[VFG] AOG unhandled ${name || url || "unknown"} -> empty success`); } catch { }
    }
    if (!aogAnswered(ctx.res)) sendXml(ctx, aogEmptySuccess());
  } catch (e) {
    // Never rethrow: the core answers a throwing fallback a second time
    // (AogMiddleware.ts:70-74 `try { fb(form, ctx) } catch { fb(ctx) }`), and a
    // second pass through a fallback that dispatches handlers runs them twice.
    try { console.error(`[VFG] AOG unhandled fallback failed: ${e}`); } catch { }
    try { if (hasRes(a) && !aogAnswered(a.res)) sendXml(a, aogEmptySuccess()); } catch { }
    try { if (hasRes(b) && !aogAnswered(b.res)) sendXml(b, aogEmptySuccess()); } catch { }
  }
}

function hasRes(x: any): boolean {
  return !!x && typeof x === "object" && !!(x as any).res;
}

// Web lane card bridge (rebuild patch): the WebGL client has no native eAC3 XRPC,
// so the rebuilt client's XrpcBase (XrpcWebTransport shim) posts the card-login
// verbs as AOG form requests under /aog/<module>/<method>. Adapt the form to the
// data shape the XRPC card handlers already read (cardAttr on @attr), run the very
// same canonical handler (eamuse.ts handleCardmng/handleVfgac - the self-presentation
// and credential-stamp rules live there, not here), and translate its send calls
// into one eAC3-shaped <response><module .../></response> document the client shim
// parses. Card verbs are only ever reachable here through the hosted front's own
// session gate; no card rule is bypassed by this surface.
const CARD_BRIDGE_MODULES: Record<string, string> = {
  inquire: "cardmng",
  getrefid: "cardmng",
  authpass: "cardmng",
  bindmodel: "cardmng",
  bindcard: "cardmng",
  getdatalist: "cardmng",
  update_refer: "vfgac",
};

async function handle_card_bridge(form: any, ctx: any): Promise<void> {
  const given = (typeof ctx.name === "string" && CARD_BRIDGE_MODULES[ctx.name]) ? ctx.name : "";
  if (!given) {
    sendXml(ctx, aogEmptySuccess());
    return;
  }
  const module_name = CARD_BRIDGE_MODULES[given];
  const info = {
    gameCode: "MFG",
    module: module_name,
    method: given,
    model: String(form.model || "MFG"),
    pcbid: String(form.pcbid || ""),
    ip: "127.0.0.1",
  };
  const data = {
    "@attr": {
      cardid: String(form.cardid || ""),
      refid: String(form.refid || ""),
      passwd: String(form.passwd || form.pass || ""),
      cardtype: String(form.cardtype || ""),
      update: String(form.update || "0"),
      ref_id: String(form.ref_id || ""),
      data_id: String(form.data_id || ""),
      model: String(form.model || ""),
    },
  };
  let answered = false;
  const emit = (attrs: Record<string, any>) => {
    if (answered || aogAnswered(ctx.res)) return;
    answered = true;
    const parts: string[] = [];
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined) continue;
      parts.push(`${k}="${xml_escape(String(v))}"`);
    }
    sendXml(ctx, `<?xml version="1.0" encoding="UTF-8"?>\n<response><${module_name}${parts.length ? " " + parts.join(" ") : ""}/></response>`);
  };
  const send = {
    status: async (n: number) => emit({ status: n }),
    object: async (content: any, options?: any) => {
      const attrs: Record<string, any> = { status: 0, ...((content && content["@attr"]) || {}) };
      if (options && options.status !== undefined) attrs.status = options.status;
      emit(attrs);
    },
    success: async () => emit({ status: 0 }),
  };
  try {
    if (module_name === "vfgac") await handleVfgac(info, data, send);
    else await handleCardmng(info, data, send);
  } catch (e) {
    try { console.error(`[VFG] card bridge ${module_name}.${given} threw: ${e}`); } catch { }
  }
  if (!answered && !aogAnswered(ctx.res)) sendXml(ctx, aogEmptySuccess());
}

// register (every handler wrapped: entry/exit/errors go through vlog so a
// single VFG_VERBOSE flag controls all per-request diagnostics)
export function registerAogRoutes(): void {
  for (const [name, handler] of Object.entries(AOG_HANDLER_MAP)) {
    const wrapped = async (form: any, ctx: any) => {
      const t0 = Date.now();
      try {
        const keys = form ? Object.keys(form).join(",") : "";
        vlog(`[VFG] AOG ${name} keys=${keys}`);
      } catch { }
      try {
        await (handler as any)(form, ctx);
      } catch (e) {
        // Answer here, once. Rethrowing hands the request to the core
        // middleware, whose catch sends its own empty success
        // (AogMiddleware.ts:82-87) - on a res this side may already have
        // flushed, which throws inside the middleware and leaves the client
        // with no bytes at all.
        try { console.error(`[VFG] AOG ${name} handler threw: ${e}`); } catch { }
        try { if (ctx && ctx.res && !aogAnswered(ctx.res)) sendXml(ctx, aogEmptySuccess()); } catch { }
      } finally {
        try { vlog(`[VFG] AOG ${name} done ${Date.now() - t0}ms`); } catch { }
      }
    };
    // @ts-ignore - R.AogRoute is injected by RyuNET
    if (typeof R !== "undefined" && R.AogRoute) R.AogRoute(name, wrapped as any);
  }
  // @ts-ignore - R.AogUnhandled is injected by RyuNET
  if (typeof R !== "undefined" && R.AogUnhandled) R.AogUnhandled(handleAogUnhandled as any);
}
