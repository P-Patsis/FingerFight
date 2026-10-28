// Player names: the profanity filter, the replacement name, and clash numbering. Pure functions (easy to test).
//
// HOW THE FILTER WORKS (and why it does not flag "Scunthorpe"):
//  1. The name is folded: lower case, accents removed, look-alike symbols read as letters (0->o, 3->e, 4->a, 5->s, 7->t, @->a, $->s, !->i, 1->i or l).
//  2. It is split into WORDS at spaces, dots, dashes, underscores, stars... and at lower->UPPER case changes ("BigShit" -> "Big", "Shit").
//  3. A word is flagged only if it IS an entry of OBSCENE_WORDS (also without a trailing "s", without trailing digits, or with stretched
//     letters: "fuuuuck"). So "Scunthorpe", "Assassin", "Penistone", "Grape" and "Class" pass, and a real word with a bad word inside is not hit.
//  4. A very short list, OBSCENE_ANYWHERE, is also searched INSIDE the whole name with separators removed ("f.u.c.k", "xXfuckXx").
//     Only strings that essentially never occur in innocent words belong there.
// It cannot catch everything (creative spellings, other languages not listed) and it is not meant to: it is a first line of defence.
// TO EXTEND: add lower-case, accent-free entries to the arrays below. Chinese/Japanese have no spaces, so those go in OBSCENE_ANYWHERE.
import { sanitizeName } from './logic.js';

export const OBSCENE_ANYWHERE = [
  'fuck', 'nigger', 'faggot', 'motherf', 'cocksuck', 'bitch', 'whore', 'asshole', 'arsehole', 'dickhead', 'jackoff', 'blowjob',
  'wanker', 'bullshit', 'horseshit', 'shithead', 'shitface',
  'scheisse', 'arschloch', 'wichser', 'hurensohn', 'putain', 'enculer', 'vaffanculo', 'malakas', 'poutsana',
  '傻逼', '他妈的', '操你', '草泥马', '妈的',
];

export const OBSCENE_WORDS = [
  // English
  'shit', 'shite', 'fuk', 'fck', 'fuc', 'phuck', 'cunt', 'cock', 'cum', 'jizz', 'ass', 'arse', 'bastard', 'slut', 'twat', 'wank', 'prick', 'pussy',
  'nigga', 'fag', 'dyke', 'kike', 'spic', 'chink', 'gook', 'tranny', 'paki', 'retard', 'retarded', 'rape', 'rapist', 'porn', 'porno', 'sex', 'sexy',
  'dick', 'penis', 'vagina', 'dildo', 'boner', 'tits', 'titty', 'boobs', 'nazi', 'hitler', 'horny', 'nude', 'nudes', 'anus', 'butthole', 'dumbass', 'jackass',
  // Greek (script and Latin letters)
  'μαλακας', 'μαλακα', 'πουτσα', 'πουστης', 'πουστη', 'γαμω', 'γαμησε', 'γαμημενος', 'αρχιδια', 'αρχιδι', 'καριολα', 'καριολης', 'σκατα',
  'malaka', 'malakas', 'poutsa', 'poustis', 'pousti', 'gamoto', 'gamisou', 'gamimenos', 'arxidia', 'archidia', 'kariola', 'skata',
  // Spanish, French, German, Italian
  'puta', 'puto', 'mierda', 'pendejo', 'cabron', 'joder', 'merde', 'putain', 'connard', 'salope', 'scheisse', 'scheiss', 'arschloch', 'fotze', 'wichser',
  'cazzo', 'stronzo', 'puttana', 'vaffanculo',
  // Russian
  'хуй', 'хуйня', 'пизда', 'сука', 'блядь', 'блять', 'ебать', 'ебаный', 'пидор', 'пидорас',
];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '+': 't', '€': 'e', '£': 'l', '|': 'i' };
const fold = (t, one = 'i') => t.toLowerCase().replace(/ς/g, 'σ').replace(/ß/g, 'ss').normalize('NFKD').replace(/\p{M}/gu, '')
  .replace(/[0134578@$!+€£|]/gu, c => (c === '1' ? one : (LEET[c] || c)));
const collapse = t => t.replace(/(.)\1+/gu, '$1');
const unplural = t => t.replace(/s$/u, '');

const WORDS = new Set(OBSCENE_WORDS.map(w => fold(w)));
const WORDS_COLLAPSED = new Set(OBSCENE_WORDS.map(w => collapse(fold(w))).filter(w => [...w].length >= 4));
const ANYWHERE = OBSCENE_ANYWHERE.map(w => fold(w));
const ANYWHERE_COLLAPSED = ANYWHERE.map(collapse);

