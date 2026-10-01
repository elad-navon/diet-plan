// Pure domain core. No React, DOM, Supabase, or raw Date outside core/time.
// Enforced by eslint.config.js (boundaries + date rules) and tsconfig.core.json (no DOM lib).
// Modules land here in stage 2: time, nutrition, schedule, recommend, dayview, contracts, export.
export {};
