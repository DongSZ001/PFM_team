/**
 * Unit converter for magnetic / elastic material parameters.
 *
 * All values in the database are stored in SI units.  This module
 * converts raw Excel cell values (and their headers) to SI, and back
 * to a "display" unit when the API returns results to the frontend.
 *
 * Design rules:
 *   - Internal storage is always SI.
 *   - Conversion never silently changes the sign of gamma or B.
 *   - Strings (anisotropy type, DMI type) bypass numeric conversion.
 *   - Unparseable / ambiguous input returns { valueSi: null, ... }
 *     and the caller is expected to write an import_warning.
 */

'use strict';

// ---- Display-unit helpers (SI -> display) ----------------------------------

const DISPLAY_PREFERENCE = {
  // parameter_key -> { siUnit, displayUnit, factor }  (factor: SI * factor = display)
  Aex:                 { siUnit: 'J/m',     displayUnit: 'pJ/m',    factor: 1e12 },
  Ku1:                 { siUnit: 'J/m^3',   displayUnit: 'kJ/m^3',  factor: 1e-3  },
  Ku2:                 { siUnit: 'J/m^3',   displayUnit: 'kJ/m^3',  factor: 1e-3  },
  Ms:                  { siUnit: 'A/m',     displayUnit: 'kA/m',    factor: 1e-3  },
  D:                   { siUnit: 'J/m^2',   displayUnit: 'mJ/m^2',  factor: 1e3   },
  alpha:               { siUnit: 'dimensionless', displayUnit: 'dimensionless', factor: 1 },
  gamma0:              { siUnit: 'rad/(T*s)', displayUnit: 'rad/(T*s)', factor: 1 },
  B_ext:               { siUnit: 'T',       displayUnit: 'mT',      factor: 1e3   },
  c11:                 { siUnit: 'Pa',      displayUnit: 'GPa',     factor: 1e-9  },
  c12:                 { siUnit: 'Pa',      displayUnit: 'GPa',     factor: 1e-9  },
  c44:                 { siUnit: 'Pa',      displayUnit: 'GPa',     factor: 1e-9  },
  lambda100:           { siUnit: 'dimensionless', displayUnit: 'ppm',  factor: 1e6 },
  lambda111:           { siUnit: 'dimensionless', displayUnit: 'ppm',  factor: 1e6 },
  young_modulus:       { siUnit: 'Pa',      displayUnit: 'GPa',     factor: 1e-9  },
  poisson_ratio:       { siUnit: 'dimensionless', displayUnit: 'dimensionless', factor: 1 },
  b1:                  { siUnit: 'J/m^3',   displayUnit: 'MJ/m^3',  factor: 1e-6  },
  b2:                  { siUnit: 'J/m^3',   displayUnit: 'MJ/m^3',  factor: 1e-6  },
  B1_from_lambda100:   { siUnit: 'J/m^3',   displayUnit: 'MJ/m^3',  factor: 1e-6  },
  B2_from_lambda100:   { siUnit: 'J/m^3',   displayUnit: 'MJ/m^3',  factor: 1e-6  },
};

function siToDisplay(parameterKey, valueSi) {
  if (valueSi == null || valueSi === '') return null;
  const pref = DISPLAY_PREFERENCE[parameterKey];
  if (!pref) return valueSi;
  const v = Number(valueSi);
  if (!Number.isFinite(v)) return null;
  return v * pref.factor;
}

function getDisplayMeta(parameterKey) {
  const pref = DISPLAY_PREFERENCE[parameterKey];
  if (!pref) return { siUnit: '', displayUnit: '' };
  return { siUnit: pref.siUnit, displayUnit: pref.displayUnit };
}

// ---- Raw -> SI converters --------------------------------------------------
//
// Each converter takes (rawValue, rawUnitHint) and returns:
//   { valueSi, valueMinSi, valueMaxSi, textValue, rawUnit, warning? }
//
// "rawUnitHint" is whatever the column header says.  We use it to
// disambiguate (e.g. DMI in mJ/m^2 -> *1e-3).
// ----------------------------------------------------------------------------

const T = true; // just for readability

function _isBlank(v) {
  return v == null || (typeof v === 'string' && v.trim() === '');
}

function _toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  // Strip thousands separators (commas), keep minus, dot, exponent, leading +
  const cleaned = v.replace(/,/g, '').trim();
  if (cleaned === '') return NaN;
  const n = Number(cleaned);
  return n;
}

// Aex: J/m in Excel.  Direct.
function convertAex(raw) {
  if (_isBlank(raw)) return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'J/m' };
  const n = _toNumber(raw);
  if (!Number.isFinite(n)) {
    return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'J/m', warning: `cannot parse Aex value: ${raw}` };
  }
  return { valueSi: n, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'J/m' };
}

