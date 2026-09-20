// Coordinate text <-> number, shared by the Data Upload form's bounds fields and the
// map picker that writes to them. Lifted out of DataUpload.jsx so both directions of
// that sync use the exact same parser.

// Accepts decimal degrees, symbol-based DMS, or raw concatenated DMS with no separators.
export function parseDMSOrDecimal(value) {
  if (!value) return null;
  const str = String(value).trim();

  // Symbol-based DMS, e.g. 14°32'34.39"N.
  const dmsRegex = /(\d+(?:\.\d+)?)[°\s]+(\d+(?:\.\d+)?)['’′\s]+(\d+(?:\.\d+)?)["”″]?\s*([NSEW])?/i;
  const dmsMatch = str.match(dmsRegex);
  if (dmsMatch) {
    const [, deg, min, sec, dir] = dmsMatch;
    let decimal = parseFloat(deg) + parseFloat(min) / 60 + parseFloat(sec) / 3600;
    if (dir && /[SW]/i.test(dir)) decimal = -decimal;
    return decimal;
  }

  // Raw concatenated DMS with no separators, e.g. 143234.87 -> deg=14 min=32 sec=34.87.
  const rawMatch = str.match(/^(\d{5,7})(\.\d+)?\s*([NSEW])?$/i);
  if (rawMatch) {
    const [, intPart, frac = "", dir] = rawMatch;
    const sec = parseFloat(intPart.slice(-2) + frac);
    const min = parseInt(intPart.slice(-4, -2), 10);
    const deg = parseInt(intPart.slice(0, -4), 10);
    if (min < 60 && sec < 60) {
      let decimal = deg + min / 60 + sec / 3600;
      if (dir && /[SW]/i.test(dir)) decimal = -decimal;
      return decimal;
    }
  }

  // Plain decimal degrees, e.g. 14.542886.
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    return parseFloat(str);
  }

  return null;
}

/**
 * Degrees as the form's text fields should hold them.
 *
 * Six decimals is ~11 cm here — far finer than the ~6.6 m the pipeline can resolve —
 * and, unlike String(), it can't emit float noise (14.600000000000001) or exponential
 * notation, neither of which parseDMSOrDecimal's plain-decimal branch accepts.
 */
export function formatDeg(n) {
  return Number(n).toFixed(6);
}
