/**
 * Dotted input paths (FR-1.3), for example `costs.hard.perGrossSF` or
 * `program.unitTypes[1BR].rentPerMonth`. A bracketed selector picks an array element by its
 * `key` or `id` field, or by index when it is an integer and no element matches.
 */
export type Path = string;

export type PathSegment = { kind: 'key'; key: string } | { kind: 'select'; selector: string };

export function parsePath(path: Path): PathSegment[] {
  const segments: PathSegment[] = [];
  const re = /([^.[\]]+)|\[([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    if (m[1] !== undefined) segments.push({ kind: 'key', key: m[1] });
    else if (m[2] !== undefined) segments.push({ kind: 'select', selector: m[2] });
  }
  return segments;
}

function selectIndex(arr: unknown[], selector: string): number {
  const byField = arr.findIndex((el) => {
    if (el && typeof el === 'object') {
      const o = el as Record<string, unknown>;
      return o.key === selector || o.id === selector;
    }
    return false;
  });
  if (byField >= 0) return byField;
  if (/^\d+$/.test(selector)) return Number(selector);
  return -1;
}

export function getPath(obj: unknown, path: Path): unknown {
  let current: unknown = obj;
  for (const seg of parsePath(path)) {
    if (current === null || current === undefined) return undefined;
    if (seg.kind === 'key') {
      current = (current as Record<string, unknown>)[seg.key];
    } else {
      if (!Array.isArray(current)) return undefined;
      const idx = selectIndex(current, seg.selector);
      current = idx >= 0 ? current[idx] : undefined;
    }
  }
  return current;
}

/**
 * Returns a deep copy of `obj` with the value at `path` replaced. Missing objects along the way
 * are created; a missing array element selected by key creates `{ key }`.
 */
export function setPath<T>(obj: T, path: Path, value: unknown): T {
  const segments = parsePath(path);
  if (segments.length === 0) return obj;
  const root = structuredClone(obj) as unknown;
  let current: unknown = root;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const last = i === segments.length - 1;
    if (seg.kind === 'key') {
      const o = current as Record<string, unknown>;
      if (last) {
        o[seg.key] = value;
      } else {
        const next = segments[i + 1]!;
        if (o[seg.key] === undefined || o[seg.key] === null) {
          o[seg.key] = next.kind === 'select' ? [] : {};
        }
        current = o[seg.key];
      }
    } else {
      const arr = current as unknown[];
      let idx = selectIndex(arr, seg.selector);
      if (idx < 0) {
        idx = arr.length;
        arr.push(/^\d+$/.test(seg.selector) ? {} : { key: seg.selector });
      }
      if (last) {
        arr[idx] = value;
      } else {
        if (arr[idx] === undefined || arr[idx] === null) arr[idx] = {};
        current = arr[idx];
      }
    }
  }
  return root as T;
}

/** Apply a map of path → value overrides, returning a new object. */
export function applyOverrides<T>(obj: T, overrides: Record<Path, unknown>): T {
  let result = obj;
  for (const [path, value] of Object.entries(overrides)) {
    result = setPath(result, path, value);
  }
  return result;
}
