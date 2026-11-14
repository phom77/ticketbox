import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../src/', import.meta.url));
const resources = join(source, 'i18n');
const languages = readdirSync(resources, { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const catalogs = new Map();
const categories = ['zero', 'one', 'two', 'few', 'many', 'other'];
const pluralSuffix = new RegExp(`_(?:${categories.join('|')})$`);

for (const language of languages) {
  const files = readdirSync(join(resources, language)).filter((file) => file.endsWith('.json'));
  const messages = new Map();
  const requiredForms = new Intl.PluralRules(language).resolvedOptions().pluralCategories;
  for (const file of files) {
    const namespace = file.slice(0, -5);
    const entries = JSON.parse(readFileSync(join(resources, language, file), 'utf8'));
    for (const [key, text] of Object.entries(entries)) {
      assert(typeof text === 'string' && text.trim(), `${language}/${namespace}/${key} is empty`);
      const base = key.replace(pluralSuffix, '');
      if (base !== key) {
        for (const form of requiredForms) {
          assert(entries[`${base}_${form}`], `${language}/${namespace}/${base} is missing form ${form}`);
        }
      }
      const id = `${namespace}:${base}`;
      const placeholders = [...new Set([...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]))].sort();
      const expected = messages.get(id);
      if (expected) assert.deepEqual(placeholders, expected, `${language}/${id} plural placeholders differ`);
      messages.set(id, placeholders);
    }
  }
  catalogs.set(language, messages);
}

const english = catalogs.get('en');
assert(english?.size, 'English source catalog is missing');
for (const [language, messages] of catalogs) {
  assert.deepEqual([...messages.keys()].sort(), [...english.keys()].sort(), `${language} translation keys differ`);
  for (const [key, placeholders] of messages) {
    assert.deepEqual(placeholders, english.get(key), `${language}/${key} placeholders differ`);
  }
}

function checkSource(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) checkSource(path);
    else if (/\.tsx?$/.test(entry.name)) {
      const content = readFileSync(path, 'utf8');
      for (const [, key] of content.matchAll(/\b(?:translate|t)\(['"]([\w:.-]+)['"]/g)) {
        const id = key.includes(':') ? key : `common:${key}`;
        assert(english.has(id), `${path} references a missing translation: ${id}`);
      }
    }
  }
}
checkSource(source);
console.log(`Verified ${english.size} message keys across ${languages.length} languages`);
