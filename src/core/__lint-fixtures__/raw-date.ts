// Fixture: must trigger no-restricted-syntax (raw Date outside core/time).
export const now = Date.now();
export const hours = new Date(0).getHours();