// K1 / K2: J/m^3 in Excel.  Direct.
function convertKu(raw) {
  if (_isBlank(raw)) return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'J/m^3' };
  const n = _toNumber(raw);
  if (!Number.isFinite(n)) {
    return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'J/m^3', warning: `cannot parse Ku value: ${raw}` };
  }
  return { valueSi: n, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'J/m^3' };
}

// Ms: A/m in Excel.  Direct.
function convertMs(raw) {
  if (_isBlank(raw)) return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'A/m' };
  const n = _toNumber(raw);
  if (!Number.isFinite(n)) {
    return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'A/m', warning: `cannot parse Ms value: ${raw}` };
  }
  return { valueSi: n, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'A/m' };
}

// DMI: Excel header is mJ/m^2, internal is J/m^2.
// Accepts a single number OR a range string "min~max" (also "min-max" / "min~max").
function convertDmi(raw) {
  if (_isBlank(raw)) return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'mJ/m^2' };
  if (typeof raw === 'string') {
    const rangeMatch = raw.match(/^\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*[~\-–—]\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*$/);
    if (rangeMatch) {
      const lo = Number(rangeMatch[1]);
      const hi = Number(rangeMatch[2]);
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        return {
          valueSi: null,
          valueMinSi: lo * 1e-3,
          valueMaxSi: hi * 1e-3,
          textValue: null,
          rawUnit: 'mJ/m^2',
        };
      }
    }
  }
  const n = _toNumber(raw);
  if (!Number.isFinite(n)) {
    return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'mJ/m^2', warning: `cannot parse DMI value: ${raw}` };
  }
  return { valueSi: n * 1e-3, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'mJ/m^2' };
}

// alpha: dimensionless, direct.
function convertAlpha(raw) {
  if (_isBlank(raw)) return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'dimensionless' };
  const n = _toNumber(raw);
  if (!Number.isFinite(n)) {
    return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'dimensionless', warning: `cannot parse alpha: ${raw}` };
  }
  return { valueSi: n, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'dimensionless' };
}

// gamma0: rad/(T*s), direct, sign preserved.
function convertGamma0(raw) {
  if (_isBlank(raw)) return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'rad/(T*s)' };
  const n = _toNumber(raw);
  if (!Number.isFinite(n)) {
    return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'rad/(T*s)', warning: `cannot parse gamma0: ${raw}` };
  }
  return { valueSi: n, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'rad/(T*s)' };
}

// Magnetic field.  T / mT may be specified in the cell text.
function convertBext(raw) {
  if (_isBlank(raw)) return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'T' };
  if (typeof raw === 'string') {
    const s = raw.trim();
    // "89.6 mT", "800 mT" etc.
    const mt = s.match(/^\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*mT\s*$/i);
    if (mt) {
      const v = Number(mt[1]) * 1e-3;
      return { valueSi: v, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'mT' };
    }
    // "0.5 T"
    const t = s.match(/^\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*T\s*$/i);
    if (t) {
      const v = Number(t[1]);
      return { valueSi: v, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'T' };
    }
    // Pure number — assume T
    const n = _toNumber(s);
    if (Number.isFinite(n)) {
      return { valueSi: n, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'T' };
    }
    return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'T', warning: `cannot parse magnetic field: ${raw}` };
  }
  const n = _toNumber(raw);
  if (!Number.isFinite(n)) {
    return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'T', warning: `cannot parse magnetic field: ${raw}` };
  }
  return { valueSi: n, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'T' };
}

// c11/c12/c44: Pa direct.
function convertC(raw) {
  if (_isBlank(raw)) return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'Pa' };
  const n = _toNumber(raw);
  if (!Number.isFinite(n)) {
    return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'Pa', warning: `cannot parse elastic constant: ${raw}` };
  }
  return { valueSi: n, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'Pa' };
}

// lambda100 / lambda111: dimensionless direct.
function convertLambda(raw) {
  if (_isBlank(raw)) return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'dimensionless' };
  const n = _toNumber(raw);
  if (!Number.isFinite(n)) {
    return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'dimensionless', warning: `cannot parse lambda: ${raw}` };
  }
  return { valueSi: n, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'dimensionless' };
}

