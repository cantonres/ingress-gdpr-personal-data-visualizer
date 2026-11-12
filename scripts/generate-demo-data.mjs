#!/usr/bin/env node
// Generate a small, fully SYNTHETIC Ingress GDPR export for a fictional
// Guangzhou agent. Used only to render README screenshots — contains no real
// personal data. Deterministic (fixed seed) so screenshots are reproducible.
//
// Usage: node scripts/generate-demo-data.mjs [--out data-demo/raw]

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : "data-demo/raw";
mkdirSync(out, { recursive: true });

// deterministic PRNG (mulberry32)
let seed = 20261112;
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const n = (min, max) => min + rnd() * (max - min);
const f6 = (v) => v.toFixed(6);
const pad = (v) => String(v).padStart(2, "0");

// 90 fictional portals around Yuexiu / Tianhe, Guangzhou.
const portals = [];
for (let i = 0; i < 90; i++) {
  portals.push({
    lat: 23.129 + (rnd() - 0.5) * 0.058,
    lng: 113.264 + (rnd() - 0.5) * 0.072,
  });
}

const START = Date.UTC(2022, 0, 1);
const END = Date.UTC(2024, 11, 31);
function randomTime(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()} ${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

const TRIGGERS = [
  ["hacked friendly portal", "hacked neutral portal", "hacked enemy portal"], // hack
  ["resonator deployed"], // deploy
  ["resonator upgraded"], // upgrade
  ["mod deployed"], // mod
  ["captured portal"], // capture
  ["fired weapon", "resonator destroyed from portal", "last resonator on portal destroyed"], // attack
  ["created link"], // link
  ["created field"], // field (no coords)
  ["portal edit or submission created", "portal edit or submission data received"], // portal_edit
  ["recharged resonator(s)"], // recharge
  ["dropped item", "item recycled", "picked up item"], // item
  ["login"], // login
  ["location update"], // location
  ["redeem passcode success", "added xm from passcode", "used Hypercube", "send comm message", "aegis shield deployed", "drone moved", "kinetic capsule result claimed", "mission completed", "ultra link amp deployed"], // other
];
const WEIGHTS = [26, 12, 4, 5, 1, 18, 5, 2, 1, 4, 5, 4, 3, 10];
const cum = [];
WEIGHTS.reduce((a, w, i) => (cum[i] = a + w), 0);
const totalW = cum[cum.length - 1];
function pickCategory() {
  const r = rnd() * totalW;
  for (let i = 0; i < cum.length; i++) if (r < cum[i]) return i;
  return TRIGGERS.length - 1;
}

const EVENT_COUNT = 6000;
const events = [];
for (let i = 0; i < EVENT_COUNT; i++) {
  const cat = pickCategory();
  const trigger = pick(TRIGGERS[cat]);
  const p = pick(portals);
  const ts = START + Math.floor(rnd() * (END - START));
  const playerOffset = 0.00035;
  const isField = cat === 7;
  const lat = isField ? "None" : f6(p.lat + (cat === 5 || cat >= 9 ? (rnd() - 0.5) * playerOffset : 0));
  const lng = isField ? "None" : f6(p.lng + (cat === 5 || cat >= 9 ? (rnd() - 0.5) * playerOffset : 0));
  events.push({ ts, line: `${randomTime(ts)}\t${lat}\t${lng}\t${trigger}\tdemo-${i}` });
}
events.sort((a, b) => a.ts - b.ts);
writeFileSync(
  join(out, "game_log.tsv"),
  "Time\tLatitude\tLongitude\tTracker Trigger\tComment\n" + events.map((e) => e.line).join("\n") + "\n",
);

// Time/Value series: 36 monthly rows each.
const SERIES = [
  "kilometers_walked.tsv", "xm_collected.tsv", "xm_recharged.tsv", "hacks.tsv",
  "deploys.tsv", "mods_deployed.tsv", "resonators_destroyed.tsv", "links_created.tsv",
  "fields_created.tsv", "fields_destroyed.tsv", "link_destroyed.tsv", "glyph_hack_points.tsv",
  "link_length_kilometers.tsv", "portals_captured.tsv", "portals_neutralized.tsv",
  "missions_completed.tsv", "magnus_builder_slots_deployed.tsv", "field_held_days.tsv",
  "link_held_days.tsv", "portal_held_days.tsv", "mind_units_controlled.tsv",
  "mind_units_times_days_held.tsv", "link_length_kilometers_times_days_held.tsv",
];
for (const [si, file] of SERIES.entries()) {
  const rows = ["Time\tValue"];
  for (let y = 2022; y <= 2024; y++) {
    for (let m = 1; m <= 12; m++) {
      const base = 20 + si * 7 + Math.sin((y - 2022) * 12 + m + si) * 8;
      const v = Math.max(0.1, base * (0.6 + rnd() * 0.9));
      rows.push(`${y}-${pad(m)}-05 11:00:00 PDT\t${v.toFixed(2)}`);
    }
  }
  writeFileSync(join(out, file), rows.join("\n") + "\n");
}

// comm_mentions.tsv is Time/Message (not Value).
writeFileSync(
  join(out, "comm_mentions.tsv"),
  "Time\tMessage\n" +
    [
      ["2022-03-11 08:12:01", "[secure] DemoAgent01: 明天一起刷广州塔?"],
      ["2022-07-02 19:44:10", "[secure] DemoAgent02: @DemoAgent 周末有拼图活动"],
      ["2023-01-15 12:30:00", "[secure] DemoAgent03: @DemoAgent 新年快乐"],
      ["2023-09-20 21:05:44", "[secure] DemoAgent04: @DemoAgent 珠江新城见"],
      ["2024-05-06 07:55:32", "[secure] DemoAgent05: @DemoAgent 收到"],
    ].map(([t, m]) => `${t}\t${m}`).join("\n") + "\n",
);

const BADGES = [
  "Bronze Pioneer", "Silver Pioneer", "Gold Pioneer", "Bronze Hacker", "Silver Hacker",
  "Bronze Liberator", "Silver Liberator", "Bronze Trekker", "Silver Trekker", "Gold Trekker",
  "Bronze Guardian", "Silver Guardian", "Bronze Recharger", "Silver Recharger",
  "Bronze Translator", "Silver Translator", "Bronze SpecOps", "Silver SpecOps",
  "Bronze Builder", "Silver Builder", "Bronze Engineer", "Silver Engineer",
  "Bronze Explorer", "Silver Explorer", "Bronze Paragon", "Silver Paragon",
];
const badgeLines = BADGES.map((b, i) => {
  const y = 2022 + Math.floor(i / 10);
  const m = 1 + (i % 12);
  const d = 1 + (i % 27);
  return `\t${b} at ${y}-${pad(m)}-${pad(d)} 10:00:00`;
});
writeFileSync(
  join(out, "profile.txt"),
  [
    "Email: demo@example.com",
    "Creation Time: 2022-01-01 00:00:00",
    "Agent name: DemoAgent",
    "Faction: DEMO",
    "Agent level: 12",
    "Action Points (AP): 1234567",
    "Last Location Time: 2024-12-31 09:00:00",
    "",
    "Badges:",
    ...badgeLines,
    "",
    "Inventory:",
    "\tXMP_BURSTER.8: 20",
    "\tRES_SHIELD.VERY_RARE: 10",
  ].join("\n"),
);
writeFileSync(join(out, "devices.txt"), "Device\tFirst Seen\tLast Seen\nDemo Phone\t2022-01-01\t2024-12-31\n");
writeFileSync(join(out, "recursions.tsv"), "Time\tFaction\n2023-06-01 12:00:00\tDEMO\n");
writeFileSync(join(out, "store_purchases.tsv"), "Time\tItem\tAmount\n2023-08-01 12:00:00\tDemo Item\t1\n");

// OPR review log with a handful of suggested-location coordinates.
const oprHeader = [
  "Candidate ID", "Assigned Time", "Comment", "Rating for Cultural", "Rating for Text",
  "Is Duplicate", "Duplicate of Portal", "Rating for Location", "Suggested Location",
  "Rating for Quality", "Rating for Safety", "One Star Submission", "Time",
  "Rating for Uniqueness", "What is it?",
];
const oprRows = [oprHeader.map((h) => `"${h}"`).join(",")];
for (let i = 0; i < 14; i++) {
  const p = pick(portals);
  const ts = `${2022 + (i % 3)}-${pad(1 + (i % 12))}-${pad(1 + (i % 27))} 09:00:00 GMT`;
  const row = [
    `demo${pad(i)}`, ts, "synthetic review", "3", "3", "False", "", "4",
    i < 10 ? `${f6(p.lat)}, ${f6(p.lng)}` : "", "3", "3", "False", ts, "3", "A landmark",
  ];
  oprRows.push(row.map((c) => `"${c}"`).join(","));
}
writeFileSync(join(out, "OprSubmissionLog.csv"), oprRows.join("\n") + "\n");

console.log(`Synthetic demo export written to ${out} (${EVENT_COUNT} game_log rows, ${portals.length} portals, ${SERIES.length} series)`);
