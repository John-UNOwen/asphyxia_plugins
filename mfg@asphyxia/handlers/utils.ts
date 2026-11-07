// @ts-ignore - Asphyxia globals injected at runtime
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

// constants
export const LOCATION_ID = "VFG00001";
export const FACILITY_NAME = "LOCAL TEST";
export const COUNTRY = "JP";
export const REGION = "13";

export const HOST = "127.0.0.1";
export const PORT = 8083;

export const CARDMNG_SHADOW_MODULE = "vfgcard";
export const DEFAULT_CARDID = "E0047CC78DFBA459";
export const PASELI_BALANCE = 57300;

// xml helpers
export function xml_escape(text: any): string {
  const s = text == null ? "" : String(text);
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "") // Strip invalid XML 1.0 control characters
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function kitem(tag: string, typ: string, value: any = "", extraAttrs: Record<string, any> = {}): string {
  const extra = Object.entries(extraAttrs)
    .filter(([, v]) => v != null)
    .map(([k, v]) => ` ${k}="${xml_escape(v)}"`)
    .join("");
  if (value === "" || value == null) {
    return `<${tag} __type="${typ}"${extra} />`;
  }
  return `<${tag} __type="${typ}"${extra}>${xml_escape(value)}</${tag}>`;
}

// serv_st/code values the shipping client can act on. They are only ever sent
// on endpoints the client calls with enableErrorScreenTransition:false
// (GameDataManager.cs:135-160, and every MFG.GameData/*.Save which catches
// NetworkResponseException and sets PlayerConfig.IsDataSaveFailed -
// PlayerGameData.cs:440-444, ResultFlow.cs:241-245, GameoverFlow.cs:29), so a
// non-zero code here is the protocol's recoverable "this failed" signal: the
// client marks the save failed / re-logs in instead of believing the write
// landed. It is NOT the ERROR_STOP error screen (RequestApiBase.cs:127-141,
// 181-189) - that one is what a non-zero code on entry_game/gget/gpost (or a
// non-XML body) produces (MatchingFlow.cs:216), and those endpoints keep
// answering code 0. Both values are members of the client's own
// Konami.System.Net.StatusCode enum (DataNotFound=770, DataError=803).
export const SERV_ST_SESSION_LOST = 770; // no live profile behind this session: re-login
export const SERV_ST_STATE_INVALID = 803; // payload rejected: parse or validation failure
// StatusCode.AlreadyFinishedTransaction: a play whose reserve ticket is not open on
// this profile (never issued, already consumed, or issued to another account).
export const SERV_ST_ALREADY_FINISHED = 930;
// StatusCode.DataNotFound for its literal meaning: the taikyoku the request
// addressed is not a table this server has (gget/gpost must segment 3, the tid=
// of end_game / kiken_game / get_haifu_data). entry_game, gget, gpost, end_game
// and kiken_game are all sent with enableErrorScreenTransition: true
// (MatchingFlow.cs:216, MahjongPlayFlow.cs:762,772, CommandClient.cs:123,178,187),
// so a non-zero code here is the client's defined outcome for a table that no
// longer exists - it leaves the seat instead of sitting on a server that has no
// state behind the tid it was told. Answering code 0 instead makes the client
// play on: the server then has to invent the seat, the command acknowledgement
// and the settlement it never computed.
export const SERV_ST_NO_TABLE = 770;
// StatusCode.DataNotFound for the account side of the same answer: /login and
// /create_player were handed a user_id that is not an account at all (a legacy
// MID phantom document). Both endpoints are posted with
// enableErrorScreenTransition:false (GameDataManager.cs:135-141, and the guest
// CreatePlayer at :135), so a non-zero code here is the client's recoverable
// path - ExecLoadAtCardEntry catches it (:168-173), reports
// ENTRY_NETWORK_ERROR and never receives a session_id to write states with.
export const SERV_ST_ACCOUNT_NOT_FOUND = 770;

export function serv_st(code: number): string {
  return `<serv_st><code>${Number(code) || 0}</code></serv_st>`;
}

export function serv_st_ok(): string {
  return serv_st(0);
}

export function xml_response(...chunks: string[]): string {
  const body = chunks.join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<root>${serv_st_ok()}${body}</root>`;
}

// Same envelope as xml_response, explicit status code. A rejection is always a
// well-formed XML answer with serv_st/code != 0 - never an empty body, never an
// error page the shipping parser (RequestApiBase.cs:113 XDocument.Parse) chokes on.
export function xml_error(code: number, ...chunks: string[]): string {
  const body = chunks.join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<root>${serv_st(code)}${body}</root>`;
}

export function formGet(form: Record<string, string>, ...keys: string[]): string {
  // last arg may be default if keys length >1 and we want default param? Keep simple: find first present key
  for (const k of keys) {
    if (k in form && form[k] != null && form[k] !== "") return form[k];
  }
  return "";
}

export function formGetDefault(form: Record<string, string>, key: string, def: string): string {
  const v = form[key];
  if (v == null || v === "") return def;
  return v;
}

export function parseMust(form: Record<string, string>): string[] {
  return (formGet(form, "must") || "").split("/");
}

export function mustInt(parts: string[], index: number, def: number = 0): number {
  try {
    if (parts.length > index && parts[index] !== "") return parseInt(parts[index], 10) || def;
    return def;
  } catch {
    return def;
  }
}

export function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

// Verbose logging gate: per-request/per-player logs go through vlog() and
// are silent by default. Enable with VFG_VERBOSE=1/true/on/yes in config.
// console.error stays untouched (real errors always show).
export function isVerbose(): boolean {
  try {
    const v = U.GetConfig("VFG_VERBOSE");
    if (v == null || v === false || v === 0) return false;
    const s = String(v).trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes" || s === "on";
  } catch { return false; }
}

export function vlog(...args: any[]): void {
  try { if (isVerbose()) console.log(...args); } catch { }
}

// Fresh cc_request body: exactly what a new save carries (now_idx 1, empty).
export const CC_REQUEST_FRESH = `{"DataVersion":1,"now_idx":1,"done_idx":0,"m_ccInfos":[]}`;

export interface CcSanitizeResult {
  ok: boolean;
  clean: string;
  changed: boolean;
  dropped: number;
}

// Validate + canonicalize a cc_request payload (CardConnectGameData:
// {DataVersion, now_idx, done_idx, m_ccInfos:[{idx,kind,param,name}]}).
// Mirrors the client's own Validate(): drops entries with idx <= done_idx
// and recomputes now_idx = done_idx + count + 1. Returns ok:false when the
// payload is unsalvageable (not a JSON object / m_ccInfos not an array).
export function sanitizeCcRequest(raw: string): CcSanitizeResult {
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      return { ok: false, clean: CC_REQUEST_FRESH, changed: true, dropped: 0 };
    }
    const done = Number.isInteger((obj as any).done_idx) ? (obj as any).done_idx : 0;
    const vers = Number.isInteger((obj as any).DataVersion) ? (obj as any).DataVersion : 1;
    const list = (obj as any).m_ccInfos;
    if (!Array.isArray(list)) {
      return { ok: false, clean: CC_REQUEST_FRESH, changed: true, dropped: 0 };
    }
    const kept: Array<{ idx: number; kind: string; param: string; name: string }> = [];
    let dropped = 0;
    for (const e of list) {
      if (e && typeof e === "object" && !Array.isArray(e)
        && Number.isInteger((e as any).idx)
        && typeof (e as any).kind === "string"
        && typeof (e as any).param === "string"
        && typeof (e as any).name === "string") {
        if ((e as any).idx <= done) { dropped++; continue; } // client Validate()
        kept.push({ idx: (e as any).idx, kind: (e as any).kind, param: (e as any).param, name: (e as any).name });
      } else {
        dropped++;
      }
    }
    const clean = JSON.stringify({ DataVersion: vers, now_idx: done + kept.length + 1, done_idx: done, m_ccInfos: kept });
    let changed = dropped > 0;
    try { changed = changed || JSON.stringify(obj) !== clean; } catch { changed = true; }
    return { ok: true, clean, changed, dropped };
  } catch {
    return { ok: false, clean: CC_REQUEST_FRESH, changed: true, dropped: 0 };
  }
}

// player id helpers (port of Python _player_id_from_refid)
export function playerIdFromRefid(refid: string): number {
  const prefix = (refid || "").slice(0, 8);
  try {
    const v = parseInt(prefix, 16);
    if (!isNaN(v)) return (v & 0x7fffffff) || 1;
  } catch { }
  // fallback hash via simple djb2
  let h = 5381;
  const s = refid || "GUEST";
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0 & 0x7fffffff) || 1;
}

export function newRefid(): string {
  const len = 16;
  // Asphyxia style: letter + 15 hex
  // use random hex
  const hex = "0123456789ABCDEF";
  let r = "A";
  for (let i = 1; i < len; i++) r += hex[Math.floor(Math.random() * 16)];
  return r;
}

export function pcode(refid: string): string {
  try {
    const v = parseInt((refid || "A").slice(0, 8), 16);
    if (!isNaN(v)) return String(v % 100000000).padStart(8, "0");
  } catch { }
  return "00000001";
}

export function sanitizePin(raw: string, fallback: string = "0000"): string {
  const s = (raw || "").trim();
  if (/^\d{4}$/.test(s)) return s;
  if (/^\d{4}$/.test(fallback || "")) return fallback;
  return "0000";
}

// DB wrappers (Asphyxia plugin DB)
// Use collection: "profile" for per-refid data
export interface ProfileDoc {
  collection?: string;
  refid: string;
  name: string;
  player_id: number;
  session_id?: string;
  is_guest?: boolean;
  states: Record<string, string>;
  dojo?: any[];
  gacha_txn?: any;
  // Outstanding /music_gacha_play_reserve tickets: [{id, series, at}]. Server-side
  // so a play is validated against what this account actually reserved.
  music_gacha_reserves?: Array<{ id: number; series: number; at: number }>;
  // Sessions this account has already superseded: [{session_id, at}]. The
  // account's own statement that a pcuid is retired, stored on the profile
  // document (see EVICTED_SESSIONS below) so it outlives the process that
  // retired the session.
  evicted_sessions?: Array<{ session_id: string; at: number }>;
  // Publish consent for the character borrow. Server-owned: the shipping client has
  // no publish request, no opt-in window and no field for it (see the odekake note
  // below). Persisted so an account's lending state is auditable on its own document.
  odekake_publish?: { published: number; at: number; by: string };
  // Borrow grants this account was issued: { "<LENDER REFID>": { ticket, at } }.
  // The ticket is what the account's friend rows carry as OdekakeDataID and what it
  // posts back as odekake_id, so the borrow resolves against this table.
  odekake_grants?: Record<string, { ticket: number; at: number }>;
  // Set by quarantinePhantomProfiles on a legacy MID phantom left in the savedata:
  // the row is kept (states and all, for audit) with every field that could name it
  // as an account removed. Its presence refuses the document on its own, so a
  // repaired phantom stays refused even if its refid is renamed by hand.
  phantom_quarantine?: { at: number; from_mid: number; states_kept: number };
  created_at?: number;
  updated_at?: number;
}

export function normalizeRefid(refid: string): string {
  return (refid || "").trim().toUpperCase();
}

export async function getProfileByRefid(refid: string): Promise<ProfileDoc | null> {
  const norm = normalizeRefid(refid);
  if (!norm) return null;
  // A legacy MID phantom is not a read identity either. This is the resolver the
  // card flow (eamuse.ts saveCardToProfile and the card lookup), the odekake lender
  // lookups and create_player's card mirror call directly, so the refusal has to
  // live here and not only in the login handler that happens to check first.
  // The refusal also names the row for repair: a request that claims a phantom
  // refid is exactly the moment that document is still being treated as an
  // account, and the stored row has to stop being one (see _repairPhantomByRefid).
  if (isPhantomRefid(norm)) { _repairPhantomByRefid(norm); _refusePhantomProfile(norm, "getProfileByRefid"); return null; }
  // Fast path: in-memory cache (correct API needs refid-first queries,
  // so cache is the only thing that worked before this fix)
  const cached = _profileByRefid.get(norm);
  if (cached) {
    if (isPhantomProfile(cached)) { _refusePhantomProfile(String((cached as any).refid || norm), "getProfileByRefid", cached); return null; }
    return cached;
  }
  try {
    // Correct Asphyxia API: refid first, query second (ProfileSpace).
    // Old code used DB.FindOne({ collection: "profile", refid }) which
    // queries PluginSpace and ALWAYS misses.
    // @ts-ignore
    const doc = await DB.FindOne(norm, { collection: "profile" });
    if (doc && !isPhantomProfile(doc)) {
      // Normalize stored refid casing once
      if ((doc as any).refid && normalizeRefid((doc as any).refid) !== norm) (doc as any).refid = norm;
      _cacheProfile(doc);
      return doc;
    }
    if (doc) _refusePhantomProfile(String((doc as any).refid || norm), "getProfileByRefid", doc);
  } catch { }
  // Slow fallback: full scan (handles legacy docs saved with odd casing)
  try {
    // @ts-ignore
    const all: ProfileDoc[] = await DB.Find(null, { collection: "profile" });
    if (all) for (const p of all) {
      _cacheProfile(p);
      if (normalizeRefid((p as any).refid) === norm && !isPhantomProfile(p)) return p;
    }
  } catch { }
  return null;
}

// A session that just resolved to a live account marks that account active. This
// is the activity the loginGate's takeover rule weighs for a card-less account
// (see the account boundary block below), and it lives here because every
// account-resolving path in the plugin ends up in this function.
function _liveSession(p: ProfileDoc): ProfileDoc {
  touchSessionActivity(p);
  return p;
}

export async function getProfileBySession(pcuid: string): Promise<ProfileDoc | null> {
  if (!pcuid) return null;
  const sess = String(pcuid);
  // A retired session resolves to nothing before anything is looked up: the
  // cache answers first, and the scan below refills that cache from the profile
  // documents, so a session a re-login superseded stays dead across a restart.
  // A session that lands on a legacy MID phantom resolves to nothing for
  // the same reason: this is where every handler in the plugin inherits the
  // phantom refusal (dojoProfile, the gacha handlers, myArchives,
  // set_favorite_character, odekake_done all call this function directly).
  if (isEvictedSession(sess)) return null;
  // Fast path: in-memory cache
  const cached = _profileBySession.get(sess);
  // Guard against stale sessions: after relog the same profile object gets
  // a new session_id, so an old pcuid must NOT resolve anymore.
  if (cached) {
    if (String((cached as any).session_id) === sess) {
      if (sessionRetiredOn(cached, sess)) return _refuseRetiredSession(cached, sess);
      // A legacy MID phantom is not an account either. It is dropped from
      // the session cache and the lookup falls through to the DB reads below,
      // so a phantom that carries someone else's stale pcuid cannot shadow the
      // real document behind that pcuid.
      if (isPhantomProfile(cached)) _refusePhantomSession(cached, sess);
      else return _liveSession(cached);
    }
    _profileBySession.delete(sess);
  }
  try {
    // @ts-ignore
    let doc: ProfileDoc | null = await DB.FindOne(null, { collection: "profile", session_id: sess });
    if (doc && !isPhantomProfile(doc)) {
      // The document outranks its own session field: a pcuid it lists as
      // superseded is dead even if some write path left it in session_id.
      if (sessionRetiredOn(doc, sess)) return _refuseRetiredSession(doc, sess);
      _cacheProfile(doc);
      return _liveSession(doc);
    }
    // Phantom (or nothing found): fall through to the scan, which still finds a
    // real document behind this pcuid when one exists.
    if (doc) _refusePhantomSession(doc, sess);
  } catch { }
  try {
    // @ts-ignore
    const all: ProfileDoc[] = await DB.Find(null, { collection: "profile" });
    if (all) {
      let found: ProfileDoc | null = null;
      for (const p of all) {
        _cacheProfile(p);
        if (String((p as any).session_id) === sess) {
          if (sessionRetiredOn(p, sess)) { _refuseRetiredSession(p, sess); continue; }
          if (isPhantomProfile(p)) { _refusePhantomSession(p, sess); continue; }
          found = p;
        } else if (sessionRetiredOn(p, sess)) {
          // Cold start: an account's own document still names this pcuid as
          // superseded, so the reason is known here instead of being re-derived
          // from the absence of a match.
          _tombstoneSession(sess, String((p as any).refid || ""));
        }
      }
      return found ? _liveSession(found) : null;
    }
  } catch { }
  return null;
}

export async function getProfileByPlayerId(mid: number): Promise<ProfileDoc | null> {
  const num = Number(mid);
  if (!num) return null;
  // A MID phantom is exactly what a mid lookup finds: the orphan fork keyed
  // its document by the padded mid and set player_id to that mid, which is why
  // the audit's MID00998877 was "reachable only via mid-based lookups", and the
  // phantom is refused here for the same reason as everywhere else.
  //
  // As of the borrow fix this has no caller in the plugin. The two mid-as-identity
  // lookups it existed for - odekake_done resolving the lender from the posted
  // odekake_id, and seedFriendGameState re-resolving a stored row when its refid
  // missed - now resolve a grant this server issued onto the requesting account
  // (findOdekakeGrant, below), so a posted number reaches an account only through a
  // record that already authorised it. Nothing in the plugin chooses an account from
  // a mid anymore.
  const cached = _profileByPlayerId.get(num);
  if (cached && Number((cached as any).player_id) === num) {
    if (isPhantomProfile(cached)) { _refusePhantomProfile(String((cached as any).refid || ""), "getProfileByPlayerId", cached); return null; }
    return cached;
  }
  try {
    // @ts-ignore
    const doc: ProfileDoc | null = await DB.FindOne(null, { collection: "profile", player_id: num });
    if (doc && !isPhantomProfile(doc)) { _cacheProfile(doc); return doc; }
    if (doc) _refusePhantomProfile(String((doc as any).refid || ""), "getProfileByPlayerId", doc);
  } catch { }
  try {
    // @ts-ignore
    const all: ProfileDoc[] = await DB.Find(null, { collection: "profile" });
    if (all) {
      let found: ProfileDoc | null = null;
      for (const p of all) {
        _cacheProfile(p);
        if (Number((p as any).player_id) !== num) continue;
        if (isPhantomProfile(p)) { _refusePhantomProfile(String((p as any).refid || ""), "getProfileByPlayerId", p); continue; }
        found = p;
      }
      return found;
    }
  } catch { }
  return null;
}

async function findFreePlayerId(base: number, excludeRefid: string): Promise<number> {
  let cand = base || 1;
  const excl = normalizeRefid(excludeRefid);
  for (let i = 0; i < 10000; i++) {
    if (cand <= 0) cand = 1;
    const hit = _profileByPlayerId.get(Number(cand));
    if (hit && normalizeRefid((hit as any).refid) !== excl) { cand++; continue; }
    try {
      // @ts-ignore
      const doc: any = await DB.FindOne(null, { collection: "profile", player_id: Number(cand) });
      if (doc && normalizeRefid(doc.refid) !== excl) { if (doc) _cacheProfile(doc); cand++; continue; }
    } catch { }
    return Number(cand);
  }
  return Number(cand);
}

// Core APIUpsert cancels plugin refid upserts unless the refid resolves to a core
// profile or a lightweight core refid_alias (EamuseIO.FindProfile guard). Browser/
// NETCAFE logins never create a core card profile, so mint the alias first - the
// core's own EnsurePhantomProfile helper exists for exactly this ("so plugin saves
// work", VFG = MFG). Without it every profile write silently returns updated:0.
async function ensureCoreAlias(refid: string): Promise<void> {
  try {
    const io = require("../../../utils/EamuseIO");
    if (io && typeof io.EnsurePhantomProfile === "function") await io.EnsurePhantomProfile(refid, "VFG");
  } catch (e: any) {
    vlog(`[VFG] core alias failed refid=${refid}: ${e && e.message ? e.message : e}`);
  }
}

