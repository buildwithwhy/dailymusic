#!/usr/bin/env node
// Merge content batches into the app catalogue.
//
// Usage:  node tools/merge.js
//
// Reads every *.json file in content/ (one batch per file), de-duplicates by
// entry id, and writes the combined catalogue to data/catalogue.json.
// To add next month's content: drop a new batch file (e.g. content/december.json)
// in the same schema and re-run this. No application code changes.

const fs = require("fs");
const path = require("path");

const contentDir = path.join(__dirname, "..", "content");
const outFile = path.join(__dirname, "..", "data", "catalogue.json");

const REQUIRED = ["id", "title", "performer", "category", "context", "playback", "sources", "lastChecked"];

const files = fs.readdirSync(contentDir).filter((f) => f.endsWith(".json"));
let merged = [];
const seen = new Set();
const problems = [];

for (const f of files) {
  const entries = JSON.parse(fs.readFileSync(path.join(contentDir, f), "utf8"));
  if (!Array.isArray(entries)) { problems.push(`${f}: not a JSON array`); continue; }
  for (const e of entries) {
    const missing = REQUIRED.filter((k) => e[k] === undefined || e[k] === null || e[k] === "");
    if (missing.length) { problems.push(`${f}: "${e.title || e.id || "?"}" missing ${missing.join(", ")}`); continue; }
    if (!e.playback || !e.playback.watchUrl || !e.playback.videoId) {
      problems.push(`${f}: "${e.title}" playback needs provider, videoId and watchUrl`); continue;
    }
    if (e.playback.provider === "spotify") {
      if (!/^[A-Za-z0-9]{22}$/.test(e.playback.videoId)) {
        problems.push(`${f}: "${e.title}" spotify videoId must be a 22-char track id`); continue;
      }
    } else if (e.playback.provider && e.playback.provider !== "youtube") {
      problems.push(`${f}: "${e.title}" unknown provider "${e.playback.provider}" (use youtube or spotify)`); continue;
    }
    for (const l of e.listenLinks || []) {
      if (!l || !l.provider || !l.url) {
        problems.push(`${f}: "${e.title}" listenLinks entries need provider and url (label optional)`); continue;
      }
    }
    if (seen.has(e.id)) { problems.push(`${f}: duplicate id "${e.id}"`); continue; }
    seen.add(e.id);
    merged.push(e);
  }
}

if (problems.length) {
  console.error("Problems found (these entries were skipped):");
  for (const p of problems) console.error("  - " + p);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(merged, null, 2) + "\n");
const byCat = merged.reduce((m, e) => ((m[e.category] = (m[e.category] || 0) + 1), m), {});
console.log(`Wrote ${merged.length} entries to data/catalogue.json`);
for (const [cat, n] of Object.entries(byCat)) console.log(`  ${cat}: ${n}`);
