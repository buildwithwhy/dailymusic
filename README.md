# A Little Music

One interesting piece of music, every day. A mobile-first web app, in beta.

*A working title — not a cleared brand name.*

## Run it

```bash
node server.js        # serves on :8899 (override with PORT=xxxx)
```

No dependencies, no build step. Deploy by copying the whole folder anywhere that
serves static files.

## How the app works

- **No accounts.** Favourites and category preferences live in the visitor's
  browser (localStorage). Nothing is tracked.
- **Daily pick.** `app.js` computes the day's piece deterministically from the
  catalogue: the visitor's chosen categories rotate day by day, and within each
  category a fixed shuffle decides the order. The pick is stable all day, and
  no piece repeats until every piece in the pool has been featured once.
- **Playback.** Official YouTube embeds (`youtube-nocookie.com`), loaded only
  when the visitor taps Listen — never autoplayed. If a video is unavailable or
  region-blocked, the app shows a plain message with direct links. Audio is
  never downloaded, rehosted, or extracted.
- **Artwork.** None is used. Each piece gets a typographic treatment in the
  category's tint, so there are no image-licensing obligations.
- **Access model.** `config.js` → `betaUnlocked: true` currently opens the full
  archive. When you're ready to gate it: set `betaUnlocked: false` and the free
  tier shows today plus the previous `freeWindowDays` (3) days; older archive
  entries show a subscription note. No payment provider is wired up yet.

## Adding content (the only routine job)

Each selection is one JSON object. Batches live in `content/*.json`
(`classical.json`, `jazz.json`, `folk.json`), and the app reads the merged
`data/catalogue.json`.

To add next month's batch:

1. Create `content/2026-12-batch.json` with new entries (schema below).
2. Run `node tools/merge.js` — it validates, de-duplicates by `id`, and
   rewrites `data/catalogue.json`.
3. Restart or redeploy (a static copy just needs re-uploading).

The merge tool skips malformed entries and reports problems instead of
guessing — never hand-edit `data/catalogue.json` if a field is missing; fix the
batch file.

### Entry schema

```json
{
  "id": "gould-goldberg-1981",
  "title": "Goldberg Variations, BWV 988",
  "performer": "Glenn Gould",
  "composer": "Johann Sebastian Bach",
  "compositionYear": 1741,
  "recordingYear": 1981,
  "recordingNote": "Gould's 1981 digital re-recording for CBS",
  "category": "classical",
  "tags": ["keyboard", "variations"],
  "context": "50–100 words of factual, inviting context.",
  "listenFor": "One sentence pointing at something audible in the music.",
  "playback": {
    "provider": "youtube",   // "youtube" or "spotify"
    "videoId": "11-char YouTube ID, or 22-char Spotify track id",
    "watchUrl": "https://www.youtube.com/watch?v=…"
  },
  // Optional: other places to hear this recording, shown on the page and used
  // when the primary player cannot play (e.g. region-blocked embed).
  "listenLinks": [
    { "provider": "spotify", "label": "Spotify", "url": "https://open.spotify.com/track/…" },
    { "provider": "youtube", "label": "YouTube", "url": "https://www.youtube.com/watch?v=…" }
  ],
  "fallbackUrl": "https://…  (another authorised listening destination)",
  "sources": ["https://en.wikipedia.org/…"],
  "artworkNote": "typographic — no artwork licensed",
  "restrictions": null,
  "lastChecked": "2026-11-01"
}
```

Field notes:

- `compositionYear` vs `recordingYear` — keep them distinct; the app shows
  "Composed 1741 · Recorded 1981" separately.
- `playback` — YouTube IDs must be verified with the oEmbed check before
  merging: `curl -s "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=ID&format=json"`
  returns 200 for a live video (`node tools/verify-links.js` runs this over the
  whole catalogue, Spotify included). oEmbed does not prove embeddability or
  region availability — that's what the in-app error fallback is for. Use the
  `spotify` provider when there is no official YouTube upload; the app embeds
  Spotify's official widget the same way.
- `sources` — where the context text's facts came from. Re-check `lastChecked`
  when you revisit an entry.

## Outstanding (not blocking the beta)

- **Brand/trademark check** for "A Little Music" before any public launch.
- **Payments** — no billing infrastructure; pricing figures in `config.js` are
  hypotheses only.
- **Provider terms** — YouTube embedding is permitted via the official player;
  revisit the provider terms before any commercial launch
  (https://developers.google.com/youtube/terms, Spotify Widget Terms if adding
  Spotify embeds).
- **Region availability** — links were checked from one region; the app degrades
  gracefully elsewhere, but worth spot-checking from a VPN before launch.