export async function ensureProfile(refid: string, name: string = "GUEST"): Promise<ProfileDoc | null> {
  const norm = normalizeRefid(refid) || "GUEST";
  // A MID-prefixed refid is never adopted and never minted. This is the function the
  // removed orphan fork went through (saveState -> ensureProfile("MID00998877")),
  // and /login and /create_player call it with whatever user_id the request
  // named (Login.cs:20 posts user_id=Account.DataID), so it is where minting a
  // phantom - or handing an existing one to login to write a live session into -
  // has to be refused. Callers that get null answer an error code.
  if (isMintForbiddenRefid(norm)) { _refusePhantomProfile(norm, "ensureProfile"); return null; }
  let p = await getProfileByRefid(norm);
  if (p) {
    // Lazily fix legacy player_id collisions (e.g. ABA7824B* share prefix):
    // if another cached/DB profile owns this player_id, mint a free one.
    try {
      const owner = _profileByPlayerId.get(Number((p as any).player_id));
      if (owner && normalizeRefid((owner as any).refid) !== norm) {
        (p as any).player_id = await findFreePlayerId(Number((p as any).player_id) + 1, norm);
        await saveProfile(norm, p);
      }
    } catch { }
    // Only ever upgrade GUEST -> real name. Never downgrade, never touch states/session here.
    if (name && name !== "GUEST" && (p as any).name === "GUEST") {
      (p as any).name = name;
      await saveProfile(norm, p);
    }
    return p;
  }
  let pid = playerIdFromRefid(norm);
  pid = await findFreePlayerId(pid, norm);
  const doc: ProfileDoc = {
    collection: "profile",
    refid: norm,
    name,
    player_id: pid,
    // music_gacha is authored here, not by the client (see musicGachaSeedState):
    // a fresh account starts with every advertised music series present at 0 / N.
    states: { music_gacha: musicGachaSeedState() },
    created_at: nowUnix(),
  };
  try {
    await ensureCoreAlias(norm);
    // @ts-ignore - refid-first upsert targets ProfileSpace
    await DB.Upsert(norm, { collection: "profile" }, doc);
  } catch (e: any) {
    vlog(`[VFG] profile upsert failed refid=${norm}: ${e && e.message ? e.message : e}`);
  }
  _cacheProfile(doc);
  return doc;
}

export async function saveProfile(refid: string, doc: ProfileDoc): Promise<void> {
  const norm = normalizeRefid(refid) || normalizeRefid((doc as any).refid) || "GUEST";
  // Last-line write barrier: every profile document in the plugin is persisted
  // through this function (ensureProfile's own upsert is the only other one, and it
  // refuses the whole MID + digits family), so no code path - session resolver, mid
  // lookup, state helper, core alias - can leave a byte on a legacy MID phantom
  // document.
  if (isPhantomRefid(norm)) { _refusePhantomProfile(norm, "saveProfile"); return; }
  (doc as any).refid = norm;
  (doc as any).updated_at = nowUnix();
  try {
    await ensureCoreAlias(norm);
    // @ts-ignore
    await DB.Upsert(norm, { collection: "profile" }, doc);
  } catch (e: any) {
    vlog(`[VFG] profile save failed refid=${norm}: ${e && e.message ? e.message : e}`);
  }
  _cacheProfile(doc);
}

// Documents the removed saveState fork used to mint for a mid that matched no
// profile: "MID" + String(mid).padStart(8, "0") (normalizeRefid uppercases). Rows of
// this shape are sitting in existing savedata, so they have to be recognised: a legacy
// phantom is never a read identity and never a write target. A request that only
// resolves to one is reported as session-lost instead of quietly landing on a
// document no account ever logs into.
//
// The shape is MID + AT LEAST 8 digits. padStart only pads, it never truncates, so a
// mid with more than 8 digits produces a LONGER refid. This server's accounts do carry
// 10-digit mids (1793446050, 1793447266, 1793448448: playerIdFromRefid of their
// 6AE5D0A2* refids), so MID1793446050 is the refid the fork would have written for
// them - and no document of that length exists in this savedata: .audit/p9_phantom_scan.js
// reports 118 profile documents, 3 MID-prefixed, every one of them MID + exactly 8
// digits, 0 missed by an exactly-8 pattern. So the wider pattern is not repairing a
// long document someone left behind; it closes the mint path. Measured pre-fix on the
// deployment's own savedata (tmp/p9repro/out_deploy_pre_unseeded.txt sections 3a/3):
// /login answered code 0 with a session for user_id=MID1793446050 and CREATED that
// document, and ensureProfile minted MID1793449999 and the near-miss MID1234567. The
// one row the old exactly-8 pattern did recognise, MID00998877, was already refused
// by /login pre-fix (same output, section 3 first line).
// The whole MID-prefixed family, not just the fork's digit spelling: the deployment
// savedata also carried MIDGUESS0001 (MID + letters, minted by an audit probe's
// /login, states only music_gacha/present_box_game/player_item, no player_game and no
// card - probe residue, not an account). A real MFG DataID is hex (M and I are not
// hex characters) or a lane dataid like MFGTESTGUEST1, so refusing every MID-prefixed
// identity cannot refuse a legitimate one.
const PHANTOM_REFID_RE = /^MID[A-Z0-9]+$/;

// The mint guard, widened with the recognising: any MID-prefixed refid. /login and
// /create_player check it before calling ensureProfile, and ensureProfile checks it
// itself (it is the function the fork went through), so no caller can mint a
// near-miss orphan either (MID1234567: too short to be the fork's shape, same orphan
// family; MIDGUESS0001: the letters spelling, now refused at the gate too). A real
// MFG DataID is hex (6AE5D0A2F7B97EB7, or the core's A + 15 hex), so no legitimate
// refid is inside this set.
const MINT_FORBIDDEN_REFID_RE = /^MID/;

export function isPhantomRefid(refid: string): boolean {
  return PHANTOM_REFID_RE.test(String(refid || ""));
}

export function isMintForbiddenRefid(refid: string): boolean {
  return MINT_FORBIDDEN_REFID_RE.test(String(refid || ""));
}

// A document quarantinePhantomProfiles already repaired. The flag refuses it on its
// own, so a quarantined row stays dead even if something renames its refid later.
export function isQuarantinedProfile(p: ProfileDoc | null): boolean {
  return !!p && !!(p as any).phantom_quarantine;
}

export function isPhantomProfile(p: ProfileDoc | null): boolean {
  return !!p && (isPhantomRefid(String((p as any).refid || "")) || isQuarantinedProfile(p));
}

function _refusePhantomProfile(refid: string, where: string, doc?: ProfileDoc): void {
  vlog(`[VFG] ${where} refused refid=${refid}: legacy MID phantom document (orphan fork of the removed mid fallback) - not an account, not a write target`);
  if (doc) _repairPhantomOnTouch(doc);
}

// A phantom carrying this pcuid is not the account behind it: drop it out of
// the session cache so the lookup falls through to the real documents, and say
// why. The pcuid is NOT tombstoned - a phantom's stale session_id is not
// evidence that the pcuid was retired, and a real session must still resolve.
function _refusePhantomSession(p: ProfileDoc, sess: string): void {
  try { _profileBySession.delete(String(sess)); } catch { }
  _refusePhantomProfile(String((p as any).refid || ""), "getProfileBySession", p);
}

// The stored repair, fired by a read that just refused the document, not only by
// the boot pass. quarantinePhantomProfiles runs once, from register(), so on a core
// that is not restarted the stored documents are never repaired: the refusal lives
// in the process and the rows stay live rows in the savedata until someone boots
// the plugin again. Every resolver above has the document in hand at the moment it
// refuses it, and _cacheProfile is the funnel every full-profile scan walks rows
// through, so the same update happens here too. Once per refid per process
// (_phantomRepairFired), fire-and-forget: no request waits on a repair, the
// refusals already stand on their own, and the update is idempotent.
const _phantomRepairFired = new Set<string>();
const _PHANTOM_REPAIR_TRACK_MAX = 512;   // a caller can name any refid; the set is a memo, not a ledger

function _phantomRepairClaim(key: string): boolean {
  if (!key || _phantomRepairFired.has(key)) return false;
  if (_phantomRepairFired.size >= _PHANTOM_REPAIR_TRACK_MAX) return false;
  _phantomRepairFired.add(key);
  return true;
}

function _repairPhantomOnTouch(p: ProfileDoc): void {
  let stored = "";
  try { stored = String((p as any).refid || ""); } catch { return; }
  if (!stored || (p as any).phantom_quarantine) return;   // already dead data
  // Only the fork's own shape is repaired by refid. A row refused because it was
  // renamed keeps its bytes as they are - isPhantomProfile refuses it on its flag,
  // and rewriting an ordinary document because some helper called it a phantom is
  // not this repair's job.
  if (!PHANTOM_REFID_RE.test(normalizeRefid(stored))) return;
  if (!_phantomRepairClaim(normalizeRefid(stored))) return;
  void _applyPhantomQuarantine(stored, p, "read").catch(() => { });
}

// Same repair for a phantom that is refused before it is ever read: getProfileByRefid
// answers a MID-prefixed refid from the shape alone, so the row would otherwise stay
// untouched for as long as nobody scans the collection. One keyed read per refid per
// process, then the normal update.
function _repairPhantomByRefid(norm: string): void {
  if (!PHANTOM_REFID_RE.test(norm)) return;
  if (!_phantomRepairClaim(norm)) return;
  (async () => {
    // @ts-ignore - ProfileSpace lookup keyed by the refid the request named
    const doc: ProfileDoc | null = await DB.FindOne(norm, { collection: "profile" });
    if (!doc || (doc as any).phantom_quarantine) return;
    const stored = String((doc as any).refid || norm);
    if (!PHANTOM_REFID_RE.test(normalizeRefid(stored))) return;
    await _applyPhantomQuarantine(stored, doc, "read");
  })().catch(() => { });
}

// The stored half of the same refusal. Recognising the shape at read time keeps a
// phantom from resolving, but the documents the fork left behind stay in the
// savedata: they still carry a player_id a mid lookup can hit, a session_id a pcuid
// can hit, and a card binding the card flow can follow. This strips the fields that
// make any of those possible and marks the row, so the orphan is dead data instead
// of a live identity that only the code refuses.
//
// It writes through DB.Update, not saveProfile: saveProfile is the write barrier
// that refuses this refid on purpose, and the repair is the one thing that has to
// reach the row. An operator update needs no core refid alias either, so it works on
// a document whose core alias is already gone. Idempotent: a row that already
// carries phantom_quarantine is never sent here (see quarantinePhantomProfiles and
// _repairPhantomOnTouch). `where` names which trigger ran it - the boot pass or a
// read - because the log line is the audit trail for how a savedata got clean.
async function _applyPhantomQuarantine(stored: string, p: ProfileDoc, where: string): Promise<boolean> {
  const at = nowUnix();
  const fromMid = Number((p as any).player_id || 0) || 0;
  const statesKept = Object.keys((p as any).states || {}).length;
  try {
    // @ts-ignore - operator update on ProfileSpace, keyed by the stored refid
    const res: any = await DB.Update(stored, { collection: "profile" }, {
      $set: {
        refid: normalizeRefid(stored),
        name: "GUEST",
        player_id: 0,
        session_id: "",
        updated_at: at,
        phantom_quarantine: { at, from_mid: fromMid, states_kept: statesKept },
      },
      $unset: {
        card_id: "", card_issued: "", card_bound: "", card_pin: "", card_updated_at: "",
        odekake_publish: "", odekake_grants: "", evicted_sessions: "",
        music_gacha_reserves: "", gacha_txn: "", dojo: "", last_daily: "", session_at: "",
      },
    });
    if (res && Number(res.updated) === 0) {
      vlog(`[VFG] phantom quarantine refid=${stored}: DB.Update matched no row (document left as it is)`);
      return false;
    }
  } catch (e: any) {
    vlog(`[VFG] phantom quarantine refid=${stored} failed: ${e && e.message ? e.message : e}`);
    return false;
  }
  // Drop whatever this process already cached off the old fields: an in-memory
  // session or mid entry is the same hole the stored session_id is.
  _evictProfileCache(p);
  vlog(`[VFG] quarantined legacy phantom profile refid=${stored} via=${where} (mid=${fromMid} session cleared, states kept=${statesKept})`);
  return true;
}

// The same repair as a scan of the whole profile collection, run when the plugin
// loads. It is not the only trigger any more: _repairPhantomOnTouch applies the
// identical update to any phantom a resolver reads, so a savedata is repaired by a
// server that is running, not only by one being started.
export async function quarantinePhantomProfiles(): Promise<{ scanned: number; quarantined: number; already: number }> {
  let all: ProfileDoc[] = [];
  try {
    // @ts-ignore - ProfileSpace scan: refid=null matches every plugin profile document
    all = (await DB.Find(null, { collection: "profile" })) || [];
  } catch (e: any) {
    vlog(`[VFG] phantom quarantine scan failed: ${e && e.message ? e.message : e}`);
    return { scanned: 0, quarantined: 0, already: 0 };
  }
  let quarantined = 0;
  let already = 0;
  for (const p of all) {
    // The row is keyed by the spelling it was saved with (legacy documents exist in
    // lower case); only the shape test is on the normalized form.
    const stored = String((p as any).refid || "");
    if (!stored || !PHANTOM_REFID_RE.test(normalizeRefid(stored))) continue;
    // Defensive exemption: a MID-prefixed document that carries a card binding or a
    // player_game state is treated as an ordinary account, not fork residue - the
    // family regex is wide, and no live account in this deployment looks like that
    // (real DataIDs are hex), but a false quarantine of a playing account is worse
    // than leaving a stray row that every resolver already refuses.
    const st: any = (p as any).states || {};
    if ((p as any).card_id || st.player_game) {
      vlog(`[VFG] phantom scan skipped refid=${stored}: MID-prefixed but carries card_id/player_game - treated as ordinary account`);
      continue;
    }
    if ((p as any).phantom_quarantine) {
      already++;
      _evictProfileCache(p);
      _phantomRepairFired.add(normalizeRefid(stored));
      continue;
    }
    if (await _applyPhantomQuarantine(stored, p, "boot")) quarantined++;
  }
  return { scanned: all.length, quarantined, already };
}

// The account a request belongs to: the login session, and nothing else.
//
// mid is playerIdFromRefid's 31-bit refid-prefix hash (utils.ts:202-213). It
// collides, it is get_menudata's "no profile" placeholder at 1, and in a real
// savedata it is a small enumerable integer (mid 10 / 11 / 13 / 14 in the live
// DB), so a posted mid can name any account that exists. Treating it as a
// fallback identity was the bypass: pcuid 11112222333344445555666677778888 -
// never issued by this server - with mid=11 read that account's 32 states and
// overwrote its player_config. There is no legitimate caller that needs the
// fallback: /login returns <auth><session_id> (Login.cs:31), the client stores
// it as AppSessionID (GameDataManager.cs:140) and posts it as pcuid on every
// one of the endpoints that resolve an account (ClientStateRead.cs:83,
// ClientStateWrite.cs:22, PresentDone.cs:42, ItemGainLog.cs:39, NoticeDone.cs:18
// - the last three post no mid at all, which is itself the proof that mid is
// not an identity).
//
// A session is dead in three shapes and all three get the same answer: one this
// server never issued, one a re-login superseded (EVICTED_SESSIONS over the
// profile's own evicted_sessions record), and one that lands on a legacy
// MID phantom document.
export async function sessionProfile(pcuid?: string): Promise<ProfileDoc | null> {
  if (!pcuid) return null;
  if (isEvictedSession(pcuid)) return null;
  const p = await getProfileBySession(String(pcuid));
  if (isPhantomProfile(p)) return null;
  return p;
}

// mid stays in the signature because every caller has it off the form, and
// handlers use it for logging and for the account's own id; it never resolves
// one. An identity lookup that only has a mid has no account behind it.
export async function resolveProfile(mid: number, pcuid?: string): Promise<ProfileDoc | null> {
  return await sessionProfile(pcuid);
}

// Write a state onto an already-resolved profile and return that profile, so
// the caller mirrors/answers against the exact document it wrote.
export async function saveStateOn(p: ProfileDoc, kind: string, payload: string): Promise<ProfileDoc> {
  if (!(p as any).states) (p as any).states = {};
  (p as any).states[kind] = payload;
  (p as any).updated_at = nowUnix();
  await saveProfile((p as any).refid, p);
  return p;
}

// Returns the profile the state landed on, or null when the write has no real
// account behind it. A missing profile is NEVER repaired by minting a
// MID phantom document: those forked profiles (and the refused mid=1 writes that
// still answered code 0) are exactly how states were written into phantom
// profiles and quietly lost. The caller must answer with an error code.
export async function saveState(mid: number, kind: string, payload: string, pcuid?: string): Promise<ProfileDoc | null> {
  const p = await resolveProfile(mid, pcuid);
  if (!p) return null;
  return await saveStateOn(p, kind, payload);
}

// ---------------------------------------------------------------------------
// odekake: publish consent + borrow grants (data/odekake.json)
// ---------------------------------------------------------------------------
// The borrow hands one account's chara build to another account, which is a
// disclosure of somebody else's account document. Two pieces of state make that a
// decision instead of a default, and neither of them exists in the client:
//
// 1. PUBLISH CONSENT, per account, server-owned. The shipping client cannot express
//    it: FriendInfo.cs:7-20 is exactly six fields (OdekakeDataID / FriendID /
//    PlayerName / Dan / IsUsable / CharaType), FriendGameData has no consent field,
//    FriendGameData.Save (FriendGameData.cs:21-26) has no caller in the assembly,
//    GameDataManager.IsOdekakeEnable (GameDataManager.cs:960-963) is a global event
//    flag that only hides the My Room Friend page (MyRoomMainWindow.cs:102), and no
//    request in MFG.GameRequest posts a publish or an opt-in. So the grant comes
//    from this server's own configuration - data/odekake.json `publish_default`
//    (private unless a deployment says otherwise) plus `publish_accounts`, overridden
//    by VFG_ODEKAKE_PUBLISH = off | all | <REFID or mid list>. Private by default:
//    "every account lends to every account" is precisely the behaviour this state
//    exists to stop, so an opt-out default would preserve it.
//    It is persisted on the lender's own profile document (never written from
//    somebody else's read) so lending state is auditable per account and a
//    revocation is visible after that account's next read.
//
// 2. A GRANT, not a mid. The client posts the friend row's
//    FriendInfo.OdekakeDataID straight back as odekake_id (MyRoomFlow.cs:194 ->
//    OdekakeDone.cs:11/:60, a long) and reads that field nowhere else in the
//    assembly, so the server may put its own handle in it instead of the lender's
//    player_id. odekake_done then resolves the posted number against the requesting
//    account's own grant table: a number names an account only when this server
//    already issued that account to this caller. mid (playerIdFromRefid's 31-bit
//    refid-prefix hash, above) selects no account anywhere in the borrow path.
let _odekakeData: any = null;
function odekakeData(): any {
  if (!_odekakeData) {
    _odekakeData = loadPluginDataJson("odekake.json", { publish_default: false, publish_accounts: [], max_lenders: 20 });
  }
  return _odekakeData;
}

export interface OdekakePublishPolicy {
  mode: "optin" | "all" | "none";
  accounts: string[];
  max_lenders: number;
}

export function odekakePublishPolicy(): OdekakePublishPolicy {
  const data = odekakeData();
  const accounts: string[] = [];
  const push = (s: any) => {
    const v = String(s || "").trim().toUpperCase();
    if (v && !accounts.includes(v)) accounts.push(v);
  };
  for (const a of (Array.isArray(data?.publish_accounts) ? data.publish_accounts : [])) push(a);
  for (const a of configList("VFG_ODEKAKE_PUBLISH")) push(a);

  let mode: OdekakePublishPolicy["mode"] = "optin";
  const def = String(data?.publish_default ?? "").trim().toLowerCase();
  if (def === "all" || def === "true" || def === "open") mode = "all";
  else if (def === "none" || def === "off" || def === "closed") mode = "none";
  for (const a of configList("VFG_ODEKAKE_PUBLISH")) {
    const k = a.toLowerCase();
    if (k === "all") mode = "all";
    else if (k === "none" || k === "off" || k === "closed") mode = "none";
  }
  let max = Number(data?.max_lenders || 0);
  if (!Number.isInteger(max) || max < 0) max = 20;
  return { mode, accounts, max_lenders: max };
}

