// @ts-ignore
declare const R: any;
// @ts-ignore
declare const U: any;
// @ts-ignore
declare const CONFIG: any;
// @ts-ignore
declare const console: any;
declare const require: any;
declare const Buffer: any;

import { registerEamuseRoutes } from "./handlers/eamuse";
import { registerAogRoutes, AOG_HANDLER_MAP, extractAogName, handleAogUnhandled, aogAnswered, aogEmptySuccess } from "./handlers/aog";
import { vlog, quarantinePhantomProfiles, accountAuthPolicy, accountAuthDefaults, xml_error, SERV_ST_STATE_INVALID } from "./handlers/utils";

export function register(): void {
  R.GameCode("VFG");
  R.Contributor("Ryu7w7");

  try {
    R.Config("VFG_EVENT_TAKU", {
      name: "Event Taku Set",
      desc: "VFG_EVENT_TAKU picks event table set: min (default, 3 panels), off (no event tables), all (14 panels - will break UI). Flag names are the client's EventTakuMaster.CurrentFlagType names.",
      type: "string",
      options: ["min", "off", "all"],
      default: "min",
    });
  } catch {}
  try {
    R.Config("VFG_MISSION_ACTIVE", {
      name: "Active Mission Categories",
      desc: "Comma-separated MFG.Types.Mission.Category names to force active (e.g. Competition9,Bomb). all = every category, none = none. Empty (default) follows data/mission_categories.json: the client's whole 103-category list with JudgmentDaily / JudgmentWeekly / Player / Character / Weekly / Yaku / StartDash active.",
      type: "string",
      default: "",
    });
  } catch {}
  try {
    R.Config("VFG_EVENTS_ACTIVE", {
      name: "Active Event Kinds",
      desc: "Comma-separated GameEventType names to switch on beyond the built-in set, optional =param after the name (e.g. Competition9,Bomb=Rank=2). all = every kind in data/event_kinds.json. Empty (default) keeps the schedule the plugin runs. A bonus ratio event takes its key (FanBonusEvent=FanRatio=1.5): naming it bare keeps the plugin's 2x, because an active row with no FanRatio/FavoRatio reads as ratio 0 in the client (GameDataManager.cs:561/579) and the result screens subtract the whole gain.",
      type: "string",
      default: "",
    });
  } catch {}
  try {
    R.Config("VFG_EVENTS_OFF", {
      name: "Inactive Event Kinds",
      desc: "Comma-separated GameEventType names to switch off, winning over VFG_EVENTS_ACTIVE and the built-in set (e.g. CostumeAddition12).",
      type: "string",
      default: "",
    });
  } catch {}
  try {
    R.Config("VFG_TABOO_EXTRA", {
      name: "Extra Taboo Words",
      desc: "Comma-separated words appended to data/taboowords.json for /chk_tabooword name screening and table stamps. Case-insensitive; an entry of 4 characters or fewer counts only as a whole word, a longer one as a substring.",
      type: "string",
      default: "",
    });
  } catch {}
  try {
    R.Config("VFG_SCRAMBLE_SCHOOL", {
      name: "Scramble Festival School",
      desc: "SchoolID name (School001..School010) this server runs scramble matches for. Empty (default) runs none: entry_game with teammatch>0 then stays an ordinary match and every g2_scramble record stays empty.",
      type: "string",
      default: "",
    });
  } catch {}
  try {
    R.Config("VFG_DISCORD_WEBHOOK", {
      name: "Discord Webhook URL",
      desc: "If provided, announces new matchmaking lobbies to this Discord webhook.",
      type: "string",
      default: "",
    });
  } catch {}
  try {
    R.Config("VFG_GACHA_ALL", {
      name: "Advertise All Gacha Series",
      desc: "If enabled, advertise every gacha series in catalog instead of curated set",
      type: "boolean",
      default: false,
    });
  } catch {}
  try {
    R.Config("VFG_CARDMNG_MODE", {
      name: "CardMNG Mode",
      desc: "compat (default) recovers malformed cardid, strict quarantines",
      type: "string",
      options: ["compat", "strict"],
      default: "compat",
    });
  } catch {}
  try {
    R.Config("mfg_service_url", {
      name: "MFG Service URL (AOG)",
      desc: "Override AOG URL returned by vfgac.service_list. Default: http://<host>:22421/ (separate port). Set to http://<host>:<port>/aog for integrated.",
      type: "string",
      default: "",
    });
  } catch {}
  try {
    R.Config("mfg_http_port", {
      name: "MFG HTTP Port (native)",
      desc: "Port for separate AOG HTTP server (when mfg_service_url is empty). Default 22421.",
      type: "integer",
      default: 22421,
    });
  } catch {}
  try {
    R.Config("mfg_http_bind", {
      name: "MFG HTTP Bind (native)",
      desc: "Bind address for the separate AOG HTTP server. Default 127.0.0.1 (loopback; the old 0.0.0.0 native-client behaviour must be asked for explicitly). On a hosted deployment the browser plays through the web front + core integrated AOG, and an unauthenticated AOG listener on a public interface is exactly what the hosting plan (docs/28) locks down.",
      type: "string",
      default: "127.0.0.1",
      needRestart: true,
    });
  } catch {}
  try {
    R.Config("VFG_VERBOSE", {
      name: "Verbose Logging",
      desc: "If enabled, per-request/per-player debug logs go to console. OFF by default to avoid spam with many players. Errors always show.",
      type: "boolean",
      default: false,
    });
  } catch {}
  try {
    R.Config("VFG_HIDE_GACHA", {
      name: "Hide Gacha Series",
      desc: "Comma-separated gacha series IDs to hide (e.g. 152 to hide UnlockJun). Empty by default.",
      type: "string",
      default: "",
    });
  } catch {}
  try {
    R.Config("VFG_GACHA_SAFE", {
      name: "Safe Gacha Pool (freeze bisection)",
      desc: "If enabled, gacha rolls only Chara01-09 items to isolate freezes caused by newer-chara assets. Temporary diagnostic.",
      type: "boolean",
      default: false,
    });
  } catch {}
  try {
    R.Config("VFG_GACHA_CHARAS", {
      name: "Gacha Chara Filter (freeze bisection)",
      desc: "Comma-separated chara numbers to roll (e.g. 10,11,12). Empty = all. Bisect halves (10-15, 16-21, then thirds) to isolate the freeze-causing asset.",
      type: "string",
      default: "",
    });
  } catch {}
  try {
    R.Config("VFG_GACHA_EXCLUDE", {
      name: "Gacha OID Exclude (freeze bisection)",
      desc: "Comma-separated OIDs to never roll (e.g. OID_20NakiA01,OID_20NakiA02). Empty = none. Use once the suspect items are isolated.",
      type: "string",
      default: "",
    });
  } catch {}

  // Account boundary (handlers/utils.ts accountAuthPolicy / loginGate). Registered
  // here, not just read in the handler, so the three knobs exist in the core's
  // config map: they land in config.ini [mfg@asphyxia] with their defaults, show up
  // in the WebUI config editor, and are staged into every verification lane by
  // scripts/ryunet_stage.ps1 (it copies the canonical config.ini plus the whole
  // plugin tree, data/*.json included). Each default is the number
  // data/account-auth.json declares, so the value an operator sees in the config is
  // the value the data file states instead of a second copy in this source.
  const acctDefaults = (() => {
    try { return accountAuthDefaults(); } catch { return { mode: "card", card_window: 900, takeover_grace: 0 }; }
  })();
  try {
    R.Config("VFG_ACCOUNT_AUTH", {
      name: "Account Auth Mode",
      desc: `card (default): /login and create_player need something this server can check - for a card-bound account (profile.card_id, written by the e-Amusement card flow) the card presentation inside VFG_CARD_AUTH_WINDOW; for a card-less account only the session takeover rule below. off: the old open behaviour, any refid may log in over anyone and rename any account - a deployment has to write that here to get it. The default comes from data/account-auth.json mode.`,
      type: "string",
      options: ["card", "off"],
      default: acctDefaults.mode,
      needRestart: true,
    });
  } catch {}
  try {
    R.Config("VFG_CARD_AUTH_WINDOW", {
      name: "Card Credential Window (seconds)",
      desc: `How long one card presentation (cardmng.inquire / cardmng.getrefid carrying a canonical 16-hex cardid) authorises a login on the account that card is bound to. One scan authorises exactly one login (the stamp is spent by it), so this is a validity window and not a token. Default ${acctDefaults.card_window} s (one arcade play session), from data/account-auth.json card_auth_window_seconds.`,
      type: "integer",
      range: [1, 86400],
      default: acctDefaults.card_window,
      needRestart: true,
    });
  } catch {}
  try {
    R.Config("VFG_SESSION_TAKEOVER_GRACE", {
      name: "Session Takeover Grace (seconds)",
      desc: `Card-less accounts - every account on a bearer-refid deployment (the WebGL lanes log in with a fixed dataid, no card flow runs, so no account carries profile.card_id): a /login for the same refid may replace a live session only after that session has been idle this many seconds, or after the holder logged out (/logout retires it). ${acctDefaults.takeover_grace} (default, from data/account-auth.json takeover_grace_seconds) is what lets a lane relaunched after being killed back in; 0 disables the idle rule (takeover on sight). Card-bound accounts get no idle fallback - their credential is required.`,
      type: "integer",
      range: [0, 86400],
      default: acctDefaults.takeover_grace,
      needRestart: true,
    });
  } catch {}
  try {
    R.Config("VFG_PRESENTER_SECRET", {
      name: "Web Presenter Secret",
      desc: `Shared secret between this server and a web front hosting the browser lane (AOG route /vfgcard_present, docs/28). The front - which verified the account's web session - presents the account's own DataID as its card credential: first call binds the credential (profile.card_id, like a card scan would), every call stamps the presentation the next /login must answer with. Only a canonical 16-hex id equal to the account's own DataID is ever bound, so the secret arms nothing it does not already control. Empty (default): the route answers nothing, no account gets bound, the deployment stays on the bearer/takeover rule.`,
      type: "string",
      default: "",
      needRestart: true,
    });
  } catch {}

  registerEamuseRoutes();
  registerAogRoutes();

  // Say the account rule out loud at boot, with where each number came from.
  // What this plugin used to do instead: the gate ran on literals in the source
  // while config.ini named nothing, so the deployment could not see - let alone
  // tune - the rule that decides who may take an account over. On a bearer-refid
  // deployment no account carries profile.card_id until the e-Amusement card flow
  // binds one, so the credential branch is dormant here and the takeover grace is
  // the live rule (README.md, "Account boundary and trust model").
  try {
    const pol = accountAuthPolicy();
    console.log(
      `[VFG] account boundary: mode=${pol.mode} [${pol.source.mode}]` +
      ` card_window=${pol.card_window}s [${pol.source.card_window}]` +
      ` session_takeover_grace=${pol.takeover_grace}s [${pol.source.takeover_grace}]`,
    );
    console.log(
      "[VFG] account boundary knobs: VFG_ACCOUNT_AUTH / VFG_CARD_AUTH_WINDOW / VFG_SESSION_TAKEOVER_GRACE" +
      " in config.ini [mfg@asphyxia], or the same names in the environment, else data/account-auth.json." +
      " The credential a card-bound account answers with is a card presentation on its own profile" +
      " (profile.card_id + profile.card_auth), written only by the e-Amusement card flow: nothing is" +
      " invented for a card-less account, and until a card binds one the takeover grace is the rule" +
      " this server runs on.",
    );
  } catch {}

  // Repair what the removed mid fallback left in the savedata. The shape refusal in
  // handlers/utils.ts keeps a legacy MID phantom from resolving as an account, but
  // the documents it minted are still rows in the plugin DB carrying a player_id a
  // mid lookup can hit, a session_id a pcuid can hit and a card binding the card
  // flow can follow. The pass strips those fields and marks the row
  // (quarantinePhantomProfiles), so the orphans are dead data, not identities that
  // only the code refuses. Fire-and-forget on purpose: the refusals stand on their
  // own, so no request waits on this pass, and idempotent, so a lane with an empty
  // savedata - or the same savedata on the next boot - does nothing.
  //
  // A boot is not allowed to be the only chance to repair a savedata: a core that
  // runs for weeks is exactly the deployment the phantoms are sitting in. The same
  // update also fires from the read path (handlers/utils.ts _repairPhantomOnTouch /
  // _repairPhantomByRefid), so a running server cleans the rows it touches. For a
  // savedata nobody has booted from, README.md ("Legacy MID phantom documents")
  // gives the offline pass that repairs the file directly, with no core restart.
  try {
    // Boot-time race guard: this pass fires while the core is still lazily opening
    // the plugin DB (a concurrent first Find logs "[core] error: DB.Find unexpected
    // error" and returns nothing). One lost scan is not a failure of the refusals -
    // but it leaves rows unquarantined and leaves no evidence. Retry a few times,
    // and always log the pass outcome so a clean savedata is a logged fact, not an
    // absence of output.
    const _phantomAttempt = (attempt: number): void => {
      quarantinePhantomProfiles()
        .then((r) => {
          vlog(`[VFG] phantom quarantine pass attempt=${attempt}: scanned=${r.scanned} quarantined=${r.quarantined} already-repaired=${r.already}`);
          if (r.scanned === 0 && attempt < 4) setTimeout(() => _phantomAttempt(attempt + 1), 3000);
        })
        .catch((e: any) => {
          try { vlog(`[VFG] phantom quarantine pass failed attempt=${attempt}: ${e && e.message ? e.message : e}`); } catch { }
          if (attempt < 4) setTimeout(() => _phantomAttempt(attempt + 1), 3000);
        });
    };
    _phantomAttempt(1);
  } catch { }

  // Start separate native HTTP server on 22421 (like old mfg@asphyxia_bk) for AOG
  try {
    const http = require('http');
    // Resolve port/bind AT LISTEN TIME (review round 2 major #7): at module load
    // GetConfig may still answer the registered default, which silently made the
    // config.ini knobs inert. Precedence: environment, then config.ini, then default.
    // U.GetConfig resolves config.ini against the process cwd, so a core started
    // from any other directory silently loses every knob (review round 2 major #8).
    // This fallback reads the ini next to the dist tree itself - cwd-independent.
    const directKnob = (name: string): string => {
      try {
        const fs = require('fs'), nodePath = require('path');
        const p = nodePath.resolve(__dirname, '..', '..', 'config.ini');
        if (fs.existsSync(p)) {
          const m = fs.readFileSync(p, 'utf8').match(new RegExp('^\\s*' + name + '\\s*=\\s*([^\\r\\n;]+)', 'm'));
          if (m && m[1].trim()) return m[1].trim();
        }
      } catch {}
      return '';
    };
    const resolveHttpPort = (): number => {
      try { const e = process.env['mfg_http_port']; if (e && Number(e) > 0) return Number(e); } catch {}
      try { const v = U.GetConfig('mfg_http_port'); if (v && Number(v) > 0) return Number(v); } catch {}
      const d = directKnob('mfg_http_port'); if (d && Number(d) > 0) return Number(d);
      return 22421;
    };
    const resolveHttpBind = (): string => {
      try { const e = process.env['mfg_http_bind']; if (e) return e; } catch {}
      try { const v = U.GetConfig('mfg_http_bind'); if (v && String(v).trim()) return String(v).trim(); } catch {}
      const d = directKnob('mfg_http_bind'); if (d) return d;
      // Default is loopback: a knob lost by a wrong cwd must never widen the
      // bind to every interface (docs/28 hosting posture).
      return '127.0.0.1';
    };

    function parseFormNative(body: string): Record<string,string> {
      const out: Record<string,string> = {};
      try {
        const p = new URLSearchParams(body);
        for (const [k,v] of p.entries()) out[k]=v;
      } catch {}
      return out;
    }
    function gameApiNameNative(path: string): string {
      // Same rule as the integrated port (handlers/aog.ts extractAogName): the
      // core's last-segment extraction loses mid-path endpoint names and turns
      // a trailing slash into an empty name.
      return extractAogName(path);
    }
    // Wrap to match AOG handler signature (form, ctx) where ctx.res is http.ServerResponse with .set and .send
    function adaptRes(nativeRes: any): any {
      const wrapper: any = {
        sent: false,
        set: (k: string, v: string) => { try { nativeRes.setHeader(k, v); } catch {} },
        send: (body: string) => {
          if (wrapper.sent) return;   // one answer per request
          wrapper.sent = true;
          try {
            if (!nativeRes.headersSent) nativeRes.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
            nativeRes.end(body);
          } catch {}
        },
      };
      return wrapper;
    }

    // Same bound as the core's AOG middleware (src/middlewares/AogMiddleware.ts):
    // this server has no body parser in front of it either, so an unbounded
    // accumulator lets one client pin as much memory as it can send.
    const MAX_NATIVE_BODY_BYTES = 1 * 1024 * 1024;

    function rejectNativeBody(req: any, res: any, why: string): void {
      try { vlog(`[VFG-NATIVE] ${req.url} rejected: ${why} (limit ${MAX_NATIVE_BODY_BYTES} bytes)`); } catch {}
      try {
        if (!res.headersSent && !res.writableEnded) {
          res.writeHead(413, { 'Content-Type': 'text/xml; charset=utf-8' });
          res.end(xml_error(SERV_ST_STATE_INVALID));
        }
      } catch {}
      // Drain what the client keeps sending rather than buffering it; destroying the
      // socket here can eat the answer just written.
      try { req.resume(); } catch {}
    }

    const server = http.createServer((req: any, res: any) => {
      // Reject a declared body that cannot fit the cap before reading it at all.
      const declared = Number(req.headers['content-length']);
      if (Number.isFinite(declared) && declared > MAX_NATIVE_BODY_BYTES) {
        rejectNativeBody(req, res, 'declared body over limit');
        return;
      }
      let body = '';
      let total = 0;
      let settled = false; // end / error / aborted / close: the first of them owns the request
      req.on('data', (chunk: any) => {
        if (settled) return;
        total += typeof chunk === 'string' ? Buffer.byteLength(chunk, 'utf8') : chunk.length;
        if (total > MAX_NATIVE_BODY_BYTES) {
          settled = true;
          body = ''; // the oversized body is worthless the moment it is found
          rejectNativeBody(req, res, 'body over limit');
          return;
        }
        body += chunk.toString();
      });
      const dropNative = (why: string) => {
        if (settled) return;
        settled = true;
        body = ''; // a half-sent body must not stay reachable behind dead listeners
        try { vlog(`[VFG-NATIVE] ${req.url} dropped (${why}, ${total} bytes buffered) — client gone, no response`); } catch {}
      };
      // A client that disappears mid-body fires 'aborted'/'close' (and sometimes
      // 'error') and never 'end': with only 'data'/'end' registered the request was
      // never answered, never logged, and its bytes stayed referenced.
      req.on('error', (e: any) => dropNative(`request error ${e && e.code ? e.code : e}`));
      req.on('aborted', () => dropNative('client aborted mid-body'));
      req.on('close', () => { if (!req.complete) dropNative('socket closed before the body ended'); });
      req.on('end', async () => {
        if (settled) return;
        settled = true;
        const url = (req.url || '/').split('?')[0];
        const clean = url.replace(/\/\//g, '/');
        const params = parseFormNative(body);
        body = ''; // the parsed form is all that is needed from here on
        try {
          const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
          for (const [k,v] of u.searchParams.entries()) if (!(k in params)) params[k]=v;
        } catch {}
        const name = gameApiNameNative(clean);
        const ctx = { req, res: adaptRes(res), form: params, name, url: clean };
        try { vlog(`[VFG-NATIVE] ${req.method} ${clean} name=${name} keys=${Object.keys(params).join(',')}`); } catch {}
        try {
          const handler: any = Object.prototype.hasOwnProperty.call(AOG_HANDLER_MAP, name)
            ? (AOG_HANDLER_MAP as any)[name]
            : null; // never an inherited Object member (`/gget/constructor` is not a route)
          if (handler) {
            // One handler per request. The old fall-through looked the same name
            // up in the core registry after the first execution threw, running
            // the handler a second time with its side effects repeated.
            try { await handler(params, ctx); }
            catch (e) { try { console.error(`[VFG-NATIVE] handler error ${name}: ${e}`); } catch {} }
          } else {
            // Not ours: answer from the core registry once, else through the
            // same unhandled fallback the integrated port uses.
            let regHandler: any = null;
            try { regHandler = require('../../src/aog/AogRegistry').getAogHandler(name); } catch {}
            if (!regHandler) { try { regHandler = require('../../../src/aog/AogRegistry').getAogHandler(name); } catch {} }
            if (regHandler) {
              try { await regHandler(params, ctx); }
              catch (e) { try { console.error(`[VFG-NATIVE] registry handler error ${name}: ${e}`); } catch {} }
            } else {
              await handleAogUnhandled(params, ctx);
            }
          }
        } catch (e) {
          try { console.error(`[VFG-NATIVE] request failed ${clean}: ${e}`); } catch {}
        }
        // Always answer: an unhandled name gets the empty-success XML instead of
        // a socket the client waits on until it gives up.
        if (!aogAnswered(ctx.res)) {
          try { vlog(`[VFG-NATIVE] ${clean} name=${name || 'unknown'} unanswered -> empty success`); } catch {}
          try { ctx.res.send(aogEmptySuccess()); } catch {}
        }
      });
    });
    // Short deferral so plugin config (config.ini) is populated before resolution.
    setTimeout(() => {
      const HTTP_PORT = resolveHttpPort();
      const HTTP_BIND = resolveHttpBind();
      server.listen(HTTP_PORT, HTTP_BIND, () => {
        console.log(`[VFG] Native AOG HTTP Server listening on ${HTTP_BIND}:${HTTP_PORT} (for service_url http://<host>:${HTTP_PORT}/)`);
      });
      server.on('error', (err: any) => {
        if (err && err.code === 'EADDRINUSE') console.log(`[VFG] Native HTTP port ${HTTP_PORT} in use`);
        else console.log(`[VFG] Native HTTP error: ${err}`);
      });
    }, 150);
  } catch (e) {
    console.log(`[VFG] Failed to start native HTTP server: ${e}`);
  }

  R.Unhandled(async (info: any, data: any, send: any) => {
    const mod = info.module || "unknown";
    const meth = info.method || "unknown";
    if (["eventlog", "posevent", "pkglist", "netlog", "sidmgr"].includes(mod)) return;
    vlog(`[VFG] Unhandled XRPC ${mod}.${meth} model=${info.model}`);
    try { await send.success(); } catch {}
  });

  // The AOG fallback is registered in registerAogRoutes (handlers/aog.ts): it is
  // the one place that knows the core's calling convention, recovers the
  // endpoint name from the URL and always answers.
}
