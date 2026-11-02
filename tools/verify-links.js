#!/usr/bin/env node
// Verify every YouTube videoId in content/*.json against YouTube's oEmbed
// endpoint. A 200 means the video exists and resolves; 404/403 means it is
// gone, private, or unresolvable — those entries must be fixed before merge.
//
// Usage:  node tools/verify-links.js
// (oEmbed is a metadata check, not a guarantee of regional embeddability)

const fs = require("fs");
const path = require("path");

const contentDir = path.join(__dirname, "..", "content");

async function check(url) {
  const res = await fetch("https://www.youtube.com/oembed?url=" + encodeURIComponent(url) + "&format=json", {
    headers: { "User-Agent": "ALittleMusic-linkcheck/1.0" },
  });
  return res.status;
}

async function checkSpotify(url) {
  const res = await fetch("https://open.spotify.com/oembed?url=" + encodeURIComponent(url), {
    headers: { "User-Agent": "ALittleMusic-linkcheck/1.0" },
  });
  return res.status;
}

(async () => {
  const files = fs.readdirSync(contentDir).filter((f) => f.endsWith(".json"));
  let bad = 0;
  for (const f of files) {
    const entries = JSON.parse(fs.readFileSync(path.join(contentDir, f), "utf8"));
    for (const e of entries) {
      const watch = e.playback?.watchUrl;
      if (!watch) { console.log(`MISSING  ${f} / ${e.id}: no watchUrl`); bad++; continue; }
      if (e.playback?.provider === "spotify") {
        const st = await checkSpotify(watch);
        const ok = st === 200;
        if (!ok) bad++;
        console.log(`${ok ? "OK  " : "FAIL "}${f} / ${e.id}: ${e.title} — ${watch} (spotify oEmbed ${st})`);
        continue;
      }
      const id = e.playback?.videoId;
      if (!/^[A-Za-z0-9_-]{11}$/.test(id || "")) { console.log(`BADID    ${f} / ${e.id}: videoId "${id}" is not an 11-char ID`); bad++; continue; }
      const status = await check(watch);
      const ok = status === 200;
      if (!ok) bad++;
      console.log(`${ok ? "OK  " : "FAIL "}${f} / ${e.id}: ${e.title} — ${watch} (oEmbed ${status})`);
      // Alternate listening links: oEmbed-check YouTube/Spotify URLs, skip others.
      for (const l of e.listenLinks || []) {
        if (!l?.url) { console.log(`BADLINK  ${f} / ${e.id}: listenLink without url`); bad++; continue; }
        let st;
        if (l.provider === "spotify") st = await checkSpotify(l.url);
        else if (l.provider === "youtube") st = await check(l.url);
        else { console.log(`SKIP     ${f} / ${e.id}: ${l.url} (${l.provider || "unknown provider"} — no oEmbed check)`); continue; }
        const lok = st === 200;
        if (!lok) bad++;
        console.log(`${lok ? "OK  " : "FAIL "}${f} / ${e.id}: ↳ ${l.url} (oEmbed ${st})`);
      }
    }
  }
  console.log(bad ? `\n${bad} problem(s) — fix before merging.` : "\nAll links check out.");
  process.exit(bad ? 1 : 0);
})();