function wordHit(raw) {
  const letters = /\p{L}/u.test(raw);
  const variants = new Set([raw.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/ς/g, 'σ')]);
  if (letters) { variants.add(fold(raw, 'i')); variants.add(fold(raw, 'l')); variants.add(fold(raw, 'i').replace(/l/g, 'i')); /* l read as i: nlgga */ variants.add(fold(raw.replace(/\d+$/u, ''))); variants.add(raw.toLowerCase().replace(/\d+$/u, '')); }
  for (const v of variants) {
    for (const w of [v, unplural(v)]) {
      if (WORDS.has(w)) return true;
      const c = collapse(w);
      if ([...c].length >= 4 && WORDS_COLLAPSED.has(c)) return true;
    }
  }
  return false;
}

/** True when the name contains an obscene or insulting word (see the notes at the top of this file). */
export function isObscene(name) {
  const text = String(name ?? '').replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2');
  const words = text.split(/[\s._\-*,;:/\\~^#()[\]{}<>=]+/u).filter(Boolean);
  if (words.some(wordHit)) return true;
  const joined = [...words].join('');
  if (words.length > 1 && [...joined].length <= 14 && wordHit(joined)) return true;          // "s h i t"
  for (const one of ['i', 'l', 'li']) {
    const f = one === 'li' ? fold(joined, 'i').replace(/l/g, 'i') : fold(joined, one);
    if (ANYWHERE.some(w => f.includes(w))) return true;
    const c = collapse(f);
    if (ANYWHERE_COLLAPSED.some(w => c.includes(w))) return true;
  }
  return false;
}

export const NAUGHTY = 'Naughty Player #';
const NAUGHTY_RE = /^Naughty Player #\d{1,4}$/;

/** The name to show for [raw]: cleaned, and replaced as a whole (never star-masked) when it is obscene. */
export function cleanName(raw, max = 12, rng = Math.random) {
  const s = String(raw ?? '');
  if (NAUGHTY_RE.test(s)) return s;                       // already replaced by the sender
  const n = sanitizeName(s, max);
  return isObscene(n) ? NAUGHTY + (100 + Math.floor(rng() * 900)) : n;
}

const key = n => String(n).normalize('NFKC').toLowerCase().trim();
/** [name] made different from every name in [others]: "Pano" -> "Pano (2)" -> "Pano (3)". */
export function uniqueName(name, others) {
  const taken = new Set(others.filter(Boolean).map(key));
  if (!taken.has(key(name))) return name;
  for (let i = 2; i < 100; i++) { const c = `${name} (${i})`; if (!taken.has(key(c))) return c; }
  return name;
}

/** Country flag emoji for a two-letter code, or '' for anything that is not A-Z A-Z. */
// ---- country codes -> flags. Case-insensitive on input, always canonical (two capitals, a real ISO 3166 region) on output.
const ISO_REGIONS = new Set(('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ '
  + 'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL '
  + 'GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR '
  + 'LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK '
  + 'PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR '
  + 'TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW').split(' '));
const CODE_ALIASES = { EL: 'GR', UK: 'GB' };      // the EU code for Greece and the common (non-ISO) code for the UK
// a browser language with no region ("el") says the country only where one country is by far the main one
const LANG_COUNTRY = { el: 'GR', de: 'DE', fr: 'FR', it: 'IT', ja: 'JP', ko: 'KR', pl: 'PL', ru: 'RU', tr: 'TR', nl: 'NL', sv: 'SE', da: 'DK', fi: 'FI', cs: 'CZ', hu: 'HU', ro: 'RO' };

/**
 * Any spelling of a country -> its canonical two capitals, or '' when it is not a real country: "gr", "GR", "el-GR", "el_gr",
 * "EL" (Greece), "uk". A bare language ("el") is only used when [allowLanguage] is set (browser language, never a typed value).
 */
export function countryCode(c, allowLanguage = false) {
  if (typeof c !== 'string') return '';
  const tag = c.trim().replace(/_/g, '-');
  if (!tag || tag.length > 35) return '';
  const parts = tag.split('-');
  if (allowLanguage && parts.length === 1) return LANG_COUNTRY[tag.toLowerCase()] || '';        // a bare browser language is a language, not a region (sv is Swedish, not El Salvador; ar is Arabic, not Argentina)
  let region = '';
  if (parts.length === 1) { if (/^[A-Za-z]{2}$/.test(tag)) region = tag.toUpperCase(); }
  else region = (parts.slice(1).find(x => /^[A-Za-z]{2}$/.test(x)) || '').toUpperCase();       // el-GR, zh-Hans-CN, en-gb
  if (region) { region = CODE_ALIASES[region] || region; if (ISO_REGIONS.has(region)) return region; }
  return '';
}
export const validCountry = c => countryCode(c) !== '';
export const flagEmoji = c => { const k = countryCode(c); return k ? String.fromCodePoint(...[...k].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65)) : ''; };