// A consent record written by an operator (the profile document / web UI of this
// deployment) rather than mirrored from the policy file. Policy may still revoke it
// (VFG_ODEKAKE_PUBLISH=off); policy can never invent an account that is not listed.
const ODEKAKE_MANAGED_CONSENT = ["ops", "manual", "account"];

function odekakePolicyDecision(p: any, pol: OdekakePublishPolicy): { published: number; by: string } {
  const refid = normalizeRefid((p as any)?.refid || "");
  const mid = Number((p as any)?.player_id || 0);
  if (pol.mode === "all") return { published: 1, by: "policy:all" };
  if (pol.mode === "none") return { published: 0, by: "policy:off" };
  if (refid && pol.accounts.includes(refid)) return { published: 1, by: "policy:refid" };
  if (mid && pol.accounts.includes(String(mid))) return { published: 1, by: "policy:mid" };
  return { published: 0, by: "policy:default" };
}

// What the account's own document says, checked against what the server is
// currently configured to allow. This is the only lending test - the friend rows and
// odekake_done both run it, so a row is published exactly when the borrow will serve.
export function odekakePublished(p: any): boolean {
  if (!p) return false;
  const pol = odekakePublishPolicy();
  const stored = (p as any).odekake_publish;
  const managed = !!(stored && ODEKAKE_MANAGED_CONSENT.includes(String(stored.by || "").toLowerCase()));
  if (managed && Number(stored.published) === 1 && pol.mode !== "none") return true;
  return odekakePolicyDecision(p, pol).published === 1;
}

// Write the consent state onto the account's own profile. Called from the account's
// own read path, never from another account's, so a stranger's request cannot write
// into a lender's document. Returns true when the document changed (the caller saves).
export function applyOdekakePublishConsent(p: any): boolean {
  if (!p) return false;
  const pol = odekakePublishPolicy();
  const stored = (p as any).odekake_publish;
  if (ODEKAKE_MANAGED_CONSENT.includes(String(stored?.by || "").toLowerCase()) && pol.mode !== "optin") {
    // off / all override an operator record: record the revocation, keep who did it.
    (p as any).odekake_publish = { published: odekakePublished(p) ? 1 : 0, at: nowUnix(), by: `policy:${pol.mode}` };
    return true;
  }
  const decision = odekakePolicyDecision(p, pol);
  if (ODEKAKE_MANAGED_CONSENT.includes(String(stored?.by || "").toLowerCase())) return false;
  if (stored && Number(stored.published) === decision.published && String(stored.by) === decision.by) return false;
  (p as any).odekake_publish = { published: decision.published, at: nowUnix(), by: decision.by };
  return true;
}

function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Ticket for one (viewer, lender) pair: stable, so re-checking a stored friend
// document does not churn it; salted with the viewer's own refid, so a ticket only
// ever means something inside that viewer's grant table; always an integer, because
// FriendInfo.OdekakeDataID is a long (FriendInfo.cs:9) that OdekakeDone posts back
// verbatim (OdekakeDone.cs:11/:60). Kept under 2^31 so no float path touches it.
function odekakeGrantTicket(viewerRefid: string, lenderRefid: string, taken: Set<number>): number {
  const v = normalizeRefid(viewerRefid);
  const l = normalizeRefid(lenderRefid);
  for (let n = 0; n < 64; n++) {
    const h = fnv1a32(`odekake|${v}|${l}|${n}`);
    const ticket = 1000000 + (h % 990000000);
    if (!taken.has(ticket)) return ticket;
  }
  return 1000000 + (fnv1a32(`odekake|${v}|${l}|seq`) % 990000000);
}

// Look a posted odekake_id up where it belongs: in the requesting account's own
// grant table. Nothing here takes the number to a profile lookup.
export function findOdekakeGrant(viewer: any, ticket: number): { lender: string; ticket: number; at: number } | null {
  const map = (viewer as any)?.odekake_grants;
  const t = Number(ticket) || 0;
  if (!map || typeof map !== "object" || !t) return null;
  for (const [refid, g] of Object.entries(map)) {
    if (g && Number((g as any).ticket) === t) {
      return { lender: normalizeRefid(refid), ticket: t, at: Number((g as any).at || 0) };
    }
  }
  return null;
}

// Issue (or reuse) the grant for one lender in this viewer's table. In-memory here;
// the caller that owns the read persists the profile.
export function issueOdekakeGrant(viewer: any, lenderRefid: string): { lender: string; ticket: number; at: number } | null {
  const lender = normalizeRefid(lenderRefid);
  if (!lender || !viewer) return null;
  const viewerRefid = normalizeRefid((viewer as any).refid || "");
  if (!viewerRefid || viewerRefid === lender) return null;
  const map: Record<string, { ticket: number; at: number }> = ((viewer as any).odekake_grants = (viewer as any).odekake_grants || {});
  const existing = map[lender];
  if (existing && Number(existing.ticket) > 0) return { lender, ticket: Number(existing.ticket), at: Number(existing.at || 0) };
  const taken = new Set<number>();
  for (const g of Object.values(map)) { const t = Number((g as any)?.ticket) || 0; if (t) taken.add(t); }
  const rec = { ticket: odekakeGrantTicket(viewerRefid, lender, taken), at: nowUnix() };
  map[lender] = rec;
  return { lender, ticket: rec.ticket, at: rec.at };
}

export function revokeOdekakeGrant(viewer: any, lenderRefid: string): boolean {
  const lender = normalizeRefid(lenderRefid);
  const map = (viewer as any)?.odekake_grants;
  if (!lender || !map || typeof map !== "object" || !(lender in map)) return false;
  delete map[lender];
  return true;
}

// A lender who stops publishing, or a friend row that goes away, takes its grant
// with it: the grant table covers exactly the lenders the stored document names.
export function pruneOdekakeGrants(viewer: any, keepRefids: string[]): boolean {
  const map = (viewer as any)?.odekake_grants;
  if (!viewer || !map || typeof map !== "object") return false;
  const keep = new Set(keepRefids.map(r => normalizeRefid(r)).filter(Boolean));
  let changed = false;
  for (const refid of Object.keys(map)) {
    if (!keep.has(normalizeRefid(refid))) { delete map[refid]; changed = true; }
  }
  return changed;
}

// in-memory stores
export const MATCHES: Map<string, any> = new Map();
// MATCH_LOBBY: lobbyKey -> { pcuids: string[], tid: number, createdAt: number }
export const MATCH_LOBBY: Map<string, { pcuids: string[]; tid: number; createdAt: number }> = new Map();
// PLAYER_SEAT: pcuid -> the seat this session holds. tid/pindex are what gget and
// gpost address against, refid/guest are what the match archive attributes the
// result to (see handle_end_or_kiken), taku_class is the entry's table class.
// mid 0 means "no profile behind this seat": it must never be 1, because 1 can be
// a real account's mid and would attribute the seat to that account.
export interface PlayerSeat {
  tid: number;
  pindex: number;
  name: string;
  mid: number;
  profile: any;
  lobbyKey?: string;
  gmode?: number;
  taku_class?: number;
  refid?: string;
  guest?: boolean;
  scramble?: string;
}
export const PLAYER_SEAT: Map<string, PlayerSeat> = new Map();
// SEATS_BY_TID: which sessions sit at which table, an index over PLAYER_SEAT.
// seatAt used to scan every seated session in the process once per seat per gget
// poll, so lookup cost grew with everything the process had ever remembered. The
// index holds session ids, never seat objects: PLAYER_SEAT stays the single owner
// of the records (and of the profile reference each one carries), and an id whose
// seat is gone - released, or dropped by a direct PLAYER_SEAT clear - is dropped
// from the index on sight instead of keeping the record alive.
// Every install/release of a seat goes through seatHold/seatRelease below; a raw
// PLAYER_SEAT.set/delete is what lets the two maps disagree.
const SEATS_BY_TID: Map<number, Set<string>> = new Map();

export function seatHold(pcuid: string, seat: PlayerSeat): void {
  const key = String(pcuid);
  PLAYER_SEAT.set(key, seat);
  // A seat is only ever aged against lastSeen; an install without one would read
  // as "seen right now" forever through seatSeen's fallback and never be swept.
  if (!(seat as any).lastSeen) (seat as any).lastSeen = Date.now();
  const tid = Number(seat.tid) || 0;
  let at = SEATS_BY_TID.get(tid);
  if (!at) { at = new Set(); SEATS_BY_TID.set(tid, at); }
  at.add(key);
}

export function seatRelease(pcuid: string): void {
  const key = String(pcuid);
  const seat = PLAYER_SEAT.get(key);
  PLAYER_SEAT.delete(key);
  if (!seat) return;
  const tid = Number(seat.tid) || 0;
  const at = SEATS_BY_TID.get(tid);
  if (at) {
    at.delete(key);
    if (!at.size) SEATS_BY_TID.delete(tid);
  }
}

export function seatCandidates(tid: number): string[] {
  const at = SEATS_BY_TID.get(Number(tid) || 0);
  if (!at || !at.size) return [];
  const out: string[] = [];
  for (const key of at) {
    if (PLAYER_SEAT.has(key)) out.push(key);
    else at.delete(key); // self-heal: PLAYER_SEAT is the owner of the truth
  }
  if (!at.size) SEATS_BY_TID.delete(Number(tid) || 0);
  return out;
}
export const TABLES: Map<string, any> = new Map();
export const SHARED_TABLES: Map<number, any> = new Map();
export const STAMPS: Map<number, any[]> = new Map();
// What each seat has already been shown out of its table's stamp backlog. The
// client carries the cursor itself in the idx= attribute it filters on
// (StampData.cs:29 SeqID, MatchingFlow.cs:549,560 - only idx > _stampPosition is
// drawn, then _stampPosition = max idx) and gget sends no cursor at all
// (GGet.cs:30 must is six segments: appver/pcuid/tid/pindex/mid/nextSeqNo), so
// the server has to remember per (table, session) what it delivered.
export const STAMP_CURSOR: Map<string, number> = new Map();
export function stampCursor(tid: number, pcuid: string): number {
  // Match traffic never goes through the profile resolvers (the seat carries the
  // profile it got at entry_game), so this is where a table seat marks its account
  // live: every gget window reads its stamp cursor through here (aog.ts:2378/2425/
  // 2552) - a player mid-kyoku is not idle for the takeover rule.
  const seat = PLAYER_SEAT.get(String(pcuid));
  if (seat && seat.profile) touchSessionActivity(seat.profile);
  return STAMP_CURSOR.get(`${Number(tid) || 0}|${pcuid}`) || 0;
}
export function stampCursorMark(tid: number, pcuid: string, idx: number): void {
  STAMP_CURSOR.set(`${Number(tid) || 0}|${pcuid}`, Math.max(stampCursor(tid, pcuid), Number(idx) || 0));
}
export let _stampSeq = 0;
export let _matchTidCounter = 1000;
let _tidCounterSeed: Promise<void> | null = null;
export function incStampSeq(): number {
  _stampSeq += 1;
  return _stampSeq;
}

// Match ids are the key of the archive: match_archive rows are looked up by tid
// (get_haifu_data, player_record, the WebUI archive page), so a tid has to be
// unique for the life of the database, not of the process. The counter used to
// start at 1000 on every boot while the archives stayed, so the first matches
// after a restart re-used archived tids - .audit/inspect_archive_rows.py shows the
// same tid on several archives, and get_haifu_data then replays a different match.
// The high-water mark lives in the DB and is seeded from what is already archived.
const TID_COUNTER_DOC = { collection: "match_meta", kind: "tid_counter" };

async function seedTidCounter(): Promise<void> {
  let max = _matchTidCounter;
  try {
    // @ts-ignore - object-form query: PluginSpace scan, no core profile involved
    const meta: any = await DB.FindOne(TID_COUNTER_DOC);
    if (meta) max = Math.max(max, Number((meta as any).last_tid) || 0);
  } catch { }
  try {
    // @ts-ignore
    const docs: any[] = await DB.Find({ collection: "match_archive" }) || [];
    for (const d of docs) max = Math.max(max, Number((d as any).tid) || 0);
  } catch { }
  _matchTidCounter = max;
}

export async function allocateTid(): Promise<number> {
  if (!_tidCounterSeed) _tidCounterSeed = seedTidCounter();
  await _tidCounterSeed;
  // Nothing is awaited between reading the counter and writing it: two matches
  // starting in the same tick still get different tids.
  const tid = ++_matchTidCounter;
  try {
    // @ts-ignore
    const p = DB.Upsert(TID_COUNTER_DOC, { ...TID_COUNTER_DOC, last_tid: tid, updated_at: nowUnix() });
    if (p && typeof p.catch === "function") p.catch(() => { });
  } catch { }
  return tid;
}

// ---------------------------------------------------------------------------
// match archive attribution
// ---------------------------------------------------------------------------
// Who a match_archive document belongs to. player_record, get_haifu_list and
// get_haifu_data all ask the same question, and only get_haifu_data used to ask
// it at all (it served any tid to any logged-in session).
export interface ViewerIdentity {
  ref: string;
  mid: number;
  guest: boolean | null;
}

export function viewerIdentity(profile: any): ViewerIdentity {
  const g = (profile as any)?.is_guest;
  return {
    ref: String((profile as any)?.refid || ""),
    mid: Number((profile as any)?.player_id || 0) || 0,
    guest: typeof g === "boolean" ? g : null,
  };
}

export function archiveParticipantMatches(p: any, me: ViewerIdentity): boolean {
  const ref = String((p as any).refid || "");
  if (ref) {
    if (!me.ref || ref !== me.ref) return false;
  } else {
    // Archives written before a seat recorded its refid. mid 0 is a CPU seat and
    // mid 1 was entry_game's "no profile behind this seat" placeholder - which is
    // also a legal mid for a real account, and matching on it is what dropped an
    // anonymous guest match into that account's haifu list. Neither is evidence of
    // participation any more.
    const mid = Number((p as any).mid || 0) || 0;
    if (mid <= 1 || mid !== me.mid) return false;
  }
  const rowGuest = (p as any).guest;
  if (typeof rowGuest === "boolean" && me.guest !== null && rowGuest !== me.guest) return false;
  return true;
}

// Seat the viewer took in an archived match, or -1 when the viewer was not in it.
export function archiveParticipantSeat(players: any, me: ViewerIdentity): number {
  if (!Array.isArray(players)) return -1;
  for (const p of players) {
    if (archiveParticipantMatches(p, me)) return Number((p as any).pindex || 0);
  }
  return -1;
}

// RecordKind (AC/MFG.GameData/RecordKind.cs) - the record window has one tab per
// kind, so an archived match is filed under the kind its recorded seat count says.
export function recordKindOf(seats: number): string {
  const s = Number(seats) || 4;
  if (s === 3) return "Sanma";
  if (s === 2) return "Nima";
  return "Yonma";
}

// SchoolID (AC/MFG.Types/SchoolID.cs). The scramble-festival school a match is
// played for is a server-side event property (mgresult g2result/sub_cate, archive
// g2_scramble belong): the client never sends it, and nothing in the client's own
// data maps a girl to a school (CharaProfile.SchoolID is filled from master data
// the server does not have), so the only honest source is the server's own event
// configuration. Empty (default) = this server runs no scramble matches and every
// g2_scramble block stays empty.
export const SCHOOL_IDS = [
  "None", "School001", "School002", "School003", "School004", "School005",
  "School006", "School007", "School008", "School009", "School010",
];

export function scrambleSchoolSetting(): string {
  let raw = "";
  try {
    // @ts-ignore
    raw = String(U.GetConfig("VFG_SCRAMBLE_SCHOOL") || "").trim();
  } catch { raw = ""; }
  return raw && raw !== "None" && SCHOOL_IDS.indexOf(raw) > 0 ? raw : "";
}


// For eacoin sessions
export const PASELI_SESSIONS: Map<string, number> = new Map();

// For card mapping (plugin-local, mirrors server.py cards)
export interface CardRec {
  card_id: string;
  refid: string;
  issued?: boolean;
  bound?: boolean;
  pin?: string;
  created_at?: number;
  updated_at?: number;
}
export const CARD_STORE: Map<string, CardRec> = new Map();
// Secondary index: refid -> CardRec for O(1) lookups
export const CARD_STORE_BY_REFID: Map<string, CardRec> = new Map();

// Profile cache — avoids full DB.Find on every request
const _profileBySession: Map<string, ProfileDoc> = new Map();
const _profileByPlayerId: Map<number, ProfileDoc> = new Map();
const _profileByRefid: Map<string, ProfileDoc> = new Map();
// Tracks current session per refid so relog invalidates the old pcuid.
const _sessionByRefid: Map<string, string> = new Map();
// Sessions a re-login superseded (old pcuid -> { refid, at }). login mints a
// fresh 32-hex session_id every call, so a second login for the same account
// already made the first client's pcuid unresolvable (the entry below used to
// be the only trace of it, and it was deleted). Keeping the tombstone is what
// lets a handler answer "your session is gone" instead of silently degrading
// that client to mid 1 / GUEST with every save quietly dropped.
// This Map is the read cache. The record itself is profile.evicted_sessions on
// the account's profile document (tombstoneSessionOnProfile): a tombstone that
// only lives in one process is worth nothing after a core restart, and the
// retired pcuid is then just another lookup key - if the stored profile still
// names it (a login save that never landed: APIUpsert answers updated:0 when
// the core refid alias is missing, which is what ensureCoreAlias exists for),
// the kicked client reads and writes the account again.
export const EVICTED_SESSIONS: Map<string, { refid: string; at: number }> = new Map();
const EVICTED_SESSIONS_MAX = 256;
// How many retired sessions one account keeps on its own document. login is
// the only writer and a client re-logs in once per session, so 16 is far past
// what any account accumulates while keeping the document bounded.
const EVICTED_SESSIONS_PER_PROFILE = 16;

function _tombstoneSession(sess: string, refid: string): void {
  if (!sess) return;
  EVICTED_SESSIONS.set(String(sess), { refid, at: nowUnix() });
  while (EVICTED_SESSIONS.size > EVICTED_SESSIONS_MAX) {
    const oldest = EVICTED_SESSIONS.keys().next().value;
    if (oldest == null) break;
    EVICTED_SESSIONS.delete(oldest);
  }
}

// Retire a session on the account's own profile document and mirror it into
// the read cache. Callers save the profile right after (handle_login already
// does), so the record rides the existing profile-state helper
// (saveProfile -> DB.Upsert { collection: "profile" }) instead of forking a
// second document nothing reads. True when the record changed.
export function tombstoneSessionOnProfile(p: ProfileDoc | null | undefined, sess: string): boolean {
  const refid = String((p as any)?.refid || "");
  if (!p || !sess || !refid) return false;
  const list: any[] = Array.isArray((p as any).evicted_sessions) ? (p as any).evicted_sessions : [];
  if (list.some((e: any) => String((e as any)?.session_id || "") === String(sess))) return false;
  list.push({ session_id: String(sess), at: nowUnix() });
  while (list.length > EVICTED_SESSIONS_PER_PROFILE) list.shift();
  (p as any).evicted_sessions = list;
  _tombstoneSession(String(sess), refid);
  return true;
}

// The durable half of the answer: this profile document says the session was
// superseded. A retired pcuid stays retired even when some write path left it
// sitting in profile.session_id, so the eviction is a fact about the account
// and not about the process that minted it.
export function sessionRetiredOn(p: ProfileDoc | null | undefined, sess: string): boolean {
  if (!p || !sess) return false;
  const list = (p as any).evicted_sessions;
  if (!Array.isArray(list)) return false;
  return list.some((e: any) => String((e as any)?.session_id || "") === String(sess));
}

