// Fixture: raw Date IS allowed inside core/time - must NOT trigger no-restricted-syntax.
export const now = Date.now();
export const hours = new Date(0).getHours();
