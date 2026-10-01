// Pure domain core. No React, DOM, Supabase, or raw Date outside core/time.
// Enforced by eslint.config.js (boundaries + date rules) and tsconfig.core.json (no DOM lib).
//
//   time/        clocks, time zones, day boundaries, calendar-date math
//   nutrition/   BMR/TDEE, calorie target, macro solver, weight trend and projection
//   schedule/    meal windows, slot inference, the expected-consumption corridor
//   recommend/   status + next-meal budgets and suggestions (pure function of its input)
//   dayview/     target snapshots by date, day summary, everything the "today" screen shows
//   contracts/   input rules for meals, favorites and weigh-ins
//
// Still to come: food/ (stage 4), export/ (stage 8). Import from the submodule you need
// (e.g. '../core/nutrition'); there is deliberately no catch-all barrel.
export {};
