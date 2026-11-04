mfg@asphyxia
===

Server plugin for the arcade title this repo reconstructs. Supported build: 2026060900.

- Online matching (plus private passphrase matches)
- CPU opponents (instant solo tables in 2-player mode)
- Discord matching announcements
- All 23 game modes
- Event table rules (configurable set)
- Table stamps and chat
- Giving up (kiken) and disconnect takeover with reconnect
- Match results, match archive and player records
- Gacha (all series through the latest version)
- Spirit Gym (dojo)
- Mission campaigns
- Match history
- Leaderboard (WebUI)
- Persistent profiles and card support

Implemented server-side: match records and kifu replays (`player_record` / `get_haifu_list` /
`get_haifu_data`), the friend list built from lenders this server can actually lend and the
`odekake` borrow that backs those rows, notices and their read state, the mission and event
schedules, name and table-stamp screening.

Not implemented: block lists, competitions (`competition_entry` answers "not entered" and
`competition_game` is an empty record), MG / jongstone economy, pro opponents, a dated content
calendar.

## Hosted lane (2026-11)

The public deployment: a WebFront gate (repo `webfront/`, behind a Cloudflare tunnel) fronts the core WebUI signup/login (bcrypt sessions; usernames case-insensitive - lowercased at signup and on lookup) and holds everything behind one access code. The gate validates `connect.sid` against core `GET /api/me`, pins each session's own DataID into the play page (`-REGULAR -DATAID=...`), and relays the WebGL client's xrpc traffic as plain HTTP under `/aog`. On a relayed login the gate presents that session's own DataID to this plugin through `vfgcard_present`, guarded by a shared `VFG_PRESENTER_SECRET`; a `profile.card_id` binding lands only for ids that carry a core card document (signup mints one per account). The gacha shop sells 1-pull and 5-pull; the draw handler clamps play_count to that range and always delivers exactly the requested number of items. The native listener takes `mfg_http_bind` (hosted posture: 127.0.0.1). Delivery matrix: repo docs/28; open defects incl. the anonymous profile-page relay: repo docs/29.

## Content data files

Four files under `data/` are the content the server serves; the handlers read them at load time
(`handlers/utils.ts: loadPluginDataJson`).

