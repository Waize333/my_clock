export type KnownProfile = { id: string; name: string; email: string };
const key = "cadence:known-profiles";
export function knownProfiles(): KnownProfile[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}
export function rememberProfile(profile: KnownProfile) {
  try {
    const list = knownProfiles();
    localStorage.setItem(
      key,
      JSON.stringify([profile, ...list.filter((p) => p.id !== profile.id)]),
    );
  } catch {}
}
export function clearPrivateCache() {
  for (const key of Object.keys(localStorage))
    if (
      (key.startsWith("cadence:cache:") ||
        key.startsWith("cadence:profile:")) &&
      !key.endsWith(":local")
    )
      localStorage.removeItem(key);
}