// A pcuid the account itself has retired: cache it, drop any session entry it
// still has, and resolve to nothing.
function _refuseRetiredSession(p: ProfileDoc, sess: string): null {
  _tombstoneSession(sess, String((p as any).refid || ""));
  try { _profileBySession.delete(String(sess)); } catch { }
  vlog(`[VFG] session ${String(sess).slice(0, 8)}... is retired on profile ${(p as any).refid} (superseded by a newer login) -> no account`);
  return null;
}

// True for a pcuid this server issued and then replaced with a newer login.
export function isEvictedSession(pcuid: string): boolean {
  if (!pcuid) return false;
  return EVICTED_SESSIONS.has(String(pcuid));
}

// ---------------------------------------------------------------------------
// Account boundary: what authorises a login, and what authorises a name write.
// (data/account-auth.json; VFG_ACCOUNT_AUTH, VFG_CARD_AUTH_WINDOW,
//  VFG_SESSION_TAKEOVER_GRACE)
// ---------------------------------------------------------------------------
// The HTTP front has no credential at login. Login.cs:20 posts
//   web_id&area_id&user_id=<Account.DataID>&bypass_auth=true&guest=0|1
// - the account's refid and nothing else - and Login.cs:31 hands back a
// session_id that every later request carries as pcuid (ClientStateRead.cs:83,
// ClientStateWrite.cs:22, Logout.cs:16). So the refid alone was the identity:
// handle_login rotated profile.session_id and retired the session the real
// player was playing on (tombstoneSessionOnProfile, durable on the profile
// document), and create_player stored any posted name on any refid
// (CreatePlayer.cs:19 posts name + user_id with no session). Measured
// (tmp/audit_r2/adv3.cjs, shipped build, scratch savedata):
// create_player name=RenamedByStranger user_id=VICTIMCCC -> code 0, the victim's
// profile.name changed; login user_id=VICTIMCCC -> code 0 with a fresh session,
// the real player's live pcuid answered 770 on client_state_read / get_menudata,
// and the caller read the victim's state set (11 kinds).
//
// What this server CAN authenticate is the e-Amusement card presentation,
// because the card flow is the same process: cardmng.inquire and cardmng.getrefid
// are the only requests that carry a 16-hex card id (CardEntryScene.cs:462 and the
// new-card path in CardEntryManager.cs; handleCardmng refuses both without a
// cardid). recordCardAuthIntent below stamps that presentation onto the account's
// own document (profile.card_auth, persisted through saveProfile). The refid a
// login carries is then only a claim on an identity: it is honoured for an account
// that is bound to a credential (profile.card_id, written by eamuse.ts
// saveCardToProfile) when that credential was presented within
// VFG_CARD_AUTH_WINDOW - default 900 s, one arcade play session - and has not
// been spent yet: one card scan authorises one login (cardCredentialUsable /
// consumeCardCredential), so the window is a validity window, not a token.
//
// THE TRUST MODEL, stated here because a deployment has to be able to say it out
// loud: an account with NO bound credential has nothing this server can check, so
// cross-account isolation is OUT of the trust model for it. That is the honest
// description of the card-less deployments this plugin serves - the -AUTOSERVE
// lanes' fixed guest dataid MFGTESTGUEST1 (AccountGameData.cs:70-74), the WebGL
// browser lane, any cardless run. For those accounts the live session is the only
// thing that names its owner, so an unauthenticated login may not take over a
// session that is still active: it is refused until the session has been idle for
// VFG_SESSION_TAKEOVER_GRACE (default 120 s). The client's own clean exit retires
// the session (/logout, Logout.cs:16 posts pcuid, GameoverFlow.cs:88 sends it at
// Gameover), so a normal lane relaunch is not held up; only a killed one is.
// Card-bound accounts do not get that fallback - their credential is required.
// VFG_ACCOUNT_AUTH=off turns the whole gate off: a deployment that wants the
// pre-gate open behaviour has to say so in its config, in so many words.
const ACCOUNT_AUTH_DATA: any = loadPluginDataJson("account-auth.json", { mode: "card", card_auth_window_seconds: 900, takeover_grace_seconds: 0 });

export interface AccountAuthPolicy {
  mode: "card" | "off";
  card_window: number;
  takeover_grace: number;
  // Where each number actually came from. The gate is decided by a chain
  // (config.ini [mfg@asphyxia] key -> same name in the environment ->
  // data/account-auth.json -> the literal in this file), and an operator tuning
  // the rule has to be told which link won, or a value that looks set in one
  // place silently answers for another.
  source: { mode: string; card_window: string; takeover_grace: string };
}

function configString(key: string): string {
  let raw = "";
  try { if (U && U.GetConfig) { const v = U.GetConfig(key); if (v != null && v !== "" && v !== false) raw = String(v); } } catch { }
  if (!raw) { try { const e = process.env[key]; if (e != null && e !== "") raw = String(e); } catch { } }
  if (!raw) { try { if (CONFIG && CONFIG[key] != null && CONFIG[key] !== "") raw = String(CONFIG[key]); } catch { } }
  return raw.trim();
}

function configNumber(key: string): number | null {
  const raw = configString(key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// The rule as its data file states it (data/account-auth.json), falling back to
// the literals in this file. Kept separate from accountAuthPolicy so index.ts can
// register exactly these numbers as the core config defaults: the value an
// operator sees in config.ini / the WebUI is then the value data/account-auth.json
// declares, instead of a second copy in the source that quietly outranks it.
export function accountAuthDefaults(): { mode: AccountAuthPolicy["mode"]; card_window: number; takeover_grace: number } {
  let mode: AccountAuthPolicy["mode"] = "card";
  const dataMode = String(ACCOUNT_AUTH_DATA?.mode ?? "").trim().toLowerCase();
  if (dataMode === "off" || dataMode === "none" || dataMode === "open") mode = "off";
  let card_window = Number(ACCOUNT_AUTH_DATA?.card_auth_window_seconds);
  if (!Number.isFinite(card_window) || card_window <= 0) card_window = 900;
  let takeover_grace = Number(ACCOUNT_AUTH_DATA?.takeover_grace_seconds);
  if (!Number.isFinite(takeover_grace) || takeover_grace < 0) takeover_grace = 0;
  return { mode, card_window, takeover_grace };
}

export function accountAuthPolicy(): AccountAuthPolicy {
  const base = accountAuthDefaults();
  let mode = base.mode;
  let modeSource = ACCOUNT_AUTH_DATA?.mode ? `data/account-auth.json mode=${String(ACCOUNT_AUTH_DATA.mode).toLowerCase()}` : "built-in default (card)";
  const envMode = configString("VFG_ACCOUNT_AUTH").toLowerCase();
  if (envMode === "off" || envMode === "none" || envMode === "open") { mode = "off"; modeSource = "VFG_ACCOUNT_AUTH=" + envMode; }
  else if (envMode === "card") { mode = "card"; modeSource = "VFG_ACCOUNT_AUTH=card"; }

  let card_window = base.card_window;
  let card_window_source = base.card_window === Number(ACCOUNT_AUTH_DATA?.card_auth_window_seconds)
    ? "data/account-auth.json card_auth_window_seconds"
    : `built-in default ${base.card_window} (no usable value in data/account-auth.json)`;
  const cw = configNumber("VFG_CARD_AUTH_WINDOW");
  if (cw != null && cw > 0) { card_window = cw; card_window_source = "VFG_CARD_AUTH_WINDOW (config.ini [mfg@asphyxia], or the same name in the environment)"; }

  let takeover_grace = base.takeover_grace;
  let takeover_grace_source = base.takeover_grace === Number(ACCOUNT_AUTH_DATA?.takeover_grace_seconds)
    ? "data/account-auth.json takeover_grace_seconds"
    : `built-in default ${base.takeover_grace} (no usable value in data/account-auth.json)`;
  const tg = configNumber("VFG_SESSION_TAKEOVER_GRACE");
  if (tg != null && tg >= 0) { takeover_grace = tg; takeover_grace_source = "VFG_SESSION_TAKEOVER_GRACE (config.ini [mfg@asphyxia], or the same name in the environment)"; }

  return {
    mode,
    card_window,
    takeover_grace,
    source: { mode: modeSource, card_window: card_window_source, takeover_grace: takeover_grace_source },
  };
}

// The account's bound credential: the card id the eamuse card flow wrote onto the
// profile (eamuse.ts saveCardToProfile). No card_id = no credential to check.
export function credentialBound(p: any): boolean {
  return !!String((p as any)?.card_id || "").trim();
}

function cardLabel(p: any): string {
  return String((p as any)?.card_id || "").trim().toUpperCase() || "?";
}

// The presentation of that credential, stamped where it happens (handleCardmng,
// on a canonical card id only - eamuse.ts CARDID_RE; a malformed id that
// normalizeCardId maps onto DEFAULT_CARDID authorises nothing). Persisted on the
// account's own document through saveProfile, so the window survives a core
// restart; the window is what stops a replay outliving the play session.
export async function recordCardAuthIntent(refid: string, cardId: string): Promise<boolean> {
  const norm = normalizeRefid(refid);
  const card = String(cardId || "").trim().toUpperCase();
  if (!norm || !card) return false;
  const p = await getProfileByRefid(norm);
  if (!p) return false;
  (p as any).card_auth = { card_id: card, at: nowUnix(), used: 0 };
  await saveProfile(norm, p);
  vlog(`[VFG] card credential presented refid=${norm} card=${card} -> login authorised for ${accountAuthPolicy().card_window}s`);
  return true;
}

// The web presenter (hosting plan docs/28). A card-bound account has to answer
// /login with a presentation of the card it is bound to; a browser lane has no
// card reader, so the presentation is made by the web front that just verified
// the account's web session (signup owns the password, the front owns the
// session, the plugin owns the credential). VFG_PRESENTER_SECRET is the shared
// secret between front and plugin, and it is the whole reason the gate works:
// a bare DataID posted straight to /login is refused on a hosted account
// exactly like a scan-less cardholder would be, while the LAN dev lanes - no
// secret configured, nothing ever bound - keep their bearer-refid semantics.
const CANONICAL_CARDID_RE = /^[0-9A-Fa-f]{16}$/;

export function presenterSecret(): string {
  return configString("VFG_PRESENTER_SECRET");
}

export interface PresenterAnswer {
  ok: boolean;
  // true when the account was already bound to its card; false when this
  // presentation bound it (the account is credential-bound from now on).
  bound: boolean;
  reason: string;
}

// Present a web-issued credential on an account. A web-issued card is the
// account's own DataID (the signup mint creates the core card document with
// cid == refid), so this route binds nothing else: a leaked presenter secret
// can arm an account with its own DataID only, which is what the DataID
// already grants on the bearer lanes - no escalation, and only the front that
// holds the secret can run it at all.
export async function presentViaPresenter(refid: string, cardId: string, secret: string): Promise<PresenterAnswer> {
  const secretSet = presenterSecret();
  if (!secretSet) return { ok: false, bound: false, reason: "VFG_PRESENTER_SECRET is not set: this deployment has no presenter" };
  if (!secret || secret !== secretSet) return { ok: false, bound: false, reason: "presenter secret does not match VFG_PRESENTER_SECRET" };
  const norm = normalizeRefid(refid);
  const card = String(cardId || "").trim().toUpperCase();
  if (!norm || !CANONICAL_CARDID_RE.test(card)) return { ok: false, bound: false, reason: "refid missing or card id is not the canonical 16 hex" };
  if (card !== norm) return { ok: false, bound: false, reason: `a web-issued card must be the account's own DataID (${norm})` };
  const p = await ensureProfile(norm);
  if (!p) return { ok: false, bound: false, reason: "no account could be resolved for this refid" };
  let wasBound = true;
  if (!credentialBound(p)) {
    // Binding is for web-issued accounts only - signup mints and admin claims
    // both leave a core card document with cid == refid. Test fixtures and
    // legacy cabinet test ids carry no such document and stay card-less (their
    // bearer/dev semantics are unchanged).
    let issued = false;
    try {
      const io = require("../../../utils/EamuseIO");
      issued = !!(io && io.FindCard && await io.FindCard(card));
    } catch { issued = false; }
    if (!issued) return { ok: false, bound: false, reason: "card is not an account id this deployment issued (no core card document); the presenter binds web-issued accounts only" };
    (p as any).card_id = card;
    (p as any).card_issued = "web";
    await saveProfile(norm, p);
    wasBound = false;
    vlog(`[VFG] web presenter bound card ${card} to refid=${norm}: account is credential-bound from now on, /login needs a presentation`);
  }
  await recordCardAuthIntent(norm, card);
  return { ok: true, bound: wasBound, reason: "presentation stamped for the login that follows" };
}

export function cardCredentialFresh(p: any, window: number): boolean {
  const rec = (p as any)?.card_auth;
  if (!rec) return false;
  const bound = String((p as any).card_id || "").trim().toUpperCase();
  const presented = String((rec as any).card_id || "").trim().toUpperCase();
  if (!presented) return false;
  // The presentation has to be the card THIS account is bound to.
  if (bound && presented !== bound) return false;
  const at = Number((rec as any).at) || 0;
  if (!at) return false;
  return nowUnix() - at <= window;
}

// A presentation is spendable once. ExecLoadAtCardEntry calls Login exactly once
// per card entry (GameDataManager.cs:139), and a stamp left open for the whole
// window would be a bearer token for anybody who learns the refid: the card
// holder's own login spends it, the next caller inside the window gets nothing.
// The next card scan re-mints it (recordCardAuthIntent writes used: 0).
export function cardCredentialUsable(p: any, window: number): boolean {
  if (!cardCredentialFresh(p, window)) return false;
  return Number((p as any)?.card_auth?.used) !== 1;
}

// Mark it spent, on the document, by the login that used it. Returns true when the
// record changed (the caller has the profile to save).
export function consumeCardCredential(p: any): boolean {
  const rec = (p as any)?.card_auth;
  if (!rec || Number((rec as any).used) === 1) return false;
  rec.used = 1;
  rec.spent_at = nowUnix();
  return true;
}

function cardAuthAge(p: any): number {
  const at = Number((p as any)?.card_auth?.at) || 0;
  return at ? nowUnix() - at : -1;
}

// Why the credential is not answering, for the log line an operator reads.
function cardCredentialState(p: any, window: number): string {
  const rec = (p as any)?.card_auth;
  if (!rec) return "no card presentation has landed on it";
  const age = cardAuthAge(p);
  if (Number((rec as any).used) === 1) return `its presentation was spent ${age}s ago by the login it authorised`;
  if (age > window) return `its presentation is ${age}s old (window ${window}s)`;
  return "its presentation is for a different card";
}

// In-memory activity of an account's live session: touched by sessionProfile, so
// every request the real player makes keeps the answer fresh without a DB write.
// Seeded from the document (session_at is written by login, updated_at by
// saveProfile) so it also answers after a core restart.
const SESSION_ACTIVITY: Map<string, { session: string; at: number }> = new Map();

export function touchSessionActivity(p: any): void {
  const refid = normalizeRefid((p as any)?.refid || "");
  const sess = String((p as any)?.session_id || "");
  if (!refid || !sess) return;
  SESSION_ACTIVITY.set(refid, { session: sess, at: nowUnix() });
}

// Seconds since this account's current session was last seen working. MAX_SAFE_INTEGER
// when the account has no session at all (nothing to take over).
function sessionIdleSeconds(p: any): number {
  const refid = normalizeRefid((p as any)?.refid || "");
  const sess = String((p as any)?.session_id || "");
  if (!refid || !sess) return Number.MAX_SAFE_INTEGER;
  let at = 0;
  // Only this session's traffic counts: an entry left by a session the account
  // already replaced says nothing about the one being claimed.
  const mem = SESSION_ACTIVITY.get(refid);
  if (mem && mem.session === sess) at = mem.at;
  const docAt = Math.max(Number((p as any).session_at) || 0, Number((p as any).updated_at) || 0);
  if (docAt > at) at = docAt;
  if (!at) return Number.MAX_SAFE_INTEGER;
  return nowUnix() - at;
}

export interface LoginGate {
  ok: boolean;
  reason: string;
  // The same answer in the form a log line needs: which rule decided it, how
  // idle the session being replaced was, what the grace knob is set to, and
  // whether this account has a credential the server could have checked at all.
  rule: "off" | "card" | "idle" | "no-session";
  idle_seconds: number;
  takeover_grace: number;
  credential: string;
}

// May this login rotate the account's session (and so retire the pcuid some
// client is playing with)? A card-bound account answers with its credential.
export function loginGate(p: any): LoginGate {
  const pol = accountAuthPolicy();
  const base = { rule: "idle" as LoginGate["rule"], idle_seconds: 0, takeover_grace: pol.takeover_grace, credential: "none" };
  if (!p) return { ...base, ok: false, reason: "no account resolved" };
  const credential = credentialBound(p)
    ? `card ${cardLabel(p)}`
    : "none (no profile.card_id on this account: the bearer refid is the whole claim)";
  const idle = sessionIdleSeconds(p);
  if (pol.mode === "off") {
    return { ok: true, rule: "off", idle_seconds: idle, takeover_grace: pol.takeover_grace, credential, reason: "VFG_ACCOUNT_AUTH=off (gate disabled by this deployment)" };
  }
  if (credentialBound(p)) {
    const age = cardAuthAge(p);
    if (cardCredentialUsable(p, pol.card_window)) {
      return { ok: true, rule: "card", idle_seconds: idle, takeover_grace: pol.takeover_grace, credential, reason: `card ${cardLabel(p)} presented ${age}s ago (spent by this login)` };
    }
    return { ok: false, rule: "card", idle_seconds: idle, takeover_grace: pol.takeover_grace, credential, reason: `account is bound to card ${cardLabel(p)}: ${cardCredentialState(p, pol.card_window)} - user_id alone is not a credential` };
  }
  if (pol.takeover_grace > 0 && idle <= pol.takeover_grace) {
    return {
      ok: false, rule: "idle", idle_seconds: idle, takeover_grace: pol.takeover_grace, credential,
      reason: `card-less account has a live session last used ${idle}s ago; a takeover needs ${pol.takeover_grace}s of idle (VFG_SESSION_TAKEOVER_GRACE) or the holder's /logout`,
    };
  }
  return {
    ok: true,
    rule: idle >= Number.MAX_SAFE_INTEGER ? "no-session" : "idle",
    idle_seconds: idle, takeover_grace: pol.takeover_grace, credential,
    reason: `card-less account, takeover allowed on the bearer refid (session idle ${idle >= Number.MAX_SAFE_INTEGER ? "none: no session on the account" : idle + "s"}, grace ${pol.takeover_grace}s)`,
  };
}

// The account boundary's own events, printed always rather than under VFG_VERBOSE:
// a login that replaced a live session is the moment one client took an account
// over from another, and a refusal is the moment the server stopped one. Both need
// to be readable out of a log after the fact, so the line names who the account
// is (refid + mid), whether it has a credential at all, which rule answered, how
// idle the replaced session was, what VFG_SESSION_TAKEOVER_GRACE is set to, and
// when it happened.
export function accountGateEvent(kind: "TAKEOVER" | "REFUSED", p: any, gate: LoginGate, detail: string): void {
  const refid = String((p as any)?.refid || "?");
  const mid = Number((p as any)?.player_id) || 0;
  const idle = gate.idle_seconds >= Number.MAX_SAFE_INTEGER ? "no live session" : `${gate.idle_seconds}s`;
  const grace = gate.takeover_grace <= 0 ? "off (VFG_SESSION_TAKEOVER_GRACE=0)" : `${gate.takeover_grace}s (VFG_SESSION_TAKEOVER_GRACE)`;
  try {
    console.log(
      `[VFG] ACCOUNT ${kind} refid=${refid} mid=${mid} credential=${gate.credential} rule=${gate.rule}` +
      ` session_idle=${idle} takeover_grace=${grace} at=${new Date().toISOString()}` +
      `${detail ? ` ${detail}` : ""} - ${gate.reason}`,
    );
  } catch { }
}

// The shipping client never renames through create_player: CreatePlayer.cs:19
// posts name=<SendParameter.playerName> and every call site in the assembly
// passes the placeholder "PLAYER" (GameDataManager.cs:135 guest entry,
// CardEntryManager.cs:245 and :398 new-card binding). The real name arrives
// later as player_game.PlayerName over the account's own session
// (client_state_write, mirrored by saveState). So a re-registration of an
// existing account is accepted as the no-op it is - code 0, stored name kept -
// and any other name on an account nobody authenticated is a refusal.
export const CLIENT_NAME_PLACEHOLDER = "PLAYER";

export interface NameGate {
  allow: boolean;
  write: boolean;
  reason: string;
}

export function nameWriteGate(p: any, name: string, ownsSession: boolean): NameGate {
  if (!p) return { allow: false, write: false, reason: "no account resolved" };
  if (ownsSession) return { allow: true, write: true, reason: "the caller holds this account's live session" };
  const pol = accountAuthPolicy();
  if (pol.mode === "off") return { allow: true, write: true, reason: "VFG_ACCOUNT_AUTH=off (gate disabled by this deployment)" };
  if (credentialBound(p)) {
    const age = cardAuthAge(p);
    if (cardCredentialUsable(p, pol.card_window)) return { allow: true, write: true, reason: `card ${cardLabel(p)} presented ${age}s ago` };
    return { allow: false, write: false, reason: `account is bound to card ${cardLabel(p)}: ${cardCredentialState(p, pol.card_window)} - a name write needs the credential` };
  }
  if (String(name || "").trim().toUpperCase() === CLIENT_NAME_PLACEHOLDER) {
    return { allow: true, write: false, reason: "card-less account re-registered with the client's placeholder name (CreatePlayer.cs:19 posts PLAYER): accepted, stored name left alone" };
  }
  return { allow: false, write: false, reason: "a name write onto an account nobody authenticated is a rename by whoever knows the refid" };
}

function _cacheProfile(p: ProfileDoc): void {
  // A legacy MID phantom is never an identity this process gets to know. Indexing
  // it by refid, by its stale session_id or by its player_id is what lets a later
  // lookup answer it from the cache, in front of every refusal the resolvers do on
  // a cold read - and a full-profile scan (_profileByPlayerId seeding,
  // getProfileBySession's scan) caches every row it walks over.
  if (isPhantomProfile(p)) { try { _evictProfileCache(p); } catch { } _repairPhantomOnTouch(p); return; }
  const norm = normalizeRefid((p as any).refid);
  if (norm) {
    _profileByRefid.set(norm, p);
    const sess = (p as any).session_id ? String((p as any).session_id) : "";
    const prev = _sessionByRefid.get(norm);
    if (prev && prev !== sess) {
      _profileBySession.delete(prev);
      _tombstoneSession(prev, norm);
    }
    if (sess) {
      _profileBySession.set(sess, p);
      _sessionByRefid.set(norm, sess);
    }
  } else if ((p as any).session_id) {
    _profileBySession.set(String((p as any).session_id), p);
  }
  if ((p as any).player_id) {
    // Don't let a stale duplicate overwrite the canonical owner: first wins,
    // collisions are repaired lazily in ensureProfile via findFreePlayerId.
    const cur = _profileByPlayerId.get(Number((p as any).player_id));
    if (!cur || normalizeRefid((cur as any).refid) === norm) _profileByPlayerId.set(Number((p as any).player_id), p);
  }
}
export function _evictProfileCache(p: ProfileDoc): void {
  const norm = normalizeRefid((p as any).refid);
  if (norm) {
    _profileByRefid.delete(norm);
    const sess = _sessionByRefid.get(norm);
    if (sess) { _profileBySession.delete(sess); _sessionByRefid.delete(norm); }
  }
  if ((p as any).session_id) _profileBySession.delete(String((p as any).session_id));
  if ((p as any).player_id) {
    const cur = _profileByPlayerId.get(Number((p as any).player_id));
    if (cur === p) _profileByPlayerId.delete(Number((p as any).player_id));
  }
}

// helpers for base64 / state
export function stateB64(profile: ProfileDoc | null | undefined, kind: string): string {
  const raw = ((profile as any)?.states || {})[kind];
  if (!raw) return "";
  let rawBytes: string;
  if (typeof raw === "string") rawBytes = raw;
  else rawBytes = JSON.stringify(raw);
  try {
    // @ts-ignore
    return Buffer.from(rawBytes, "utf-8").toString("base64");
  } catch {
    return "";
  }
}

export function infoData(kind: string, payload: string): string {
  let b64 = "";
  try {
    // @ts-ignore
    b64 = Buffer.from(payload, "utf-8").toString("base64");
  } catch {
    b64 = "";
  }
  return `<info_data kind="${kind}">${b64}</info_data>`;
}

// gacha pools loading
let GACHA_POOLS: any = { standard_pool: [], series: {}, item_index: {} };
let _poolsLoaded = false;
function loadGachaPoolsSync(): void {
  if (_poolsLoaded) return;
  _poolsLoaded = true;
  try {
    // @ts-ignore
    const pools = require("../data/gacha_pools.json");
    if (pools) GACHA_POOLS = pools;
  } catch (e1) {
    try {
      // @ts-ignore
      const fs = require("fs");
      // @ts-ignore
      const path = require("path");
      // __dirname is handlers folder in compiled js, so ../data is correct
      // fallback try multiple locations
      const candidates = [
        // @ts-ignore
        typeof __dirname !== "undefined" ? require("path").join(__dirname, "../data/gacha_pools.json") : null,
        "data/gacha_pools.json",
        "../data/gacha_pools.json",
      ].filter(Boolean) as string[];
      for (const p of candidates) {
        try {
          if (fs.existsSync(p)) {
            const txt = fs.readFileSync(p, "utf-8");
            GACHA_POOLS = JSON.parse(txt);
            break;
          }
        } catch { }
      }
    } catch { }
  }
  // Also try async IO if available (non-blocking, but fill if sync failed)
  if (!GACHA_POOLS.standard_pool || !GACHA_POOLS.standard_pool.length) {
    try {
      // IO.ReadFile is async, can't use sync, ignore
    } catch { }
  }
}
loadGachaPoolsSync();

export function getGachaPools(): any {
  return GACHA_POOLS;
}
export const GACHA_STANDARD_POOL: string[] = (GACHA_POOLS.standard_pool || []) as string[];
export const GACHA_SERIES_POOLS: Record<string, any> = (GACHA_POOLS.series || {}) as Record<string, any>;
export const GACHA_FALLBACK_CHARA = "Chara01";

// ObjectID -> CharaType index of the dedicated unlock cutin of a girl
// (gacha_pools.json chara_unlock_items, mirroring GachaUtility.CharaUnlockItemIDDict).
// Drawing one of these is what unlocks Chara12-21 on the client
// (GachaResultInfo.cs:134-139), so it is also what unlocks them here.
export const CHARA_UNLOCK_OID_TO_CHARA: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  const raw = (GACHA_POOLS && GACHA_POOLS.chara_unlock_items) || {};
  for (const [charaName, oid] of Object.entries(raw as any)) {
    const cm = /^Chara(\d{1,2})$/.exec(String(charaName || "").trim());
    if (!cm) continue;
    const idx = parseInt(cm[1], 10) - 1;
    if (idx < 0) continue;
    const o = String(oid || "").trim().toUpperCase();
    if (o) m[o] = idx;
  }
  return m;
})();

