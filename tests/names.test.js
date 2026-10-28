import test from 'node:test';
import assert from 'node:assert/strict';
import { isObscene, cleanName, uniqueName, flagEmoji, validCountry, countryCode, NAUGHTY } from '../js/names.js';

test('obscene names are caught, including the usual disguises', () => {
  for (const n of ['fuck', 'FUCK', 'F.u.c.k', 'f u c k', 'xXfuckXx', 'fuuuuuck', 'Sh1t', '$hit', 'BigShit', 's h i t', 'a55', 'Βρομοbitch', 'Μαλάκας', 'ΜΑΛΑΚΑΣ', 'malakas', 'poutsa', 'пизда', 'Хуй', '傻逼', 'nigger', 'Tits', 'cunt', 'Cunts', 'puta', 'Scheiße', 'd1ck', 'D.i.c.k', 'dicks', 'pu$$y', 'nlgga', 'n1gga', 'Pussy'])
    assert.ok(isObscene(n), n);
});
test('innocent names that merely contain a bad string are NOT flagged (Scunthorpe problem)', () => {
  for (const n of ['Scunthorpe', 'Assassin', 'Bass', 'Class', 'Grape', 'Penistone', 'Cumberland', 'Sussex', 'Essex', 'Cockney', 'Analyst', 'Arsenal', 'Titan', 'Bitcoin',
    'Mary Sue', 'Pano', 'Αλέξανδρος', 'José', '李小龙', 'محمد', '😀🔥', '$*Cool*$', '455', 'Fighter', 'Pano (2)', 'Dickens', 'Pussycat', 'Retardant', 'Kristiano'])
    assert.equal(isObscene(n), false, n);
});
test('an obscene name is replaced as a whole with "Naughty Player #" + a number, never masked with stars', () => {
  const n = cleanName('fuck', 12, () => 0.5);
  assert.equal(n, NAUGHTY + '550');
  assert.match(cleanName('Sh1t'), /^Naughty Player #\d{3}$/);
  assert.ok(!n.includes('*'));
  assert.equal(cleanName('Pano'), 'Pano');
  assert.equal(cleanName('  '), 'Fighter');
  assert.equal(cleanName('Naughty Player #123'), 'Naughty Player #123', 'a replacement made by the sender is not cut to 12 characters');
  assert.match(cleanName('Naughty Player #12345678'), /^Naughty Play/, 'but a look-alike with a long tail is just cut');
});
test('the same name twice is numbered: Pano and Pano (2)', () => {
  assert.equal(uniqueName('Pano', ['Pano']), 'Pano (2)');
  assert.equal(uniqueName('pano', ['Pano']), 'pano (2)', 'case does not matter');
  assert.equal(uniqueName('Pano', ['Pano', 'Pano (2)']), 'Pano (3)');
  assert.equal(uniqueName('Pano', ['Ida', '']), 'Pano');
  assert.equal(uniqueName('Μαρία', ['μαρία']), 'Μαρία (2)');
});
test('country flags: any case, region tags and the EU/UK aliases work; anything that is not a real country gives NO flag', () => {
  assert.equal(flagEmoji('GR'), '🇬🇷');
  for (const ok of ['gr', 'Gr', 'GR', ' gr ', 'el-GR', 'el-gr', 'el_GR', 'zh-Hans-CN', 'EL', 'el']) assert.equal(validCountry(ok), true, ok);
  assert.equal(flagEmoji('gr'), '🇬🇷'); assert.equal(flagEmoji('el-GR'), '🇬🇷'); assert.equal(flagEmoji('EL'), '🇬🇷'); assert.equal(flagEmoji('uk'), '🇬🇧');
  assert.equal(countryCode('zh-Hans-CN'), 'CN'); assert.equal(countryCode('en-us'), 'US');
  for (const bad of ['GRC', 'G', '', null, undefined, '<s', '12', 'ZZ', 'QQ', 42, 'a'.repeat(50)]) { assert.equal(validCountry(bad), false, String(bad)); assert.equal(flagEmoji(bad), ''); }
});

test('browser language to country: a region wins, a bare language maps only where one country is the obvious one', () => {
  assert.equal(countryCode('el-GR', true), 'GR');
  assert.equal(countryCode('el', true), 'GR');
  assert.equal(countryCode('ja'), '', 'typed "ja" is not a country'); assert.equal(countryCode('ja', true), 'JP', 'but the browser language "ja" is Japan');
  assert.equal(countryCode('cs', true), 'CZ'); assert.equal(countryCode('de', true), 'DE');
  assert.equal(countryCode('en', true), '', 'English is spoken in too many countries: no flag');
  assert.equal(countryCode('sv', true), 'SE', 'Swedish, not El Salvador'); assert.equal(countryCode('ar', true), '', 'Arabic, not Argentina'); assert.equal(countryCode('es', true), '', 'Spanish: too many countries');
  assert.equal(countryCode('xx', true), '');
  assert.equal(flagEmoji(countryCode('el', true)), '🇬🇷');
});