| file | what it feeds | client contract |
| --- | --- | --- |
| `event_kinds.json` | every `GameEventType` name `appli_info kind="events"` schedules; `active` comes from the plugin's own set plus `VFG_EVENTS_ACTIVE` / `VFG_EVENTS_OFF` | `GameEventData.cs:76-85` drops a row whose name is not an enum member, so an unnamed kind can never be active. Regenerate with `scripts/gen_event_kinds.py` |
| `mission_categories.json` | `mission_date kind="missions"`, one row per `MFG.Types.Mission.Category` in enum order | `MissionData.OnAfterDeserialize` drops rows whose `category` does not parse. `VFG_MISSION_ACTIVE` switches individual categories on. `scripts/gen_mission_categories.py` |
| `notices.json` | `notice_game` plus `receive_only.ImportantNotices`, minus the ids this account has acked | `NoticeGameData.Save` is never called in the client, so the list exists only because this server wrote it; ids under `important` must be `MFG.Types.ImportantNotice.NoticeID` members |
| `taboowords.json` | `/chk_tabooword`, the name screening on `client_state_write`, and the name + sticker screening on `gchat` / `gget_stamp_info` | `ChkTabooword.cs:34-37` treats a non-zero result as "name not available". Case-insensitive. The entry screens (`/chk_tabooword`, `create_player`, `gchat`, `gget_stamp_info`) test every entry as a substring, so `カス野郎` is caught by `カス`. Only the `client_state_write` gate narrows that, and only for text the writer cannot rewrite (the echo of a stored value, a memorial-card row's item name): there an entry of 4 characters or fewer counts only as a whole word (`rape` does not fire on Grape, `カス` not on カスミ). A compound of a short entry is a list decision — list it (`カス野郎`, `cuntface`, `raped`) and the substring rule applies in both screens. `VFG_TABOO_EXTRA` appends per deployment |

An empty `taboowords.json` is logged (`chk_tabooword accepts everything`) instead of passing
quietly. Delivery reports for this content, with the checks behind each claim:
`C:\mfg\.audit\p8-content-completeness-report.md`.

## Account boundary and trust model

What a login proves, and what it does not. `Login.cs:20` posts
`web_id / area_id / user_id=<Account.DataID> / bypass_auth=true / guest` and `Login.cs:31` answers
the `session_id` that every later request carries back as `pcuid` (`ClientStateRead.cs:83`,
`ClientStateWrite.cs:22`, `Logout.cs:16`). The HTTP front carries no credential at login, so the
refid a login carries is a claim on an identity, never proof of holding one. The gate is
`handlers/utils.ts: accountAuthPolicy / loginGate / nameWriteGate`; the durable retirement of a
replaced session is `profile.evicted_sessions` (`tombstoneSessionOnProfile`), which is why a retired
pcuid stays dead across a core restart.

Two kinds of account, told apart by one field, `profile.card_id`:

- **Card-bound** (`profile.card_id` set — and it is set only by the e-Amusement card flow,
  `handlers/eamuse.ts: saveCardToProfile`, reached from `cardmng.inquire` / `cardmng.getrefid`, the
  only requests carrying a 16-hex card id). `/login` and a name write need that card to have been
  presented on this account inside `VFG_CARD_AUTH_WINDOW` and not already spent: one scan authorises
  exactly one login (`cardCredentialUsable` / `consumeCardCredential`), because a stamp left open for
  the whole window would be a bearer token for the next caller who learns the refid. An
  unauthenticated login onto a card-bound account is refused with `serv_st 770` and the holder keeps
  playing; `/login` is posted with `enableErrorScreenTransition:false` (`GameDataManager.cs:139`), so
  the refusal is the client's own re-login path and not an error screen.
- **Card-less** (no `profile.card_id`): there is nothing on the account for the server to check, so
  **cross-account isolation is out of the trust model for these accounts**. On this private
  self-host that is the intended guest model, not an oversight: bearer refid on a LAN is what the
  dev lane uses — it logs in with a fixed dataid (`MFGTESTGUEST1` under `-AUTOSERVE`,
  `AccountGameData.cs:70-74`), card + PIN exists only on the PCB/native line
  (`VFG_CARDMNG_MODE=compat`), and no card credential is invented for a guest account. Measured on
  the live savedata of this deployment: 118 profile documents, 0 carrying `card_id`
  (`tmp/p11acct/probe_accounts.cjs`), so the credential branch is dormant in that snapshot; since then the hosted lane mints a core card document per signup and binds it at login through `vfgcard_present` (see Hosted lane above), while on the LAN dev lane the rule below is
  the one actually running.

For a card-less account the live session is the only thing naming its owner, so an unauthenticated
`/login` for that refid may replace it only once the session has been idle for
`VFG_SESSION_TAKEOVER_GRACE` seconds. A lane that ended cleanly is not held up: the client's own exit
posts `/logout` (`Logout.cs:16`, sent by `GameoverFlow.cs:88` at Gameover), which retires the session
and lets the account log straight back in. Only a lane that was killed waits.

| knob | default | what it decides | read from |
| --- | --- | --- | --- |
| `VFG_ACCOUNT_AUTH` | `card` | `card` enforces the gate above; `off` restores the pre-gate open behaviour — a deployment has to write that word to get it | `config.ini [mfg@asphyxia]` → the same name in the environment → `data/account-auth.json` `mode` → the built-in default |
| `VFG_CARD_AUTH_WINDOW` | `900` | seconds one card presentation authorises one login on the account that card is bound to (900 s ≈ one arcade play session) | same chain, `card_auth_window_seconds` in the data file |
| `VFG_SESSION_TAKEOVER_GRACE` | `120` | seconds of idle a `/login` waits out to take over a card-less account's live session; `0` disables the idle rule (takeover on sight) | same chain, `takeover_grace_seconds` in the data file |

All three are registered with the core (`index.ts: R.Config`), so they sit in
`config.ini [mfg@asphyxia]` with their defaults, appear in the WebUI config editor, and are staged
into every verification lane by `scripts/ryunet_stage.ps1` (it copies the canonical `config.ini` and
the whole plugin tree, `data/*.json` included). `data/account-auth.json` carries the same three
values with the long-form note. The comment lines in `config.ini` are documentation for whoever
opens the file; a WebUI config save rewrites that file from the parsed map and drops them, the keys
themselves come back from their registered defaults.

Every boot prints the rule that is live and where each number came from:

```
[VFG] account boundary: mode=card [VFG_ACCOUNT_AUTH=card] card_window=900s [VFG_CARD_AUTH_WINDOW
 (config.ini [mfg@asphyxia], or the same name in the environment)] session_takeover_grace=120s [...]
```

and every takeover eviction is logged always, not under `VFG_VERBOSE` — the account, the credential
state, the rule that answered, how idle the replaced session was, the grace in force, when it
happened, and which pcuid died for which new one:

```
[VFG] ACCOUNT TAKEOVER refid=MFGTESTGUEST1 mid=1042 credential=none (no profile.card_id on this
 account: the bearer refid is the whole claim) rule=idle session_idle=187s takeover_grace=120s
 (VFG_SESSION_TAKEOVER_GRACE) at=2026-11-01T04:35:12.345Z retired_session=2eb9b3a1...
 granted_session=9ad8a23d... (the retired pcuid is dead on the profile document; that client must
 relogin) - card-less account, takeover allowed on the bearer refid (session idle 187s, grace 120s)
```

A refused takeover prints the same fields as `ACCOUNT REFUSED` together with the `serv_st 770` it
answered.

## Legacy MID phantom documents

The removed `saveState` fallback minted a profile document for every mid that matched no
account, keyed `'MID' + String(mid).padStart(8, '0')`. `padStart` pads and never truncates, so
the shape is MID + **at least** eight digits. This server's own accounts carry 10-digit mids
(`1793446050`, `1793447266`, `1793448448`, the `playerIdFromRefid` of their `6AE5D0A2*`
refids), so `MID1793446050` is the refid that fallback would have written for them — and this
savedata holds no document of that length. What the deployment really carries is 118 profile
documents, 3 MID-prefixed, all of them MID + exactly 8 digits (`MID00998877`, `MID88000123`,
`MID88000124`), and their payloads name this project's own audit probes (`states.audit_plain`,
`states.audit_probe1` with markers `GHOST` / `NOPCUID`): rows minted through the same path the
fork used, from 6- and 8-digit mids. The pattern width is about the **mint path**, not about a
long document somebody left behind. On a copy of that same savedata the pre-fix build answered
`login user_id=MID1793446050` with code 0 and a `session_id` and created the row on the spot,
and `ensureProfile` minted `MID1793449999` and the near-miss `MID1234567`
(`tmp/p9repro/out_deploy_pre_unseeded.txt`, sections 3a and 3); the one row the exactly-8
pattern recognised, `MID00998877`, was already refused there with 770.
`handlers/utils.ts: PHANTOM_REFID_RE = /^MID\d{8,}$/` recognises the whole family and
`MINT_FORBIDDEN_REFID_RE = /^MID\d/` is the wider mint barrier behind it. A document of that
shape is refused by every resolver (`getProfileByRefid` / `getProfileBySession` /
`getProfileByPlayerId`), written by nothing (`saveProfile` and `ensureProfile` refuse the whole
MID+digits family, so `/login` can neither adopt one nor mint a new one), and answered
`serv_st 770`.