// Cutin ObjectID <-> MFG.Types.Customize.CutinItem.ItemID int (data/cutin_items.json,
// generated by scripts/gen_cutin_item_ids.py out of the recovered CutinItemMaster and
// the ItemID enum). The client keeps its cutins as ItemID ints in the "customize_item"
// state (MFG.GameData/CutinItemInfo.cs:12), while gacha hands out ObjectIDs, so a
// server that has to tell a duplicate draw from a new one needs both spellings.
let CUTIN_ITEMS: any = { oid_to_item_id: {}, default_item_ids: [] };
function loadCutinItemsSync(): void {
  try {
    // @ts-ignore
    const data = require("../data/cutin_items.json");
    if (data) CUTIN_ITEMS = data;
  } catch {
    try {
      // @ts-ignore
      const fs = require("fs");
      // @ts-ignore
      const path = require("path");
      const candidates = [
        // @ts-ignore
        typeof __dirname !== "undefined" ? path.join(__dirname, "../data/cutin_items.json") : null,
        "data/cutin_items.json",
        "../data/cutin_items.json",
      ].filter(Boolean) as string[];
      for (const p of candidates) {
        try {
          if (fs.existsSync(p)) { CUTIN_ITEMS = JSON.parse(fs.readFileSync(p, "utf-8")); break; }
        } catch { }
      }
    } catch { }
  }
}
loadCutinItemsSync();
export function getCutinItems(): any {
  return CUTIN_ITEMS;
}
// OIDs are matched case-insensitively: the server's grant ledger keeps them
// upper-cased, the client's state and the pools keep the master's spelling.
export const CUTIN_OID_TO_ITEM_ID: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  const raw = (CUTIN_ITEMS && CUTIN_ITEMS.oid_to_item_id) || {};
  for (const [oid, id] of Object.entries(raw)) m[String(oid).trim().toUpperCase()] = Number(id);
  return m;
})();
export const CUTIN_DEFAULT_ITEM_IDS: number[] = (CUTIN_ITEMS.default_item_ids || []) as number[];
export const CUTIN_ITEM_ID_TO_OID: Record<number, string> = (() => {
  const m: Record<number, string> = {};
  const raw = (CUTIN_ITEMS && CUTIN_ITEMS.oid_to_item_id) || {};
  for (const [oid, id] of Object.entries(raw)) m[Number(id)] = String(oid);
  return m;
})();
export function cutinItemIdOf(oid: string): number | null {
  const id = CUTIN_OID_TO_ITEM_ID[String(oid || "").trim().toUpperCase()];
  return typeof id === "number" ? id : null;
}
export function cutinOidOf(itemId: number): string {
  return CUTIN_ITEM_ID_TO_OID[Number(itemId)] || "";
}

// Cutin CharaType + Rarity of every ObjectID, from the client's own
// CutinItemMaster (scripts/gen_cutin_item_ids.py -> data/cutin_items.json).
// The per-banner gacha pools are built from the featured charas and rolled by
// rarity, so this is what makes an advertised rate mean the same thing to the
// server and to the client. gacha_pools.json's own item_index is not enough:
// it has no entries for OID_20*/OID_21* (57 of the 397 catalog items), which
// is exactly where the newest banners' featured pools live.
export const CUTIN_OID_INFO: Record<string, { chara: number; rarity: string }> = (() => {
  const m: Record<string, { chara: number; rarity: string }> = {};
  const raw = (CUTIN_ITEMS && CUTIN_ITEMS.oid_info) || {};
  for (const [oid, v] of Object.entries(raw as any)) {
    const info: any = v || {};
    const ch = Number(info.chara);
    if (!Number.isInteger(ch)) continue;
    m[String(oid).trim().toUpperCase()] = { chara: ch, rarity: String(info.rarity || "") };
  }
  return m;
})();
export function cutinCharaIndex(oid: string): number | null {
  const info = CUTIN_OID_INFO[String(oid || "").trim().toUpperCase()];
  if (info) return info.chara;
  const m = /^OID_(\d{2})/.exec(String(oid || ""));
  if (m) {
    const n = parseInt(m[1], 10) - 1;
    if (n >= 0) return n;
  }
  return null;
}
export function cutinIsUnlockItem(oid: string): boolean {
  return cutinItemIdOf(oid) !== null && CHARA_UNLOCK_OID_TO_CHARA[String(oid || "").trim().toUpperCase()] !== undefined;
}

// gacha series definitions (port of server.py)
export const GACHA_SERIES_CURATED: Array<[number, string, number, string]> = [
  [0, "Normal", 0, "Normal"],
  [1, "NormalTicket", 1, "Normal"],
  [25, "UnlockClear", 0, "Unlock"],
  [44, "UnlockIyo", 0, "Unlock"],
  [56, "UnlockGrimAroe", 0, "Unlock"],
  [63, "UnlockCocoa", 0, "Unlock"],
  [74, "UnlockDia", 0, "Unlock"],
  [101, "UnlockDoubriel", 0, "Unlock"],
  [125, "UnlockIppatsu", 0, "Unlock"],
  [135, "UnlockShiroe", 0, "Unlock"],
  [91, "MusicHiyori", 0, "Music"],
  [92, "MusicSen", 0, "Music"],
  [107, "MusicYao", 0, "Music"],
  [114, "MusicTenshi", 0, "Music"],
  [132, "MusicMusashi", 0, "Music"],
  [133, "LimitedCharaReturns", 0, "Limited"],
  [124, "PickupIppatsu", 0, "Pickup"],
  [128, "PickupMizugiReturns4", 0, "Pickup"],
  [129, "PickupUniformDia", 0, "Pickup"],
  [130, "PickupYukataToytoy2", 0, "Pickup"],
  [131, "PickupUniformDoubriel", 0, "Pickup"],
  [134, "PickupShiroe", 0, "Pickup"],
  [136, "PickupXmasGrimAroe", 0, "Pickup"],
  [137, "PickupMarchingIchiko", 0, "Pickup"],
  [138, "PickupKimonoClear", 0, "Pickup"],
  [139, "PickupBomberPine2", 0, "Pickup"],
  [140, "PickupLillyIppatsu", 0, "Pickup"],
  [141, "PickupSisterTsumire2", 0, "Pickup"],
  [142, "PickupAlotGrimAroe", 0, "Pickup"],
  [143, "PickupDarknessRobeMitsuba2", 0, "Pickup"],
  [144, "PickupValentineHiyori", 0, "Pickup"],
  [145, "PickupNurseChaos2", 0, "Pickup"],
  [146, "MusicMitsuba", 0, "Music"],
  [147, "PickupJun", 0, "Pickup"],
  [148, "UnlockJun", 0, "Unlock"],
  [149, "LimitedCharaReturns2", 0, "Limited"],
  [150, "PickupGalSen", 0, "Pickup"],
  [151, "PickupGalCocoa", 0, "Pickup"],
  [152, "PickupGalDia", 0, "Pickup"],
  [153, "PickupGalReturns", 0, "Pickup"],
  [154, "PickupSuitChaos", 0, "Pickup"],
  [155, "PickupJiangshiIyo2", 0, "Pickup"],
  [156, "PickupUniformShiroe", 0, "Pickup"],
  [157, "PickupMaidMusashi", 0, "Pickup"],
  [158, "PickupSchoolMizugiTsumire", 0, "Pickup"],
  [159, "PickupFundoshiMusashi2", 0, "Pickup"],
  [160, "PickupBellyDanceYao2", 0, "Pickup"],
  [161, "MusicToytoy", 0, "Music"],
  [162, "PickupTrainDia", 0, "Pickup"],
  [163, "PickupTouka", 0, "Pickup"],
  [164, "UnlockTouka", 0, "Unlock"],
  [165, "PickupMaidJun", 0, "Pickup"],
  [166, "LimitedCharaReturns3", 0, "Limited"],
];
// NOTE: ids must match MFG.GameData.GachaSeriesName ordinals exactly — the
// client resolves ExtraMaster/assets/music by numeric id. There is no 167+
// and no Noel/Lisha in client 2026060900 (CharaType max Chara21=Touka).