// Young's modulus.  Excel header is GPa.  Cell may be:
//   - a bare number (e.g. 162)         -> *1e9
//   - text with "GPa" / "Gpa" suffix   -> parse + *1e9
//   - composite text "Pt/Co/Ta=160/210/186（177 Gpa)"  -> take the parenthetical value if present, else the last number
function convertYoungModulus(raw) {
  if (_isBlank(raw)) return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'GPa' };
  if (typeof raw === 'number') {
    return { valueSi: raw * 1e9, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'GPa' };
  }
  const s = String(raw);

  // Look for a value inside (...) first: "Pt/Co/Ta=160/210/186（177 Gpa)"
  const paren = s.match(/[（(]\s*(-?\d+(?:\.\d+)?)\s*(GPa|Gpa|gpa)\s*[)）]/i);
  if (paren) {
    const v = Number(paren[1]) * 1e9;
    return { valueSi: v, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'GPa' };
  }

  // Bare "162" or "162 GPa"
  const numWithGpa = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*(GPa|Gpa|gpa)?\s*$/i);
  if (numWithGpa) {
    const v = Number(numWithGpa[1]) * 1e9;
    return { valueSi: v, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'GPa' };
  }

  return {
    valueSi: null,
    valueMinSi: null,
    valueMaxSi: null,
    textValue: null,
    rawUnit: 'GPa',
    warning: `cannot reliably extract Young's modulus from text: ${raw}`,
  };
}

// Poisson's ratio.  Bare number or "Pt/Co/Ta=0.38/0.31/0.34 (0.355)" -> use parenthetical value.
function convertPoisson(raw) {
  if (_isBlank(raw)) return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'dimensionless' };
  if (typeof raw === 'number') {
    return { valueSi: raw, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'dimensionless' };
  }
  const s = String(raw);

  const paren = s.match(/[（(]\s*(-?\d+(?:\.\d+)?)\s*[)）]/);
  if (paren) {
    const v = Number(paren[1]);
    if (Number.isFinite(v)) {
      return { valueSi: v, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'dimensionless' };
    }
  }
  const n = _toNumber(s);
  if (Number.isFinite(n)) {
    return { valueSi: n, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'dimensionless' };
  }
  return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'dimensionless', warning: `cannot parse Poisson's ratio: ${raw}` };
}

// b1 / b2: header says Pa (== J/m^3), Sheet3 says display as MJ/m^3.
// Store internally as J/m^3.  If value is suspiciously small (e.g. -8.8),
// do NOT auto-rescale; flag the warning.
function convertB(raw, key) {
  if (_isBlank(raw)) return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'Pa' };
  if (typeof raw === 'string') {
    // accept e.g. "10 MJ/m^3" or "1e6 J/m^3" for safety
    const mj = raw.match(/^\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*MJ\s*\/?\s*m\^?3?\s*$/i);
    if (mj) {
      return { valueSi: Number(mj[1]) * 1e6, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'MJ/m^3' };
    }
    const jm = raw.match(/^\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*J\s*\/?\s*m\^?3?\s*$/i);
    if (jm) {
      return { valueSi: Number(jm[1]), valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'J/m^3' };
    }
  }
  const n = _toNumber(raw);
  if (!Number.isFinite(n)) {
    return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'Pa', warning: `cannot parse ${key} value: ${raw}` };
  }
  // Heuristic: if |n| < 1e3 and non-zero, the cell was likely written in MJ/m^3
  // but stored as the bare number.  Don't auto-fix; just warn.
  if (n !== 0 && Math.abs(n) < 1e3) {
    return {
      valueSi: n,           // store as-is in Pa
      valueMinSi: null,
      valueMaxSi: null,
      textValue: null,
      rawUnit: 'Pa',
      warning: `${key} value ${n} is unusually small; it may be in MJ/m^3 rather than Pa. Please verify.`,
    };
  }
  return { valueSi: n, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: 'Pa' };
}

// String-only parameters (anisotropy type, DMI type).  No numeric conversion.
function convertText(raw) {
  if (_isBlank(raw)) return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: '' };
  return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: String(raw).trim(), rawUnit: '' };
}

// ---- Dispatcher ------------------------------------------------------------

const CONVERTERS = {
  Aex:               convertAex,
  Ku1:               convertKu,
  Ku2:               convertKu,
  Ms:                convertMs,
  D:                 convertDmi,
  alpha:             convertAlpha,
  gamma0:            convertGamma0,
  B_ext:             convertBext,
  c11:               convertC,
  c12:               convertC,
  c44:               convertC,
  lambda100:         convertLambda,
  lambda111:         convertLambda,
  young_modulus:     convertYoungModulus,
  poisson_ratio:     convertPoisson,
  b1:                (r) => convertB(r, 'b1'),
  b2:                (r) => convertB(r, 'b2'),
  B1_from_lambda100: convertB,
  B2_from_lambda100: convertB,
  anisotropy_type:   convertText,
  DMI_type:          convertText,
};

function convert(parameterKey, raw) {
  const fn = CONVERTERS[parameterKey];
  if (!fn) {
    return { valueSi: null, valueMinSi: null, valueMaxSi: null, textValue: null, rawUnit: '', warning: `no converter for ${parameterKey}` };
  }
  return fn(raw);
}

module.exports = {
  convert,
  siToDisplay,
  getDisplayMeta,
  DISPLAY_PREFERENCE,
  _internal: { CONVERTERS, convertText },
};
