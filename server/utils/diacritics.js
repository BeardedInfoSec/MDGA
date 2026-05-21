// ASCII-folding for WoW character names. Lets users find their character
// without typing alt-coded glyphs (Nornë, Þràll, Bjørn, etc.). Used by the
// /api/characters/lookup fuzzy fallback and the roster-search endpoint.
//
// Pipeline:
//   1. NFD-normalize (separates base letters from combining diacritics)
//   2. Strip combining marks (U+0300..U+036F)
//   3. Replace specials that NFD can't decompose (ø, æ, þ, ß, etc.)
//   4. Lowercase
//
// Examples:
//   Nornë  -> norne
//   Þràll  -> thrall
//   Bjørn  -> bjorn
//   Áleks  -> aleks

const SPECIAL_MAP = {
  'ø': 'o', 'Ø': 'o',         // ø Ø
  'æ': 'ae', 'Æ': 'ae',       // æ Æ
  'œ': 'oe', 'Œ': 'oe',       // œ Œ
  'þ': 'th', 'Þ': 'th',       // þ Þ
  'ð': 'd',  'Ð': 'd',        // ð Ð
  'ß': 'ss',                       // ß
  'ł': 'l',  'Ł': 'l',        // ł Ł
  'đ': 'd',  'Đ': 'd',        // đ Đ
  'ħ': 'h',  'Ħ': 'h',        // ħ Ħ
  'ı': 'i',                        // ı (dotless)
};

function foldAscii(s) {
  if (s === null || s === undefined) return '';
  const decomposed = String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  let out = '';
  for (const ch of decomposed) {
    out += SPECIAL_MAP[ch] !== undefined ? SPECIAL_MAP[ch] : ch;
  }
  return out.toLowerCase();
}

module.exports = { foldAscii };