export const GACHA_SERIES_ALL: Array<[number, string, number, string]> = [
  [0, "Normal", 0, "Normal"],
  [1, "NormalTicket", 1, "Normal"],
  [2, "PickupPine", 0, "Pickup"],
  [3, "PickupMizugiSen", 0, "Pickup"],
  [4, "PickupMizugiMitsuba", 0, "Pickup"],
  [5, "PickupMizugiMusashi", 0, "Pickup"],
  [6, "PickupMizugiHiyori", 0, "Pickup"],
  [7, "PickupMizugiYao", 0, "Pickup"],
  [8, "PickupMizugiPain", 0, "Pickup"],
  [9, "PickupMizugiTenshi", 0, "Pickup"],
  [10, "PickupShiori", 0, "Pickup"],
  [11, "PickupMizugiTumire", 0, "Pickup"],
  [12, "PickupMizugiToitoi", 0, "Pickup"],
  [13, "PickupHalfAnniversary", 0, "Pickup"],
  [14, "PickupMizugiIchiko", 0, "Pickup"],
  [15, "PickupMizugiTeiyaku", 0, "Pickup"],
  [16, "PickupHalloweenMusashi", 0, "Pickup"],
  [17, "PickupMizugiNijo", 0, "Pickup"],
  [18, "PickupChaos", 0, "Pickup"],
  [19, "PickupCinderellaMitsuba", 0, "Pickup"],
  [20, "PickupXmasTenshi", 0, "Pickup"],
  [21, "PickupNewYearTsumire", 0, "Pickup"],
  [22, "PickupNewYearYao", 0, "Pickup"],
  [23, "PickupValentineToytoy", 0, "Pickup"],
  [24, "PickupClear", 0, "Pickup"],
  [25, "UnlockClear", 0, "Unlock"],
  [26, "PickupSuccubusTenshi", 0, "Pickup"],
  [27, "PickupParodiusTsumire", 0, "Pickup"],
  [28, "PickupRaceQueenHiyori", 0, "Pickup"],
  [29, "PickupShiori2", 0, "Pickup"],
  [30, "PickupMizugiChaos", 0, "Pickup"],
  [31, "PickupHalfAnniversary2", 0, "Pickup"],
  [32, "PickupMizugiClear", 0, "Pickup"],
  [33, "PickupAliceMaidPine", 0, "Pickup"],
  [34, "PickupMizugiReturns1", 0, "Pickup"],
  [35, "PickupJerseyMitsuba", 0, "Pickup"],
  [36, "PickupUniformMusashi", 0, "Pickup"],
  [37, "PickupUniformSen", 0, "Pickup"],
  [38, "PickupChaos2", 0, "Pickup"],
  [39, "PickupUniformYao", 0, "Pickup"],
  [40, "PickupYukataToytoy", 0, "Pickup"],
  [41, "PickupClear2", 0, "Pickup"],
  [42, "PickupShiori3", 0, "Pickup"],
  [43, "PickupIyo", 0, "Pickup"],
  [44, "UnlockIyo", 0, "Unlock"],
  [45, "PickupTohoHiyori", 0, "Pickup"],
  [46, "PickupTohoTenshi", 0, "Pickup"],
  [47, "PickupTohoClear", 0, "Pickup"],
  [48, "PickupMizugiKomugi", 0, "Pickup"],
  [49, "PickupMizugiReturns2", 0, "Pickup"],
  [50, "PickupDateMizugiSen", 0, "Pickup"],
  [51, "PickupSisterTsumire", 0, "Pickup"],
  [52, "PickupUniformSen2", 0, "Pickup"],
  [53, "PickupHalloweenMusashi2", 0, "Pickup"],
  [54, "PickupBomberPine", 0, "Pickup"],
  [55, "PickupGrimAroe", 0, "Pickup"],
  [56, "UnlockGrimAroe", 0, "Unlock"],
  [57, "PickupChaos3", 0, "Pickup"],
  [58, "PickupClear3", 0, "Pickup"],
  [59, "PickupIyo2", 0, "Pickup"],
  [60, "PickupDarknessRobeMitsuba", 0, "Pickup"],
  [61, "PickupNurseChaos", 0, "Pickup"],
  [62, "PickupCocoa", 0, "Pickup"],
  [63, "UnlockCocoa", 0, "Unlock"],
  [64, "PickupClear4", 0, "Pickup"],
  [65, "PickupGrimAroe2", 0, "Pickup"],
  [66, "PickupXmasTenshi2", 0, "Pickup"],
  [67, "PickupJiangshiIyo", 0, "Pickup"],
  [68, "PickupNewYearReturns1", 0, "Pickup"],
  [69, "PickupFundoshiMusashi", 0, "Pickup"],
  [70, "PickupValentineToytoy2", 0, "Pickup"],
  [71, "PickupBellyDanceYao", 0, "Pickup"],
  [72, "PickupAngelTenshi", 0, "Pickup"],
  [73, "PickupDia", 0, "Pickup"],
  [74, "UnlockDia", 0, "Unlock"],
  [75, "PickupIyo3", 0, "Pickup"],
  [76, "PickupGrimAroe3", 0, "Pickup"],
  [77, "PickupCocoa2", 0, "Pickup"],
  [78, "PickupLolitaToytoy", 0, "Pickup"],
  [79, "PickupGalHiyori", 0, "Pickup"],
  [80, "PickupGalGrimAroe", 0, "Pickup"],
  [81, "PickupGalClear", 0, "Pickup"],
  [82, "PickupParodiusTsumire2", 0, "Pickup"],
  [83, "PickupAnimalMizugiCocoa", 0, "Pickup"],
  [84, "PickupMizugiReturns3", 0, "Pickup"],
  [85, "PickupParkaMusashi", 0, "Pickup"],
  [86, "PickupAnimalMizugiDia", 0, "Pickup"],
  [87, "PickupSuccubusTenshi2", 0, "Pickup"],
  [88, "PickupDressChaos", 0, "Pickup"],
  [89, "PickupRaceQueenHiyori2", 0, "Pickup"],
  [90, "PickupMaidTsumire", 0, "Pickup"],
  [91, "MusicHiyori", 0, "Music"],
  [92, "MusicSen", 0, "Music"],
  [93, "PickupShiori4", 0, "Pickup"],
  [94, "PickupChaos4", 0, "Pickup"],
  [95, "PickupClear5", 0, "Pickup"],
  [96, "PickupIyo4", 0, "Pickup"],
  [97, "PickupGrimAroe4", 0, "Pickup"],
  [98, "PickupCocoa3", 0, "Pickup"],
  [99, "PickupDia2", 0, "Pickup"],
  [100, "PickupDoubriel", 0, "Pickup"],
  [101, "UnlockDoubriel", 0, "Unlock"],
  [102, "PickupPartTimerMitsuba", 0, "Pickup"],
  [103, "PickupUniformYao2", 0, "Pickup"],
  [104, "PickupCinderellaMitsuba2", 0, "Pickup"],
  [105, "PickupAliceMaidPine2", 0, "Pickup"],
  [106, "PickupSchoolMizugiSen", 0, "Pickup"],
  [107, "MusicYao", 0, "Music"],
  [108, "PickupUniformMusashi2", 0, "Pickup"],
  [109, "PickupSchoolMizugiIyo", 0, "Pickup"],
  [110, "PickupSchoolMizugiToytoy", 0, "Pickup"],
  [111, "PickupJerseyMitsuba2", 0, "Pickup"],
  [112, "PickupUniformSen3", 0, "Pickup"],
  [113, "PickupBellyDancePine", 0, "Pickup"],
  [114, "MusicTenshi", 0, "Music"],
  [115, "PickupYukataYao", 0, "Pickup"],
  [116, "PickupShiori5", 0, "Pickup"],
  [117, "PickupChaos5", 0, "Pickup"],
  [118, "PickupClear6", 0, "Pickup"],
  [119, "PickupIyo5", 0, "Pickup"],
  [120, "PickupGrimAroe5", 0, "Pickup"],
  [121, "PickupCocoa4", 0, "Pickup"],
  [122, "PickupDia3", 0, "Pickup"],
  [123, "PickupDoubriel2", 0, "Pickup"],
  [124, "PickupIppatsu", 0, "Pickup"],
  [125, "UnlockIppatsu", 0, "Unlock"],
  [126, "PickupUniformTenshi", 0, "Pickup"],
  [127, "PickupMaidToytoyIyo", 0, "Pickup"],
  [128, "PickupMizugiReturns4", 0, "Pickup"],
  [129, "PickupUniformDia", 0, "Pickup"],
  [130, "PickupYukataToytoy2", 0, "Pickup"],
  [131, "PickupUniformDoubriel", 0, "Pickup"],
  [132, "MusicMusashi", 0, "Music"],
  [133, "LimitedCharaReturns", 0, "Limited"],
  [134, "PickupShiroe", 0, "Pickup"],
  [135, "UnlockShiroe", 0, "Unlock"],
  [136, "PickupXmasGrimAroe", 0, "Pickup"],
  [137, "PickupMarchingIchiko", 0, "Pickup"],
  [138, "PickupKimonoClear", 0, "Pickup"],
  [139, "PickupBomberPine2", 0, "Pickup"],
  [140, "PickupLillyIppatsu", 0, "Pickup"],
  [141, "PickupSisterTsumire2", 0, "Pickup"],
  [142, "PickupAlotGrimAroe", 0, "Pickup"],
  [143, "PickupDarknessRobeMitsuba2", 0, "Pickup"],
  [144, "PickupValentineHiyori", 0, "Pickup"],
  [145, "PickupNurseChaos2", 0, "Pickup"],
  [146, "MusicMitsuba", 0, "Music"],
  [147, "PickupJun", 0, "Pickup"],
  [148, "UnlockJun", 0, "Unlock"],
  [149, "LimitedCharaReturns2", 0, "Limited"],
  [150, "PickupGalSen", 0, "Pickup"],
  [151, "PickupGalCocoa", 0, "Pickup"],
  [152, "PickupGalDia", 0, "Pickup"],
  [153, "PickupGalReturns", 0, "Pickup"],
  [154, "PickupSuitChaos", 0, "Pickup"],
  [155, "PickupJiangshiIyo2", 0, "Pickup"],
  [156, "PickupUniformShiroe", 0, "Pickup"],
  [157, "PickupMaidMusashi", 0, "Pickup"],
  [158, "PickupSchoolMizugiTsumire", 0, "Pickup"],
  [159, "PickupFundoshiMusashi2", 0, "Pickup"],
  [160, "PickupBellyDanceYao2", 0, "Pickup"],
  [161, "MusicToytoy", 0, "Music"],
  [162, "PickupTrainDia", 0, "Pickup"],
  [163, "PickupTouka", 0, "Pickup"],
  [164, "UnlockTouka", 0, "Unlock"],
  [165, "PickupMaidJun", 0, "Pickup"],
  [166, "LimitedCharaReturns3", 0, "Limited"],
];

export function hiddenGachaIds(): Set<number> {
  const out = new Set<number>();
  const collect = (raw: any) => {
    if (raw == null) return;
    for (const part of String(raw).split(",")) {
      const n = Number(String(part).trim());
      if (Number.isInteger(n) && n >= 0) out.add(n);
    }
  };
  try { collect(U.GetConfig("VFG_HIDE_GACHA")); } catch { }
  // @ts-ignore
  try { if (typeof process !== "undefined" && process.env) collect(process.env.VFG_HIDE_GACHA); } catch { }
  return out;
}

// Does this banner's own data model a Pickup pool? Featured charas (the boost
// targets) or featured cutins (custom/extra items). This is the gate the client
// runs on too: it enters the cutin gacha scene on the banners the schedule
// advertises (GachaInfoGameData.Validate -> ModeGachaInfo), and its pickup UI
// (pickup_items / limited_pickup_items, IsPickitemsAllGet,
// IsGachaEnableFromChara) only has something to show when the banner names
// featured charas or featured cutins. Banners with no pool data of their own
// are not advertised as pickup banners.
export function bannerHasPickupPool(entry: any): boolean {
  if (!entry) return false;
  if ((entry.pickup_charas || []).length) return true;
  if ((entry.custom_pickup_items || []).length) return true;
  if ((entry.extra_items || []).length) return true;
  return false;
}

// The pickup-gacha gate is data-driven: active exactly when the advertised
// schedule carries a Pickup/Limited banner that really has a pickup pool.
export function pickupGachaGateActive(): boolean {
  for (const [sid, , , stype] of gachaSeries()) {
    if (stype !== "Pickup" && stype !== "Limited") continue;
    if (bannerHasPickupPool(GACHA_SERIES_POOLS[String(sid)])) return true;
  }
  return false;
}

export function gachaSeries(): Array<[number, string, number, string]> {
  let baseSeries = GACHA_SERIES_CURATED;
  try {
    // @ts-ignore
    const v = U.GetConfig("VFG_GACHA_ALL");
    if (String(v).toLowerCase() === "1" || String(v).toLowerCase() === "true" || String(v).toLowerCase() === "yes" || String(v).toLowerCase() === "on") {
      baseSeries = GACHA_SERIES_ALL;
    }
  } catch { }
  try {
    // also check env for local testing
    // @ts-ignore
    const ev = process.env.VFG_GACHA_ALL;
    if (ev && ["1", "true", "yes", "on"].includes(ev.trim().toLowerCase())) baseSeries = GACHA_SERIES_ALL;
  } catch { }
  const hidden = hiddenGachaIds();
  if (hidden.size) baseSeries = baseSeries.filter(([sid]) => !hidden.has(Number(sid)));
  return baseSeries.filter(([sid, , , stype]: [number, string, number, string]) => {
    if (stype === "Music" || stype === "Normal") return true;
    const entry = GACHA_SERIES_POOLS[String(sid)] || {};
    if (stype === "Unlock") return true;
    if (stype === "Pickup") return (entry.pickup_charas || []).length > 0 || (entry.custom_pickup_items || []).length > 0;
    if (stype === "Limited") return bannerHasPickupPool(entry);
    return true;
  });
}

export interface GachaPool {
  items: string[];
  charas: string[];
  custom: string[];
  pickup: string[];
  limited: string[];
  exchange: string[];
  // group -> rarity -> OIDs. These are the cells gachaRates() prices and
  // rollGachaItems() samples from, so an advertised number is a rolled number.
  buckets: Record<string, Record<string, string[]>>;
}

export const GACHA_RARITIES = ["N", "R", "SR", "UR"];
export const GACHA_GROUPS = ["normal", "pickup", "limited"];

const oidUp = (s: any): string => String(s == null ? "" : s).trim().toUpperCase();

// Rarity bucket of a cutin OID: the client master's Rarity (the same value the
// client shows next to the item), with the OID's own rarity token as backup.
// The master's "Nothing" rank (the A-rank cutins every account already owns)
// rolls inside the advertised N bucket so every item in a pool sits under an
// advertised number.
export function cutinRarityBucket(oid: string): string {
  const info = CUTIN_OID_INFO[oidUp(oid)];
  let r = info ? info.rarity : "";
  if (r !== "UR" && r !== "SR" && r !== "R" && r !== "N") {
    const m = /^OID_\d{2}[A-Za-z]+?(UR|SR|A|R|N)\d*$/.exec(String(oid || ""));
    r = m ? m[1] : "";
  }
  if (r === "UR" || r === "SR" || r === "R") return r;
  return "N";
}

// Items that must never be handed out. NAKIA01/02 (Chara20) and 21NAKIA01/02
// hang the client's cutin preview (no matching asset); the same permanent ban
// plus the VFG_GACHA_EXCLUDE / VFG_GACHA_CHARAS bisection knobs apply here, to
// the advertised pools as well as to the roll, so what a banner advertises is
// what it can actually give.
const GACHA_BANNED_OIDS = new Set<string>([
  "OID_20NAKIA01", "OID_20NAKIA02", "OID_21NAKIA01", "OID_21NAKIA02",
]);

function collectOidSet(raw: any, out: Set<string>): void {
  if (raw == null) return;
  for (const part of String(raw).split(",")) {
    const o = part.trim().toUpperCase();
    if (o) out.add(o);
  }
}

// VFG_GACHA_CHARAS="10,11,12" restricts rolls to those charas' items
// (prefix OID_XX); VFG_GACHA_SAFE=1 is shorthand for 01-09 (oldest,
// most-tested assets). Bisect Halves (10-15, 16-21, then thirds) to isolate a
// freeze-causing newer-chara asset; if even 01-09 freezes, the cause is
// timing/memory, not an item. Returns null when nothing is restricted.
export function gachaCharaAllow(): Set<string> | null {
  let raw = "";
  try { raw += String(U.GetConfig("VFG_GACHA_CHARAS") || ""); } catch { }
  // @ts-ignore
  try { if (typeof process !== "undefined" && process.env) raw += "," + String(process.env.VFG_GACHA_CHARAS || ""); } catch { }
  let safe = false;
  try { safe = ["1", "true", "yes", "on"].includes(String(U.GetConfig("VFG_GACHA_SAFE") || "").trim().toLowerCase()); } catch { }
  try {
    // @ts-ignore
    const envSafe = typeof process !== "undefined" && process.env ? String(process.env.VFG_GACHA_SAFE || "").trim().toLowerCase() : "";
    if (["1", "true", "yes", "on"].includes(envSafe)) safe = true;
  } catch { }
  const allow = new Set<string>();
  for (const part of raw.split(",")) {
    const n = parseInt(part.trim(), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 21) allow.add(`OID_${String(n).padStart(2, "0")}`);
  }
  if (safe) {
    for (let n = 1; n <= 9; n++) allow.add(`OID_${String(n).padStart(2, "0")}`);
  }
  return allow.size ? allow : null;
}

export function gachaExcludedOids(): Set<string> {
  const out = new Set<string>(GACHA_BANNED_OIDS);
  try { collectOidSet(U.GetConfig("VFG_GACHA_EXCLUDE"), out); } catch { }
  // @ts-ignore
  try { if (typeof process !== "undefined" && process.env) collectOidSet(process.env.VFG_GACHA_EXCLUDE, out); } catch { }
  return out;
}

export function filterGachaItems(list: string[], label: string): string[] {
  const allow = gachaCharaAllow();
  const excluded = gachaExcludedOids();
  const out = (list || []).filter((oid: string) => {
    const o = oidUp(oid);
    if (excluded.has(o)) return false;
    if (allow) {
      const m = /^OID_(\d{2})/.exec(o);
      if (!m || !allow.has(m[1])) return false;
    }
    return true;
  });
  if (out.length !== (list || []).length) {
    try { vlog(`[VFG] gacha pool ${label}: ${list.length} -> ${out.length} (after chara/exclude filters)`); } catch { }
  }
  return out;
}

function bucketByRarity(list: string[]): Record<string, string[]> {
  const b: Record<string, string[]> = {};
  for (const r of GACHA_RARITIES) b[r] = [];
  for (const oid of list || []) {
    const bucket = bucketOf(b, cutinRarityBucket(oid));
    if (!bucket.includes(oid)) bucket.push(oid);
  }
  return b;
}
function bucketOf(b: Record<string, string[]>, rarity: string): string[] {
  if (!b[rarity]) b[rarity] = [];
  return b[rarity];
}

export function _gachaPool(sid: number, stype: string): GachaPool {
  const entry: any = GACHA_SERIES_POOLS[String(sid)] || {};
  const featured: string[] = [...(entry.pickup_charas || [])];
  let charas: string[] = [...featured];
  const customRaw: string[] = [...(entry.custom_pickup_items || [])];
  if (stype === "Music") {
    const music = [...(entry.music_items || [])];
    return { items: music, charas, custom: [], pickup: [], limited: [], exchange: music, buckets: {} };
  }
  // A Pickup banner with nothing in its entry resolves its bg/monitor art off
  // the first featured chara (GachaSeriesServerInfo.BgMonitorAddressableAssetPath),
  // so it still gets one - but that fallback is not a pickup pool (see
  // bannerHasPickupPool: it does not make the banner a pickup banner).
  if (stype === "Pickup" && !charas.length && !customRaw.length) {
    charas = [GACHA_FALLBACK_CHARA];
  }

  const nums = new Set<string>();
  for (const c of featured) {
    const m = /^Chara(\d+)$/.exec(String(c || ""));
    if (m) nums.add(String(m[1]).padStart(2, "0"));
  }

  // The banner's own item data. custom_pickup_items names the featured cutin
  // of an SP/Unlock banner; extra_items carries the featured unlock cutins of
  // the Limited "returns" banners.
  const bannerExtras: string[] = [];
  for (const oid of [...(entry.extra_items || []), ...customRaw]) {
    if (oid && !bannerExtras.includes(oid)) bannerExtras.push(oid);
  }

  // limited_pickup_items: Limited banners preview these in their own panel
  // (GachaSeriesServerInfo.LimitedItems) and IsLimitedCutin()/GetPickupItemContainSeries
  // look them up there, so a Limited banner has to name them.
  const limited = filterGachaItems(
    stype === "Limited" ? bannerExtras.filter((o: string) => !!CUTIN_OID_INFO[oidUp(o)]) : [],
    `limited#${sid}`
  );

  // pickup_items: what the banner boosts - its own featured cutins plus every
  // catalog cutin of its featured girls. Empty is fine for the client
  // (IsPickitemsAllGet needs Count>0, the panel just skips an empty tag).
  let pickup: string[] = [];
  if (stype !== "Limited") {
    for (const oid of customRaw) if (!pickup.includes(oid)) pickup.push(oid);
    for (const oid of (GACHA_STANDARD_POOL || [])) {
      const m = /^OID_(\d{2})/.exec(String(oid || ""));
      if (m && nums.has(m[1]) && !pickup.includes(oid)) pickup.push(oid);
    }
  }
  pickup = filterGachaItems(pickup, `pickup#${sid}`);
  const custom = filterGachaItems(customRaw, `custom#${sid}`);

  // items: everything this banner can hand out - the catalog plus the banner's
  // own extras. The normal roll group is that list minus the boosted cells.
  let items: string[] = [...(GACHA_STANDARD_POOL || [])];
  for (const oid of bannerExtras) {
    if (!items.includes(oid)) items.push(oid);
  }
  items = filterGachaItems(items, `items#${sid}`);
  const boosted = new Set<string>([...pickup, ...limited]);
  const normal = items.filter((o: string) => !boosted.has(o));

  // exchange: the banner girl's cutins plus custom tickets, so the exchange
  // list is never empty. All OIDs come from pools already validated against
  // the client's CutinItemMaster.
  let exchange = [...custom];
  if (nums.size) {
    for (const oid of items) {
      const m = /^OID_(\d{2})/.exec(String(oid || ""));
      if (m && nums.has(m[1]) && !exchange.includes(oid)) exchange.push(oid);
    }
  }
  if (!exchange.length) exchange = [...items];

  return {
    items, charas, custom, pickup, limited, exchange,
    buckets: { normal: bucketByRarity(normal), pickup: bucketByRarity(pickup), limited: bucketByRarity(limited) },
  };
}

// Base share of every draw per banner type, in per-mil (the client divides by
// 10 for its percentage display). Pickup and Limited banners put half of each
// draw into their own featured pool - that is the "提供割合が高くなります" the
// client's own supply text promises - an SP/Unlock banner boosts its featured
// cutin at 30%, and a Normal banner just rolls the catalog.
const GACHA_GROUP_BASE: Record<string, Record<string, number>> = {
  Pickup: { normal: 500, pickup: 500, limited: 0 },
  Limited: { normal: 500, pickup: 0, limited: 500 },
  Unlock: { normal: 700, pickup: 300, limited: 0 },
  Normal: { normal: 1000, pickup: 0, limited: 0 },
  None: { normal: 1000, pickup: 0, limited: 0 },
};
// Rarity split inside one pool group, per-mil of that group.
const GACHA_RARITY_SHARE: Record<string, number> = { N: 400, R: 300, SR: 200, UR: 100 };

export interface GachaRateCell {
  group: string;
  rarity: string;
  w: number;
}