Refusing the shape is the code half, and it is not the whole repair. Those documents are still
rows: one carries a `player_id` a mid lookup can hit, a `session_id` a pcuid can hit, a card
binding the card flow can follow. `quarantinePhantomProfiles` strips those fields and marks the
row (`profile.phantom_quarantine`, `states` kept for audit); the marker refuses the document on
its own, so a repaired row stays dead data even if something renames its refid afterwards.

Two triggers, on purpose:

- at load, once, over the whole profile collection (`index.ts`), and
- on the read path: the same update fires from `_repairPhantomOnTouch` / `_repairPhantomByRefid`
  whenever a resolver refuses a phantom, so a server that is *running* repairs the rows it
  touches instead of waiting for someone to boot it. A row is repaired at most once per process.

A savedata nobody boots from is repaired without a restart — the same `$set` / `$unset`, applied
to the SQLite file directly:

```
node .audit/p9_phantom_repair.js tmp/RyuNET-core/dist/savedata/mfg@asphyxia.db   # repair
node .audit/p9_phantom_repair.js <db> --dry-run                                  # look, write nothing
node .audit/p9_phantom_scan.js   <db>                                            # verify
```

Any path works, a copy from `.audit/p9_db_clone.js` or a lane savedata no core has opened
yet included: those files do not carry the `_collection` generated column the core's store
adds at open (`SqliteStore.ts`), so the repairer falls back to the storage space
(`__s = 'plugins_profile'`) and prints which filter it used, as `p9_phantom_scan.js` does.

