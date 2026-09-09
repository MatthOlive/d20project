export function normalizeGameInviteCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function formatGameInviteCode(value: string): string {
  const normalized = normalizeGameInviteCode(value).toUpperCase();
  return normalized.match(/.{1,4}/g)?.join("-") ?? "";
}