// The banner's rate table: one per-mil weight per (group, rarity) cell that
// the banner actually has items in, normalized to a total of exactly 1000.
// buildGachaInfoXml advertises these numbers and rollGachaItems rolls them, so
// advertised odds and implemented roll are the same object.
export function gachaRates(sid: number, stype: string, pool: GachaPool): GachaRateCell[] {
  const base = GACHA_GROUP_BASE[stype] || GACHA_GROUP_BASE.Normal;
  const cells: GachaRateCell[] = [];
  for (const group of GACHA_GROUPS) {
    const share = base[group] || 0;
    if (!share) continue;
    for (const rarity of GACHA_RARITIES) {
      const bucket = (pool.buckets && pool.buckets[group] && pool.buckets[group][rarity]) || [];
      if (!bucket.length) continue; // never advertise a rate for an empty cell
      cells.push({ group, rarity, w: Math.round((share * GACHA_RARITY_SHARE[rarity]) / 1000) });
    }
  }
  if (!cells.length) {
    // Nothing modelled for this banner (empty pools): roll the advertised item
    // list at the plain rarity split rather than advertise numbers with no roll.
    for (const rarity of GACHA_RARITIES) cells.push({ group: "normal", rarity, w: GACHA_RARITY_SHARE[rarity] });
  }
  let total = 0;
  for (const c of cells) total += c.w;
  if (total !== 1000 && total > 0) {
    const scaled = cells.map((c: GachaRateCell) => ({ c, exact: (c.w * 1000) / total }));
    let assigned = 0;
    for (const s of scaled) {
      s.c.w = Math.floor(s.exact);
      assigned += s.c.w;
    }
    const byRemainder = scaled.slice().sort((a: any, b: any) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)));
    // Largest remainder: hand out what the floors left over, biggest fraction
    // first, so the advertised numbers add up to exactly 1000 per-mil.
    for (let i = 0; assigned < 1000 && byRemainder.length; i++) {
      byRemainder[i % byRemainder.length].c.w += 1;
      assigned++;
    }
  }
  return cells.filter((c: GachaRateCell) => c.w > 0);
}

// Weighted draws WITHOUT replacement inside one multi-pull: each draw walks the
// banner's own rate table (the very cells gachaRates()/buildGachaInfoXml()
// advertise), picks uniformly inside that (group, rarity) cell, and consumes
// what it took, so the OIDs of one <gain_items> block are always distinct.
// That is the gacha path's shipped invariant: the client only ever plays 1 or 5
// (GachaPlayUtility.cs:12-19 Count) and builds one result entry per item it was
// handed (GachaResultInfo.cs:60-65), so a paid 5-pull is five different cutins.
// A repeat inside one pull is not a gift case either: AffectToGameData looks the
// item up in Customize.CutinItems as that list was already mutated by the
// earlier entry of the same pull (GachaResultInfo.cs:110 and 114), so the second
// copy falls into the :130-133 branch and only bumps AcquiredCountInGacha5 - the
// pull is paid for and nothing new arrives. Gift credit comes from <gift> alone
// (GachaResultInfo.cs:73-75 and 146-149), so the duplicates that do pay out are
// cutins the account owns from earlier pulls, reported as gift_type 1
// DuplicateGift.
export function rollGachaItems(pool: GachaPool, cells: GachaRateCell[], count: number): string[] {
  const out: string[] = [];
  const wanted = Math.max(0, Math.floor(Number(count) || 0));
  if (wanted <= 0) return out;

  // One live copy per advertised cell, so consuming a draw never touches the
  // banner's pool (the same buckets back the advertised rate table). Only cells
  // that still hold a cutin take part in a draw: the weights renormalise over
  // what the banner can still hand out instead of spending a draw on an empty
  // cell, which is what keeps a 5-pull five items long.
  const table: Array<{ group: string; rarity: string; w: number; left: string[] }> = [];
  for (const c of cells || []) {
    if (!c || !(c.w > 0)) continue;
    const bucket = ((pool.buckets || {})[c.group] || {})[c.rarity] || [];
    if (!bucket.length) continue;
    table.push({ group: c.group, rarity: c.rarity, w: c.w, left: bucket.slice() });
  }

  // Seen-this-pull, across cells too: a cutin that sits in two cells of one
  // banner (pool built differently from the rates) still cannot be paid for
  // twice in the same multi-pull.
  const used = new Set<string>();
  const takeFrom = (cell: { left: string[] }): string | null => {
    while (cell.left.length) {
      const i = Math.floor(Math.random() * cell.left.length);
      const oid = cell.left[i];
      cell.left.splice(i, 1);
      if (!oid || used.has(oid)) continue;
      used.add(oid);
      return oid;
    }
    return null;
  };

  while (out.length < wanted) {
    let total = 0;
    for (const cell of table) if (cell.left.length) total += cell.w;
    if (total > 0) {
      let roll = Math.floor(Math.random() * total);
      let chosen: { group: string; rarity: string; w: number; left: string[] } | null = null;
      for (const cell of table) {
        if (!cell.left.length) continue;
        if (roll < cell.w) { chosen = cell; break; }
        roll -= cell.w;
      }
      if (!chosen) {
        // integer floors left nothing: take any cell that still has an item
        for (const cell of table) if (cell.left.length) { chosen = cell; break; }
      }
      if (chosen) {
        const oid = takeFrom(chosen);
        if (oid) { out.push(oid); continue; }
      }
    }
    // Nothing is left in the advertised cells, or the roll came with no cells
    // at all (aog.ts's standard_pool fallback passes buckets: {}). Stay inside
    // the banner's own item list, still without replacement.
    const left = (pool.items || []).filter((o: string) => o && !used.has(o));
    if (!left.length) break; // the banner has no unseen cutin left to hand out
    const oid = left[Math.floor(Math.random() * left.length)];
    used.add(oid);
    out.push(oid);
  }
  return out;
}


let _gachaInfoCache: Map<string, string> = new Map();
export function buildGachaInfoXml(): string {
  const rows: string[] = [];
  for (const [sid, label, ticket, stype] of gachaSeries()) {
    const pool = _gachaPool(sid, stype);
    const items = pool.items.map(o => `<item>${xml_escape(o)}</item>`).join("");
    const charas = pool.charas.map(c => `<chara>${xml_escape(c)}</chara>`).join("");
    const custom = pool.custom.map(o => `<item>${xml_escape(o)}</item>`).join("");
    const pickup = pool.pickup.map(o => `<item>${xml_escape(o)}</item>`).join("");
    const limited = pool.limited.map(o => `<item>${xml_escape(o)}</item>`).join("");
    const exchange = pool.exchange.map(o => `<item>${xml_escape(o)}</item>`).join("");
    // The advertised numbers are the roll's own rate table (gachaRates), and
    // the client reads them as int/10 percentage points per group and rarity
    // (GachaInfoGameData.cs:138-172 -> SupplyPickupItemListWindow.cs:118).
    const rateXml = (group: string): string => {
      const v: Record<string, number> = { N: 0, R: 0, SR: 0, UR: 0 };
      for (const c of gachaRates(sid, stype, pool)) {
        if (c.group === group && v[c.rarity] !== undefined) v[c.rarity] += c.w;
      }
      return `<${group}><n>${v.N}</n><r>${v.R}</r><sr>${v.SR}</sr><ur>${v.UR}</ur></${group}>`;
    };
    rows.push(
      "<info>" +
      `<id>${sid}</id>` +
      `<label>${xml_escape(label)}</label>` +
      `<ticket_nr>${ticket}</ticket_nr>` +
      "<now_active>1</now_active>" +
      "<force_active>0</force_active>" +
      `<series_type>${stype}</series_type>` +
      `<items>${items}</items>` +
      `<pickup_charas>${charas}</pickup_charas>` +
      `<pickup_items>${pickup}</pickup_items>` +
      `<limited_pickup_items>${limited}</limited_pickup_items>` +
      `<custom_pickup_items>${custom}</custom_pickup_items>` +
      `<exchange_items>${exchange}</exchange_items>` +
      `<pickup_rate>${rateXml("normal")}${rateXml("pickup")}${rateXml("limited")}</pickup_rate>` +
      `<start_date>${EVENT_BEGIN}</start_date>` +
      `<end_date>${EVENT_END}</end_date>` +
      "<force_end_date></force_end_date>" +
      "</info>"
    );
  }
  return "<gacha_schedule>" + rows.join("") + "</gacha_schedule>";
}

export function _gachaInfoXml(): string {
  const series = gachaSeries();
  const key = [...hiddenGachaIds()].sort((a, b) => a - b).join(",") + "|" + series.map(([sid]) => sid).join(",");
  let xml = _gachaInfoCache.get(key);
  if (xml == null) {
    xml = buildGachaInfoXml();
    _gachaInfoCache.set(key, xml);
  }
  return xml;
}

// ---------------------------------------------------------------------------
// plugin data files (data/*.json)
// ---------------------------------------------------------------------------
// Same rule as gacha_pools.json / cutin_items.json: require() first (the staged
// plugin keeps its data folder next to handlers/), then a filesystem walk
// because the core loads the plugin through ts-node from dist/.
function loadPluginDataJson(file: string, fallback: any): any {
  let out: any = null;
  try {
    // @ts-ignore
    out = require(`../data/${file}`);
  } catch { out = null; }
  if (!out) {
    try {
      // @ts-ignore
      const fs = require("fs");
      // @ts-ignore
      const path = require("path");
      const candidates = [
        // @ts-ignore
        typeof __dirname !== "undefined" ? path.join(__dirname, "../data", file) : null,
        `data/${file}`,
        `../data/${file}`,
      ].filter(Boolean) as string[];
      for (const p of candidates) {
        try {
          if (fs.existsSync(p)) { out = JSON.parse(fs.readFileSync(p, "utf-8")); break; }
        } catch { }
      }
    } catch { }
  }
  return out || fallback;
}