`quarantined: 3` from the scan is the pass having happened. The repair is idempotent (the next
run prints `already repaired` and writes nothing) and leaves an undo file holding each row's
payload as it was. What no data pass can do is change a process that is already running: a core
booted from pre-fix plugin code still resolves and mints MID refids until it is restarted, so
the restart is what arms the code half on that process, along with `VFG_ACCOUNT_AUTH` /
`VFG_CARD_AUTH_WINDOW` / `VFG_SESSION_TAKEOVER_GRACE` in `config.ini [mfg@asphyxia]`.

Each repair is logged at any verbosity, naming which trigger ran it:

```
[VFG] quarantined legacy phantom profile refid=MID88000123 via=read (mid=88000123 session cleared, states kept=1)
```

Measured on this deployment's savedata (`tmp/RyuNET-core/dist/savedata/mfg@asphyxia.db`): 118
profile documents, 3 MID-prefixed — `MID00998877`, `MID88000123`, `MID88000124` — all three now
`player_id=0` with an empty `session_id` and the quarantine marker, their payload preserved in
`tmp/p9repair/undo-*.json`, and the other 115 documents byte-for-byte unchanged
(`.audit/p9_db_fingerprint.js` before / after: 3 rows moved out of 138, 0 since).

Which number came from where — the full record is `.audit/p9-mid-phantom-report.md`:

- **deployment, no harness writes** (`tmp/p9repro/repro.cjs` with `P9_NO_SEED=1` against a clone
  of this savedata): 118 profile documents, 3 MID-prefixed, `0` missed by the old exactly-8
  pattern; every MID-shaped mint attempt refused, none created
  (`tmp/p9repro/out_deploy_post_unseeded.txt`).
- **harness-seeded lane**: the 9- and 10-digit documents are synthesized by the harness itself
  (`tmp/p9repro/seed_lane.cjs`, and the seeds `repro.cjs` inserts from the fork formula). A run
  that prints `121 documents / 6 MID-prefixed` is describing its own fixture, not this
  deployment — that run exists to show the wider pattern refusing shapes the server does not
  have (`tmp/p9repro/out_deploy_post_seeded.txt`).

## Routing and dispatch

Two listeners answer AOG requests: the core port (`port`, default 8083) through
the core's `AogMiddleware`, and this plugin's own HTTP server on
`mfg_http_port` (default 22421). Both resolve a URL to an endpoint by scanning
the path segments for a registered name (`handlers/aog.ts: extractAogName`), so
the trailing slash in `/aog/gget/`, the doubled slash the client posts in
`/aog//gget`, and an endpoint name sitting mid-path all resolve. Mid-path matters
for `reconnect`, which the client builds as
`{front}{gserv_id:00}.{tail}{gserv_url}reconnect/{appver}/{session}/{webid}/`
(`Reconnect.cs:18`) — a last-segment rule never sees it. A request whose name is
not registered is answered with the empty success XML
(`<root><serv_st><code>0</code></serv_st></root>`), never with silence, and every
request is answered exactly once.

The route table carries one name per endpoint the shipping client posts.
`get_record` and `coop_done` used to be registered as aliases of `player_record`
and `eashop_done`, named after the request classes (`GetRecord.cs`,
`CoopDone.cs`) instead of the wire path; the client never posts those names, so
they are gone.

### Core change needed: the AOG allowlist

`AogMiddleware` treats a request as AOG only when the URL starts with `/aog`
**or** its last path segment is in the fixed `KNOWN_AOG` set
(`src/middlewares/AogMiddleware.ts:20-26`). That set lacks two endpoints this
plugin registers and the client calls — `chara_enabled` (`CharaEnabledSend.cs:24`)
and `janpon_log` (`JanponLog.cs:37`) — so posted at the root of the core port
they fall through to the e-amusement catch-all and 404.

No plugin-side API touches that set: `R.AogRoute` registers a handler and
`R.AogUnhandled` a fallback (`src/eamuse/ExternalPluginLoader.ts:239-244`), and
`KNOWN_AOG` is a module-local `Set` the middleware never consults the registry
for. The change belongs in core, one line at `AogMiddleware.ts:25`:

```ts
"get_jongstone_info","get_mg", … ,"coop_done","eashop_done",
"chara_enabled","janpon_log",          // add these two
```

Until it lands, keep the `/aog` path on every core-port URL: the prefix check
bypasses the allowlist, and `/aog/chara_enabled` / `/aog/janpon_log` answer
normally. `vfgac.service_list` already enforces it (`handlers/eamuse.ts:487-514`)
— a bare-root `mfg_service_url` is advertised with `/aog/` appended — so
`http://<host>:8083/aog` works and `http://<host>:8083` does not. The same rule
applies to whatever URL a client build is pointed at directly.

