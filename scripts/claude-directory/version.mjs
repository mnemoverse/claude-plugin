// SemVer 2.0.0 precedence, used by publish.mjs to refuse a release that is
// lower than the one already on the claude-directory branch. Build metadata
// (after "+") does not count; a prerelease sorts below its release.

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(v) {
  const m = SEMVER.exec(String(v));
  if (!m) throw new Error(`${JSON.stringify(v)} is not a SemVer version`);
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split(".") : [] };
}

function compareIdentifiers(a, b) {
  const na = /^\d+$/.test(a);
  const nb = /^\d+$/.test(b);
  if (na && nb) return Math.sign(Number(a) - Number(b));
  if (na) return -1;
  if (nb) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

// Returns -1, 0 or 1 as a has lower, equal or higher precedence than b.
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] < pb.core[i] ? -1 : 1;
  }
  if (!pa.pre.length || !pb.pre.length) return Math.sign(pb.pre.length - pa.pre.length) || 0;
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    if (pa.pre[i] === undefined) return -1;
    if (pb.pre[i] === undefined) return 1;
    const c = compareIdentifiers(pa.pre[i], pb.pre[i]);
    if (c) return c;
  }
  return 0;
}

// Ordered cases that check.mjs runs, so a regression in the ordering fails CI.
export const VERSION_ORDER_CASES = [
  ["1.0.5", "1.0.6", -1],
  ["1.0.9", "1.0.10", -1],
  ["1.0.6", "1.0.6", 0],
  ["1.0.6+build.2", "1.0.6+build.1", 0],
  ["1.0.0-rc.1", "1.0.0", -1],
  ["1.0.0", "1.0.0-rc.1", 1],
  ["1.0.0-alpha", "1.0.0-alpha.1", -1],
  ["1.0.0-alpha.1", "1.0.0-alpha.beta", -1],
  ["1.0.0-beta.2", "1.0.0-beta.11", -1],
  ["1.0.0-beta.11", "1.0.0-rc.1", -1],
  ["2.0.0", "1.9.9", 1],
];