// A config key holding a comma-separated list (config.ini [mfg@asphyxia] key,
// or the same name in the environment), same lookup chain as VFG_EVENT_TAKU.
export function configList(key: string): string[] {
  let raw = "";
  try {
    if (U && U.GetConfig) { const v = U.GetConfig(key); if (v) raw = String(v); }
  } catch { }
  if (!raw) { try { const e = process.env[key]; if (e) raw = String(e); } catch { } }
  if (!raw) { try { if (CONFIG && CONFIG[key]) raw = String(CONFIG[key]); } catch { } }
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// notices (data/notices.json)
// ---------------------------------------------------------------------------
// The client has two notice channels and both are server-authored content:
//  - notice_game: NoticeGameData (NoticeGameData.cs:13-21) -> the HomeNoticeWindow
//    list (HomeNoticeWindow.cs:131,189), the "new" badge on the notice button
//    (HomeFlow.cs:937) and the home carousel (HomeFlow.cs:985 ->
//    NoticeInfo.IsDisplayHomeBanner, NoticeInfo.cs:57-64). NoticeGameData.Save
//    (NoticeGameData.cs:140-145) is never called anywhere in the assembly, so the
//    account's list exists only if this server wrote it.
//  - receive_only.ImportantNotices: ReceiveOnlyGameData.cs:16 (the document has no
//    Save at all) -> HomeFlow.ImportantNoticeAppearance (HomeFlow.cs:639-663),
//    which opens the client's own ImportantNoticeMaster page for each NoticeID and
//    posts back the ids it closed.
// Acks are per profile: notice_done / important_notice_done are pcuid-addressed
// and carry no mid (NoticeDone.cs:18, ImportantNoticeDone.cs:18), so the ids land
// on the profile (handlers/aog.ts handle_notice_ack) and are filtered here - a
// notice the account has read is never served again.
const NOTICES_DATA: any = loadPluginDataJson("notices.json", { notice: [], important: [] });

// MFG.Types.Notice.Category, in declaration order (NoticeInfo.Category is an enum,
// and JsonUtility stores enums as ints).
const NOTICE_CATEGORY_IDS: Record<string, number> = {
  Update: 0, Failure: 1, Information: 2, Event: 3, Gacha: 4, Campaign: 5, GachaBanner: 6,
};

export interface ServerNoticeDoc {
  NoticeID: number;
  Category: number;
  Title: string;
  Text: string;
  ReleaseDate: string;
  UpdateDate: string;
  IsNew: boolean;
  IsHomeDisplay: boolean;
  HomeBannerName: string;
  HomeDisplayEndDate: string;
  Imageurl: string;
}

export function serverNoticeDocs(): ServerNoticeDoc[] {
  const out: ServerNoticeDoc[] = [];
  const raw = Array.isArray(NOTICES_DATA?.notice) ? NOTICES_DATA.notice : [];
  for (const n of raw) {
    const id = Number(n?.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    let category = Number(n?.category);
    if (!Number.isInteger(category)) {
      const name = String(n?.category ?? "").trim();
      category = NOTICE_CATEGORY_IDS[name] != null ? NOTICE_CATEGORY_IDS[name] : NOTICE_CATEGORY_IDS.Information;
    }
    const asDate = (v: any): string => {
      const s = v == null ? "" : String(v).trim();
      if (!s) return "";
      // HomeDisplayEndDate / ReleaseDate are parsed by DateTimeOffsetManager
      // .GetJSTFromString (DateTime.TryParse, JST implied); normalise ISO dates
      // to the "YYYY-MM-DD HH:MM" the shipped schedule strings already use.
      return s.replace("T", " ").replace(/\.\d+Z?$/, "").replace(/Z$/, "").slice(0, 19);
    };
    out.push({
      NoticeID: id,
      Category: category,
      Title: String(n?.title ?? ""),
      Text: String(n?.text ?? ""),
      ReleaseDate: asDate(n?.release),
      UpdateDate: asDate(n?.update),
      IsNew: !!n?.is_new,
      IsHomeDisplay: !!n?.home_display,
      HomeBannerName: String(n?.home_banner ?? ""),
      HomeDisplayEndDate: asDate(n?.home_display_end),
      Imageurl: String(n?.image_url ?? ""),
    });
  }
  return out;
}

// MFG.Types.ImportantNotice.NoticeID (None=0, Manner=1, Nuisance=2). The window
// finds its page by that name (ImportantNoticeWindow.cs:52-55) and skips an id it
// has no master item for, so ids here are the client's own.
export function importantNoticeIds(): number[] {
  const out: number[] = [];
  const raw = Array.isArray(NOTICES_DATA?.important) ? NOTICES_DATA.important : [];
  for (const n of raw) {
    const id = Number(typeof n === "object" ? n?.id : n);
    if (Number.isInteger(id) && id > 0 && !out.includes(id)) out.push(id);
  }
  return out;
}

export function ackedNoticeIds(profile: any, bucket: string): Set<string> {
  const raw = profile ? (profile as any)[bucket] : undefined;
  const out = new Set<string>();
  for (const x of (Array.isArray(raw) ? raw : [])) {
    const s = String(x).trim();
    if (s) out.add(s);
  }
  return out;
}

export function noticeGameJson(profile: any): string {
  const acked = ackedNoticeIds(profile, "notice_done_ids");
  const list = serverNoticeDocs().filter(n => !acked.has(String(n.NoticeID)));
  return JSON.stringify({ DataVersion: 1, NoticeInfos: list });
}

// receive_only is a document the client only ever reads (ReceiveOnlyGameData has
// no Save): the penalty flag, the borrow/welcome-campaign account info
// (PlayerLoginInfo feeds CategoryItem.IsWelcomeComebackUser, CategoryItem.cs:33,
// and OnlyPeraichiNoticeWindow's serial lookup), the important notices and the
// scramble festival scoreboard. Seeded with what this server actually runs -
// nothing - plus the notice list from data/notices.json.
export function receiveOnlyJson(profile: any): string {
  const acked = ackedNoticeIds(profile, "important_notice_done_ids");
  const notices = importantNoticeIds()
    .filter(id => !acked.has(String(id)))
    .map(id => ({ NoticeID: id }));
  return JSON.stringify({
    KacEntryInfos: [],
    PlayerInfo: { ComebackCampaignInfos: [], SerialCodeInfos: [] },
    ImportantNotices: notices,
    ScrambleFestivalScoreInfos: [],
    IsPenaltyPlayer: false,
  });
}

// Kinds ClientStateRead.cs can load but no client-side *Save posts back: their
// content exists only if this server wrote it. music_gacha / present_box_game /
// friend_game have their own authoring paths (see the OKF note and the seed
// helpers in handlers/aog.ts); these are the rest of the list.
export const SERVER_OWNED_STATE_KINDS: string[] = [
  "receive_only",
  "notice_game",
  "competition_game",
  "competition_latest_result",
  "shop_competition_game",
  "shop_competition_latest_result",
];

export function serverOwnedStateJson(kind: string, profile: any): string | null {
  switch (kind) {
    case "receive_only": return receiveOnlyJson(profile);
    case "notice_game": return noticeGameJson(profile);
    case "competition_game":
    case "competition_latest_result":
      // CompetitionGameData (CompetitionGameData.cs:13-26): the server runs no
      // competition, so the account's record is an empty one - every caller
      // (GetLatestCompetitionID, GetFinalResultCompetitionInfo) is a null-safe
      // lookup on this list.
      return JSON.stringify({ DataVersion: 1, CompetitionInfos: [] });
    case "shop_competition_game":
    case "shop_competition_latest_result":
      return JSON.stringify({ DataVersion: 1, ShopCompetitionInfos: [] });
  }
  return null;
}

// ---------------------------------------------------------------------------
// taboo words (data/taboowords.json)
// ---------------------------------------------------------------------------
// The list behind /chk_tabooword (ChkTabooword.cs:25 posts str=, :37 the client
// treats result!=0 as "not available", and NewRegistrationFlow.cs:243-259 blocks
// the name on that answer) and behind table chat (handle_gchat / gget_stamp_info).
// Matching is case-insensitive on the trimmed value. Two screens run over this one
// list and they are deliberately not the same test (see isTabooText and
// isTabooTextStandalone below). VFG_TABOO_EXTRA appends per deployment.
export const TABOO_WORDS: string[] = (() => {
  const data = loadPluginDataJson("taboowords.json", { words: [] });
  const words = (Array.isArray(data?.words) ? data.words : [])
    .map((w: any) => String(w || "").trim().toLowerCase())
    .filter(Boolean);
  for (const w of configList("VFG_TABOO_EXTRA")) {
    const k = w.toLowerCase();
    if (k && !words.includes(k)) words.push(k);
  }
  if (!words.length) {
    try { console.error("[VFG] taboowords.json loaded empty - chk_tabooword accepts everything"); } catch { }
  }
  return words;
})();

// Two screens run over this one list, and they are deliberately two different tests.
//
// isTabooText is the ENTRY SCREEN - every place NEW text enters the system:
// /chk_tabooword (ChkTabooword.cs:25 posts str=, :37 the client treats taboo_chk/result
// != 0 as "not available", NewRegistrationFlow.cs:243-259 blocks the name on that answer),
// the create_player name (aog.ts handle_create_player) and both table-chat paths
// (aog.ts handle_gchat / handle_gget_stamp_info: a stamp carries the sender's PlayerName
// and the sticker text, and every seat in the room reads it). There every entry is a
// substring test - カス野郎 goes in through カス, 売春婦 through 売春, cuntface through
// cunt, fuckyou through fuck. Weakening this screen is what let a slur or a threat walk
// through the registration name screen and land as a broadcast name.
//
// isTabooTextStandalone is the narrowing, and aog.ts stateWriteTabooHit is its only
// caller: inside the persistence gate it screens the one field whose text the writer
// cannot rewrite - the name a cc_request memorial-card row carries, filled from the
// item master (CardConnectInfo(now_idx, "MemorialCard", item.ObjectID, item.ShortName),
// GachaResultInfo.cs:178, MissionFlow.cs:302-304, VoteWindow.cs:586) out of this
// server's own data. There a short entry counts only when no letter is glued to either
// side of it, because a value the server already stored is not new text: `カス` sits
// inside `カスミ` (Kasumi) and `rape` inside `Grape`, and the list is deployment data
// (data/taboowords.json plus VFG_TABOO_EXTRA), so the list an account was named under is
// not the list of today. Screening the document this server itself served - the only
// document the shipping client can post back, it has no rename path - ends every later
// save in PlayerConfig.IsDataSaveFailed, and the account can never persist player_game
// again. A refusal there is permanent, so that is the one place the narrowing belongs,
// and only there: the gate screens the account's own posted PlayerName with isTabooText.
//
// Latin entries up to 4 characters get the narrowing. From 5 up (bitch, whore, fucking,
// childsex) an entry is specific enough to stay a substring test, which is also what
// catches an inflection - a deployment that wants the inflected form of a short entry
// lists it (raped, sluts) and substring matching comes with it.
//
// Japanese/Chinese entries up to 2 get it. CJK has no word separators, so the standalone
// rule is applied only to the two-character entries that are known to sit inside ordinary
// words (カス, ブス, クソ); a three-character insult (キモイ, レイプ, 性処理) or a
// four-character phrase (援助交際) is not a fragment of anything innocent and stays a
// substring test in both screens.
//
// The edge is a letter, so digits and punctuation do bound a word: `rape1234` is a hit
// in the gate and `rape` inside `Grape` is not. A compound with letters glued on
// (fuckyou, カス野郎) is not caught by a short entry standing alone - that is the price of
// the narrowing, and the price is paid in the list: the compound is listed as its own
// longer entry, where the substring rule applies to it in both screens.
const TABOO_STANDALONE_MAX_LATIN = 4;
const TABOO_STANDALONE_MAX_CJK = 2;
const TABOO_WORD_EDGE = String.raw`\p{L}`;
const tabooStandaloneMax = (w: string): number => (/[a-z0-9]/.test(w) ? TABOO_STANDALONE_MAX_LATIN : TABOO_STANDALONE_MAX_CJK);
const TABOO_MATCHERS: Array<{ word: string; whole: RegExp | null }> = TABOO_WORDS.map((w) => ({
  word: w,
  whole: w.length <= tabooStandaloneMax(w)
    ? new RegExp(`(?<!${TABOO_WORD_EDGE})${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!${TABOO_WORD_EDGE})`, "iu")
    : null,
}));

const tabooNorm = (value: string): string => (value || "").trim().toLowerCase();

// The entry screen: substring on every entry.
export function isTabooText(value: string): string | null {
  const s = tabooNorm(value);
  if (!s) return null;
  for (const m of TABOO_MATCHERS) {
    if (s.includes(m.word)) return m.word;
  }
  return null;
}

// The persistence gate: substring on every entry of 5 (Latin) / 3 (CJK) characters or
// more, standalone-word matching on the short ones. Used only by stateWriteTabooHit.
export function isTabooTextStandalone(value: string): string | null {
  const s = tabooNorm(value);
  if (!s) return null;
  for (const m of TABOO_MATCHERS) {
    if (m.whole ? m.whole.test(s) : s.includes(m.word)) return m.word;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mission schedule (mission_date info_data "missions")
// ---------------------------------------------------------------------------
// MissionDate.cs:42-45 loads kind "missions" through MissionStatus.LoadFromJson,
// MissionStatus.OnAfterDeserialize keys its table on MFG.Types.Mission.Category and
// MissionData.OnAfterDeserialize drops any row whose "category" does not parse to a
// Category member. A category the server never names is a category the client can
// never light up, so the schedule carries one row per entry of Category.cs, in
// declaration order (MissionCategoryMaster and MissionFlow look these up one by
// one). The daily/weekly/player/character/yaku rows are the ones this server can
// back without a dated schedule, so they are active; the dated event categories are
// present and inactive. Category 0 (None) is emitted too so the list mirrors the
// enum - MissionStatus.OnAfterDeserialize skips Category 0 anyway (:50).
// VFG_MISSION_ACTIVE="Competition9,Bomb" forces rows on, "all" turns the whole
// schedule on, "none" turns every row off.
const MISSION_DATA: any = loadPluginDataJson("mission_categories.json", { categories: [] });

export const MISSION_CATEGORIES: Array<[number, string]> = (Array.isArray(MISSION_DATA?.categories) ? MISSION_DATA.categories : [])
  .map((c: any) => [Number(c?.id), String(c?.name)] as [number, string])
  .filter((c: [number, string]) => Number.isInteger(c[0]) && !!c[1]);

function missionRowActive(row: any): boolean {
  const mode = configList("VFG_MISSION_ACTIVE");
  const name = String(row?.name || "");
  if (mode.length === 1 && mode[0].toLowerCase() === "all") return true;
  if (mode.length === 1 && mode[0].toLowerCase() === "none") return false;
  if (mode.map(s => s.toLowerCase()).includes(name.toLowerCase())) return true;
  return !!row?.active;
}

export function missionsJson(): string {
  const rows = (Array.isArray(MISSION_DATA?.categories) ? MISSION_DATA.categories : []).map((c: any) => ({
    Category: Number(c?.id),
    category: String(c?.name),
    active: missionRowActive(c),
    begin: MISSION_DATA?.begin || EVENT_BEGIN,
    end: MISSION_DATA?.end || EVENT_END,
    param: String(c?.param ?? ""),
  }));
  return JSON.stringify({ list: rows });
}

// aliases for legacy naming
export const gachaPools = GACHA_POOLS;

// MUSIC gacha pools (reach-song)
export const MUSIC_GACHA_POOL: Map<number, string[]> = (() => {
  const m = new Map<number, string[]>();
  for (const sidStr of Object.keys(GACHA_SERIES_POOLS)) {
    const entry = GACHA_SERIES_POOLS[sidStr];
    if (entry.type === "Music" && entry.music_items && entry.music_items.length) {
      m.set(parseInt(sidStr, 10), [...entry.music_items] as string[]);
    }
  }
  return m;
})();

// "music_gacha" is a state the SERVER authors. The client only reads it
// (ClientStateRead.cs:171-172 -> GameDataManager.Apply, GameDataManager.cs:406-408;
// the only request for it is ExecLoadAtGacha, GameDataManager.cs:275-287, called on
// card entry and after every pull in MusicGachaPlay.cs:82), and no ClientStateWrite
// call site exists for it anywhere in the client. Whatever the server does not write
// is a state the account simply never has.
// Field names/shapes mirror MFG.GameData/MusicGachaInfo.cs + MusicGachaGameData.cs
// (JsonUtility PascalCase; MusicGachaInfos keyed by GachaID == gacha series id).
export interface MusicGachaInfo {
  GachaID: number;
  IsComplete: boolean;
  PossessionCount: number;
  GachaSupplyCount: number;
  PossessionItemOIDs: string[];
}

export function musicGachaSeedState(owned?: Map<number, string[]> | null): string {
  const infos: MusicGachaInfo[] = [];
  for (const [series, pool] of MUSIC_GACHA_POOL) {
    // OIDs are stored with the pool's own spelling: the client feeds
    // PossessionItemOIDs straight into ItemUtility.AddItem / ItemName /
    // ItemIconGraphicPath (MusicGachaGameData.cs:40-49), so the canonical
    // capitalisation has to survive.
    const byUpper = new Map<string, string>();
    for (const o of pool) byUpper.set(String(o).toUpperCase(), String(o));
    const have: string[] = [];
    const seen = new Set<string>();
    const fromLedger = owned ? (owned.get(series) || []) : [];
    for (const raw of fromLedger) {
      const key = String(raw || "").trim().toUpperCase();
      const canonical = byUpper.get(key);
      if (!canonical || seen.has(key)) continue;
      seen.add(key);
      have.push(canonical);
    }
    infos.push({
      GachaID: series,
      IsComplete: have.length >= pool.length,
      PossessionCount: have.length,
      GachaSupplyCount: pool.length,
      PossessionItemOIDs: have,
    });
  }
  return JSON.stringify({ DataVersion: 1, MusicGachaInfos: infos });
}

export let _musicReqSeq = 1000;
export function incMusicReqSeq(): number {
  _musicReqSeq += 1;
  return _musicReqSeq;
}

// event taku (GameEventType flags)
// Flag names here are the client's own: EventTakuMaster.CurrentFlagType
// (MFG.MasterGameData/EventTakuMaster.cs) is what the event tables are gated on -
// EventTakuGameData.AvailableModeGameDatasWithGuest filters on IsActive(FlagType)
// (:138) and GameEventStatus.ToGameEventType resolves a match's event through
// Master.ConstancyFlagType / FlagType (GameEventStatus.cs:27-41). A flag the master
// does not use switches nothing on, however active the server declares it.
export const EVENT_TAKU_PANEL_SLOTS = 3;
export const EVENT_TAKU_PANELS: Record<string, number> = {
  BlowAwaySanma: 1,
  FireReach2: 1,
  AotenjoEvent3: 1,
  ComebackTakuEvent2: 1,
  KirisameTakuEvent: 1,
  ReversalTakuEvent: 1,
  MeldBonusTakuEvent2: 2,
  BombTakuEvent: 2,
  AllGreenTaku: 2,
  AtomicTaku: 2,
  Competition6: 0,
  Competition7: 0,
  Competition8: 0,
  Competition9: 0,
};

export const EVENT_TAKU_SETS: Record<string, string[]> = {
  off: [],
  min: ["FireReach2", "ComebackTakuEvent2", "KirisameTakuEvent"],
  all: [
    "BlowAwaySanma", "FireReach2", "Competition7", "Competition8",
    "AotenjoEvent3", "ComebackTakuEvent2", "KirisameTakuEvent",
    "MeldBonusTakuEvent2", "Competition6", "ReversalTakuEvent",
    "BombTakuEvent", "AllGreenTaku", "AtomicTaku", "Competition9",
  ],
};

export function eventTakuSetName(): string {
  let name = "min";
  try {
    // @ts-ignore
    const v = U.GetConfig("VFG_EVENT_TAKU");
    if (v) name = String(v).trim().toLowerCase();
    else {
      // @ts-ignore
      const ev = process.env.VFG_EVENT_TAKU;
      if (ev) name = ev.trim().toLowerCase();
    }
  } catch {
    try {
      // @ts-ignore
      const ev = process.env.VFG_EVENT_TAKU;
      if (ev) name = ev.trim().toLowerCase();
    } catch { }
  }
  if (!(name in EVENT_TAKU_SETS)) name = "min";
  return name;
}

export function eventTakuFlags(): string[] {
  return EVENT_TAKU_SETS[eventTakuSetName()] || [];
}

export const BASE_EVENTS: Array<[string, string]> = [
  ["PrivateMatchingDisplay", ""],
  ["PrivateMatchingEnable", ""],
  ["PrivateMatchingNotice", ""],
  ["SpiritGymBonusEvent", "OID=OID_DOJO_BONUS_3X"],
  ["ConstancyFireReach", ""],
  ["ConstancyFireReachAppearance", ""],
  ["ConstancyAccelDora", ""],
  ["ConstancyAccelDoraSchedule", ""],
  ["ConstancyMentanpin", ""],
  ["ConstancyMentanpinSchedule", ""],
  ["StickerEditNotice", ""],
  ["DecorationSticker", ""],
  ["ChaosUsable", ""],
  ["ChaosAppearance", ""],
  ["ClearProCpuEvent", ""],
  ["IyoProCpuEvent", ""],
  ["ClearAppearance", ""],
  ["IyoAppearance", ""],
  ["GrimAroeAppearance", ""],
  ["CocoaAppearance", ""],
  ["DiaAppearance", ""],
  ["DoubrielAppearance", ""],
  ["IppatsuAppearance", ""],
  ["ShiroeAppearance", ""],
  ["ShioriAppearance", ""],
  ["PineAppearance", ""],
  ["ZoudaiAppearance", ""],
  ["CinderellaMitsubaAppearance", ""],
  ["JunAppearance", ""],
  ["ToukaAppearance", ""],
  ["PremiumStartEnable", ""],
  ["RevengeContinueEnable", ""],
  // Odekake (friend character borrow). The old note said a borrow cannot be given
  // back mid-session; the assembly says otherwise: the result screen releases it
  // (ResultFlow.cs:219 -> PlayerGameData.OdekakeInit, PlayerGameData.cs:360-369) and so
  // does the next load of player_game (GameDataManager.cs:321-325 -> UpdateCostume).
  // Without this flag the client never shows the My Room Friend page at all
  // (MyRoomMainWindow.cs:102, GameDataManager.IsOdekakeEnable at :960-963), while the
  // server still published borrowable friends in friend_game.
  ["EnableOdekake", ""],
  ["ItemGainLogEnable", ""],
  // Fan / likability bonus events carry their multiplier IN THE PARAM. The client
  // reads GameDataManager.cs:561 ParamValue("FanRatio", 0f) ?? 1f and :579
  // ParamValue("FavoRatio", 0f) ?? 1f, and the `?? 1f` fallback can never fire:
  // GameEventStatus.cs:53-73 seeds one row per GameEventType before the served
  // list overwrites it, so GetGameEventData always returns a row, and
  // GameEventData.cs:110-114 leaves _params empty for param "". The ratio is then
  // the ParamValue default 0f, which the result screens apply as a multiplier:
  // ResultFlowFan.cs:158 Round(0*add)-add = -add, :163/:172 instantiate
  // disp+bonus = 0 fan objects, :219 lands gained fans on 0 while :203-204 still
  // shows a "0" bonus banner; ResultFlowLikability.cs:116 bonusExp = -getExp and
  // :132 tweens the gained EXP to 0. 2 is the client's own bonus multiplier
  // (GameDataManager.cs:559/577 premium mode returns 2f, the banner prints the
  // ratio verbatim); kept an integer so the SingleConverter in
  // GameEventData.cs:54-61 parses it under any client locale. Override with
  // VFG_EVENTS_ACTIVE="FanBonusEvent=FanRatio=1.5".
  ["FavoBonusEvent", "FavoRatio=2"],
  ["FanBonusEvent", "FanRatio=2"],
  ["ReachSongVoiceGacha", ""],
];

// Costumes: every costume with UnlockEventType=CostumeAdditionN is hidden in
// My Room unless that event is active (IsDispEnable/IsUnlocked). Enable the
// whole range (1-77 per GameEventType) so all costumes in the client master
// can appear; unlocking itself still costs fight spirits (client-side).
function costumeAdditionEvents(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 1; i <= 77; i++) out.push([`CostumeAddition${i}`, ""]);
  return out;
}

export const ACTIVE_EVENTS: Array<[string, string]> = (() => {
  const flags = eventTakuFlags();
  const extra: Array<[string, string]> = flags.map(f => [f, ""]);
  return [...BASE_EVENTS, ...costumeAdditionEvents(), ...extra];
})();

// Event schedule (appli_info info_data "events", GameEventStatus.ApliInfoKindName).
// The rows are keyed by NAME: GameEventData.OnAfterDeserialize runs
// Enum.TryParse<GameEventType>(name) and throws the whole row away when the name is
// not a member (GameEventData.cs:76-85), and GameEventStatus seeds one inactive
// entry per GameEventType before overwriting it from the list (:69-77). A kind this
// server never names is a kind it never schedules, so every GameEventType name is
// emitted: active for what the server runs, inactive with the same far window for
// the rest. data/event_kinds.json is the client's own enumeration, regenerated out
// of GameEventType.cs by scripts/gen_event_kinds.py.
// VFG_EVENTS_ACTIVE="Competition9,Bomb=Rank=2" switches kinds on ("all" = every
// kind); VFG_EVENTS_OFF switches them back off. A begin/end pair in the data file
// overrides the schedule window for these rows.
export const EVENT_BEGIN = "2020/01/01 00:00:00";
export const EVENT_END = "2099/12/31 23:59:59";

const EVENT_DATA: any = loadPluginDataJson("event_kinds.json", { kinds: [] });

export function activeEventParams(): Map<string, string> {
  const on = new Map<string, string>();
  for (const [name, param] of ACTIVE_EVENTS) on.set(name, param);
  for (const entry of configList("VFG_EVENTS_ACTIVE")) {
    if (entry.toLowerCase() === "all") continue;
    const i = entry.indexOf("=");
    const name = (i >= 0 ? entry.slice(0, i) : entry).trim();
    const param = i >= 0 ? entry.slice(i + 1) : "";
    if (name) on.set(name, param);
  }
  return on;
}

export function eventKindNames(): string[] {
  const kinds = Array.isArray(EVENT_DATA?.kinds) ? EVENT_DATA.kinds.map(String) : [];
  if (kinds.length) return kinds;
  return [...activeEventParams().keys()];
}

// Event kinds whose param IS a multiplier the client defaults to 0: an active row
// without its key is not "no bonus", it is ratio 0 and the result screens subtract
// the whole gain (see the FanBonusEvent/FavoBonusEvent note in BASE_EVENTS).
const RATIO_EVENT_KEYS: Record<string, string> = {
  FanBonusEvent: "FanRatio",   // GameDataManager.cs:561
  FavoBonusEvent: "FavoRatio", // GameDataManager.cs:579
};
const RATIO_EVENT_DEFAULT = 2;  // GameDataManager.cs:559/577: the client's bonus is 2x
const RATIO_EVENT_NEUTRAL = 1;  // a configured ratio the client cannot use must not penalize

// param is "key=value,key=value": GameEventData.cs:113 splits on "," and then on
// "=", and a token with no "=" throws inside OnAfterDeserialize (Split("=")[1] is
// out of range), which kills the whole events payload, so every token served has to
// be a pair. A bare name in VFG_EVENTS_ACTIVE ("FanBonusEvent") is a legal way to
// switch a kind on and lands an empty param here - exactly the shape that turns the
// event into a penalty - so the ratio key is filled in here as well.
function normalizeEventParam(name: string, param: string): string {
  const tokens = String(param || "").split(",").map(s => s.trim()).filter(s => s.indexOf("=") > 0);
  const key = Object.prototype.hasOwnProperty.call(RATIO_EVENT_KEYS, name) ? RATIO_EVENT_KEYS[name] : "";
  if (!key) return tokens.join(",");
  const hit = tokens.find(t => t.split("=")[0] === key);
  const value = hit ? Number(hit.slice(key.length + 1)) : NaN;
  const use = hit ? (Number.isFinite(value) && value >= 1 ? String(value) : String(RATIO_EVENT_NEUTRAL))
    : String(RATIO_EVENT_DEFAULT);
  return tokens.filter(t => t.split("=")[0] !== key).concat(`${key}=${use}`).join(",");
}

export function eventsJson(): string {
  const on = activeEventParams();
  const wanted = configList("VFG_EVENTS_ACTIVE");
  const forcedAll = wanted.length === 1 && wanted[0].toLowerCase() === "all";
  const off = new Set(configList("VFG_EVENTS_OFF").map(s => s.toLowerCase()));
  const begin = EVENT_DATA?.begin || EVENT_BEGIN;
  const end = EVENT_DATA?.end || EVENT_END;
  const rows = eventKindNames().map(name => {
    const isActive = (forcedAll || on.has(name)) && !off.has(name.toLowerCase());
    return { name, active: isActive, begin, end, param: isActive ? normalizeEventParam(name, on.get(name) || "") : "" };
  });
  return JSON.stringify({ list: rows });
}

export function proStatsJson(): string {
  return JSON.stringify({ now_pro_stats: false, ProStayDatas: [] });
}

// misc helpers
export function gameBaseUrl(info?: any): string {
  // dynamic host from request if available
  let host = HOST;
  let port = PORT;
  try {
    if (info && (info as any).host) host = String((info as any).host);
    else if (U && U.GetConfig) {
      const h = U.GetConfig("server_host");
      if (h) host = String(h);
    }
  } catch { }
  try {
    if (info && (info as any).port) port = Number((info as any).port);
    else if (CONFIG && CONFIG.port) port = Number(CONFIG.port);
    else if (U && U.GetConfig) {
      const p = U.GetConfig("port");
      if (p) port = Number(p);
    }
  } catch { }
  // Also try to infer from host header if info has it (fallback)
  try {
    if (info && (info as any).hostHeader) {
      const hh = String((info as any).hostHeader);
      if (hh.includes(':')) {
        const pp = hh.split(':').pop();
        if (pp && /^\d+$/.test(pp)) port = Number(pp);
      }
    }
  } catch { }
  return `http://${host}:${port}/aog`;
}

export function eamuseWrap(module: string, inner: string, status: string = "0"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<response><${module} status="${status}">${inner}</${module}></response>`;
}

// dojo constants (also exported for aog)
export const DOJO_SLOTS = 4;
export const DOJO_STOCK_MAX = 3;
export const DOJO_LESSON_SECONDS = 300;
