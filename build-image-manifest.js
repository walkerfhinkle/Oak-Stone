#!/usr/bin/env node
/* Oak & Stone - build images/manifest.json from the photo folders.
 *
 *   node build-image-manifest.js
 *   node build-image-manifest.js --dry        (report only, write nothing)
 *
 * Reads whatever is in the folders - no renaming required. Your Printful
 * filenames already carry everything this needs:
 *
 *   classic-dad-hat-black-main-6ae28024d8834.jpg
 *                     ^^^^^ ^^^^
 *                     colour, and the word that makes it the card image
 *
 * Folder layout (names come from the Direct Store Name column of the pricing
 * workbook, which is also what the site shows):
 *
 *   images/
 *     Men/
 *       Resurface - Oak & Stone Denim Tee/
 *         denim-black-main.jpg
 *         denim-black-back.jpg
 *         denim-garnet-red-main.jpg
 *     Women/
 *       I See You - Oak & Stone Black Yoga Pants/
 *         ...
 *
 * The top folder matters: a unisex product listed on both pages can have its
 * own photos in Men/ and in Women/, and each page shows its own set. Put it in
 * only one and both pages use that one.
 *
 * Output groups images by department and by colourway, so the site can show a
 * single consistent colour at a time rather than a mixed bag.
 */

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, relative, dirname, basename, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(ROOT, 'images');
const SITE_FILE = process.env.SITE_FILE || join(ROOT, 'index.html');
const OUT = join(IMAGES_DIR, 'manifest.json');
const DRY = process.argv.includes('--dry');

/* --explain "<part of a product name>" prints, for every file in that
   product's folder, which colourway it was assigned to and which angle word
   decided its position. When an image shows up in the wrong order this says
   why in one screen, instead of guessing from the rendered page. */
const EXPLAIN = (() => {
  const i = process.argv.indexOf('--explain');
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1].toLowerCase() : null;
})();

const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const MAX_PER_SET = 8;
const SKIP_FILES = /^(favicon|oak-stone-(mark|wordmark)|tile-|hero)/i;

/* ---- text normalising ---------------------------------------------------- */
const norm = (s) => String(s || '')
  // Split camelCase before lowercasing: Windows forbids "/" in a folder name,
  // so "Front/Back - ..." is "FrontBack - ..." on disk and would otherwise
  // tokenise to one word sharing nothing with {front, back}.
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/['‘’]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const slug = (s) => norm(s).replace(/\s+/g, '-');
const tokens = (s) => new Set(norm(s).split(' ').filter(t => t.length > 2));

/* Token weights from the product list itself. A plain overlap count fails here
   because "oak" and "stone" are in every product name, so every folder scores
   about the same against everything. Inverse document frequency makes the brand
   words worth nothing and the distinguishing words - "dark", "leggings",
   "tomato" - worth almost everything. It is also what stops "Basic Dark Tee"
   matching the "Basic Light Tee" folder. */
let WEIGHTS = new Map();
function buildWeights(names) {
  const df = new Map();
  for (const n of names) for (const t of tokens(n)) df.set(t, (df.get(t) || 0) + 1);
  const N = names.length || 1;
  const w = new Map();
  for (const [t, c] of df) w.set(t, Math.log((N + 1) / (c + 0.5)));
  return w;
}
const weightOf = (t) => (WEIGHTS.has(t) ? WEIGHTS.get(t) : Math.log(32));

function score(productName, folderName) {
  const a = tokens(productName), b = tokens(folderName);
  if (!a.size || !b.size) return 0;
  let hit = 0, total = 0;
  for (const t of a) { const w = weightOf(t); total += w; if (b.has(t)) hit += w; }
  return total ? hit / total : 0;
}

/* ---- ordering ------------------------------------------------------------ */
const ORDER = ['main', 'front', 'back', 'side', 'detail', 'flat', 'model', 'lifestyle'];
function rank(file) {
  const n = basename(file).toLowerCase();
  for (let i = 0; i < ORDER.length; i++) if (n.includes(ORDER[i])) return i;
  return ORDER.length;
}
const sortFiles = (list) => list.slice().sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

/* Printful sometimes exports the same mockup under two names - a "-main-" and
 * a "-front-" copy carrying the same trailing id. Keeping both shows the
 * identical photo twice in the first two slots. The id is the last hyphenated
 * chunk of the filename, so dedupe on it and keep whichever sorted first
 * (which, after sortFiles, is the better-named one). */
function dedupeById(list) {
  const seen = new Set();
  const out = [];
  for (const f of list) {
    const base = basename(f, extname(f));
    const id = base.split('-').pop();
    // Only treat it as an id when it looks like one; otherwise keep the file.
    const key = /^[0-9a-f]{8,}$/i.test(id) ? id : f;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/* ---- colour detection ----------------------------------------------------
 * Matched against the product's own declared colour list rather than guessed
 * from the filename, so a name only counts as a colour if the product actually
 * comes in it. Longest first: "Heather Midnight Navy" must win over "Navy",
 * otherwise every heather variant collapses into the plain colour. */
function detectColor(file, colorSlugs) {
  const f = slug(basename(file, extname(file)));
  for (const { name, s } of colorSlugs) {
    if (f.includes(s)) return name;
  }
  return null;
}

async function walk(dir, out = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (IMG_EXT.has(extname(e.name).toLowerCase())) out.push(full);
  }
  return out;
}

const DEPT_ALIASES = { men: 'men', mens: 'men', women: 'women', womens: 'women' };

async function main() {
  let html;
  try { html = await readFile(SITE_FILE, 'utf8'); }
  catch {
    console.error(`Could not read ${SITE_FILE}.`);
    console.error('Run this from the folder that holds index.html, or set SITE_FILE.');
    process.exit(1);
  }
  const m = html.match(/const PRODUCTS = (\[[\s\S]*?\n\]);/);
  if (!m) { console.error('Could not find the PRODUCTS array in the page.'); process.exit(1); }
  let products;
  try { products = JSON.parse(m[1]); }
  catch (e) { console.error('PRODUCTS is not parseable JSON: ' + e.message); process.exit(1); }

  try { await stat(IMAGES_DIR); }
  catch { console.error(`No images folder at ${IMAGES_DIR}`); process.exit(1); }

  const files = (await walk(IMAGES_DIR))
    .filter(f => !SKIP_FILES.test(basename(f)))
    .filter(f => relative(IMAGES_DIR, f).includes(sep));   // top-level files are site art

  // folder (relative) -> { dept, files[] }
  const byFolder = new Map();
  for (const f of files) {
    const rel = relative(IMAGES_DIR, f);
    const folder = dirname(rel);
    const top = folder.split(sep)[0].toLowerCase();
    if (!byFolder.has(folder)) {
      byFolder.set(folder, { dept: DEPT_ALIASES[top] || 'all', files: [] });
    }
    byFolder.get(folder).files.push(rel.split(sep).join('/'));
  }

  console.log(`Scanning ${IMAGES_DIR}`);
  console.log(`  ${files.length} image file(s) in ${byFolder.size} folder(s)\n`);

  WEIGHTS = buildWeights(products.map(p => p.directName || p.short || p.name));

  /* Match per department, so a unisex product can hold one folder under Men and
     another under Women without the two competing for the same slot. */
  const depts = [...new Set([...byFolder.values()].map(v => v.dept))];
  const claimed = new Map();     // `${productId}|${dept}` -> folder
  const usedFolders = new Set();
  const nearMiss = new Map();    // productId -> best pair seen, for the report
  const THRESHOLD = 0.6;

  for (const dept of depts) {
    const folders = [...byFolder.entries()].filter(([, v]) => v.dept === dept).map(([k]) => k);
    const pairs = [];
    for (const p of products) {
      const want = p.directName || p.short || p.name;
      for (const folder of folders) {
        const leaf = folder.split(sep).pop();
        const s = Math.max(score(want, leaf), score(leaf, want));
        if (s > 0) pairs.push({ p, want, folder, s });
      }
    }
    pairs.sort((a, b) => b.s - a.s);
    for (const pair of pairs) {
      const prev = nearMiss.get(pair.p.id);
      if (!prev || pair.s > prev.s) nearMiss.set(pair.p.id, pair);
      if (pair.s < THRESHOLD) continue;
      const key = `${pair.p.id}|${dept}`;
      if (claimed.has(key) || usedFolders.has(pair.folder)) continue;
      claimed.set(key, pair.folder);
      usedFolders.add(pair.folder);
    }
  }

  const manifest = { version: 2, generated_at: new Date().toISOString(), products: {} };
  const report = [];
  const missingColors = [];

  for (const p of products) {
    const want = p.directName || p.short || p.name;
    const colorSlugs = (p.colors || [])
      .map(c => ({ name: c.name, s: slug(c.name) }))
      .filter(c => c.s)
      .sort((a, b) => b.s.length - a.s.length);   // longest wins

    const entry = { name: want, depts: {} };
    let any = false;

    for (const dept of ['men', 'women', 'all']) {
      const folder = claimed.get(`${p.id}|${dept}`);
      if (!folder) continue;
      any = true;
      const all = sortFiles(byFolder.get(folder).files);
      const byColor = {};
      const noColor = [];
      for (const f of all) {
        const c = detectColor(f, colorSlugs);
        if (c) (byColor[c] = byColor[c] || []).push(f);
        else noColor.push(f);
      }
      // Files whose name carries no recognisable colour still belong to the
      // product - attach them to every colourway so a shot of a detail or a
      // size chart is not lost just because it is colour-neutral.
      //
      // Sorted SEPARATELY and then concatenated, never merged and re-sorted.
      // Sorting the combined list ranks by angle first and filename second, so
      // a colour-neutral lifestyle shot called "...-main-model.jpg" competes
      // with the colourway's own "...-white-main.jpg" - and wins whenever the
      // colour name sorts after "main". That is why the main image jumped to
      // second place for White but not for Athletic Heather. Keeping the
      // colour's own files as a block guarantees its main photo always leads.
      const neutral = dedupeById(sortFiles(noColor));
      for (const c of Object.keys(byColor)) {
        byColor[c] = dedupeById(sortFiles(byColor[c])).concat(neutral).slice(0, MAX_PER_SET);
      }

      if (EXPLAIN && want.toLowerCase().includes(EXPLAIN)) {
        console.log(`\n--- explain: ${want} (${dept}) ---`);
        console.log(`folder: ${folder}`);
        console.log(`declared colours: ${(p.colors || []).map(c => c.name).join(', ') || '(none)'}\n`);
        console.log('  every file, as the builder read it:');
        for (const f of all) {
          const c = detectColor(f, colorSlugs);
          const r = rank(f);
          const word = r < ORDER.length ? ORDER[r] : '(no angle word)';
          console.log(`    ${basename(f)}`);
          console.log(`        colour: ${c || '(none detected -> shown for every colourway)'}`);
          console.log(`        angle:  ${word}  [sort rank ${r}]`);
        }
        console.log('\n  resulting order per colourway:');
        for (const [c, list] of Object.entries(byColor)) {
          console.log(`    ${c}:`);
          list.forEach((f, i) => console.log(`      ${i + 1}. ${basename(f)}`));
        }
        console.log('');
      }
      entry.depts[dept] = {
        all: all.slice(0, MAX_PER_SET),
        byColor: Object.keys(byColor).length ? byColor : null
      };

      const declared = (p.colors || []).map(c => c.name);
      const got = Object.keys(byColor);
      const missing = declared.filter(c => !got.includes(c));
      report.push({
        id: p.id, want, dept, folder, n: all.length, colors: got,
        hidden: !!p.hidden,
        // Files carrying no recognisable colour. A couple is normal (a size
        // chart, a fabric close-up). A lot of them usually means the filenames
        // spell a colour differently from the workbook - "navy" against a
        // declared "Heather Midnight Navy", say - and that is worth seeing
        // rather than guessing at.
        noColor: noColor.slice(0, 3),
        noColorCount: noColor.length
      });
      if (declared.length && missing.length) {
        missingColors.push({ want, dept, missing, got, noColor: noColor.slice(0, 3), declared });
      }
    }

    if (any) manifest.products[p.id] = entry;
  }

  /* ---- report ---- */
  for (const r of report) {
    console.log(`  ${r.hidden ? 'off  ' : 'ok   '} ${r.want}${r.hidden ? '   (withdrawn - not shown)' : ''}`);
    console.log(`        ${r.dept.padEnd(5)} ${r.folder} -> ${r.n} image(s)`);
    if (r.colors.length) console.log(`        colorways with photos: ${r.colors.join(', ')}`);
    else console.log(`        no colour detected in any filename - all images used for every colorway`);
  }

  const noFolder = products.filter(p => !manifest.products[p.id]);
  if (noFolder.length) {
    console.log(`\n${noFolder.length} product(s) with no folder:`);
    for (const p of noFolder) {
      const want = p.directName || p.short || p.name;
      const near = nearMiss.get(p.id);
      console.log(`  --    ${want}`);
      if (near) console.log(`        closest was "${near.folder}" (${near.s.toFixed(2)})`);
    }
  }

  const spare = [...byFolder.keys()].filter(f => !usedFolders.has(f));
  if (spare.length) {
    console.log(`\n${spare.length} folder(s) not matched to any product:`);
    for (const f of spare) console.log(`  ?     ${f}`);
    console.log('  (rename to the Direct Store Name, or ignore if intentional)');
  }

  if (missingColors.length) {
    console.log(`\nColorways with no photos — selecting these on the site falls back`);
    console.log(`to the product's default images:`);
    for (const mc of missingColors) {
      console.log(`  !     ${mc.want} (${mc.dept})`);
      console.log(`        missing: ${mc.missing.join(', ')}`);
      // If the colour is missing AND there are unrecognised files, the photos
      // probably exist under a different spelling. Show both sides so the
      // mismatch is obvious instead of having to open the folder.
      if (mc.noColor.length) {
        console.log(`        but ${mc.noColor.length === 3 ? '3+' : mc.noColor.length} file(s) here have no colour this product declares:`);
        for (const f of mc.noColor) console.log(`          ${basename(f)}`);
        console.log(`        declared colours: ${mc.declared.join(', ')}`);
        console.log(`        -> if one of those files IS the missing colour, make the`);
        console.log(`           filename or the workbook's colour name agree.`);
      }
    }
  }

  const liveTotal = products.filter(p => !p.hidden).length;
  const liveMatched = Object.keys(manifest.products).filter(id =>
    !(products.find(p => p.id === id) || {}).hidden).length;
  console.log(`\n${liveMatched} of ${liveTotal} live products have photos.`);
  const off = Object.keys(manifest.products).length - liveMatched;
  if (off) console.log(`${off} withdrawn product(s) also have photos, kept for later.`);

  if (DRY) { console.log('\n--dry: nothing written.'); return; }
  await writeFile(OUT, JSON.stringify(manifest, null, 1));
  console.log(`Wrote ${OUT}`);
  console.log('Reload the site - the grid picks it up automatically.');
}

main().catch(e => { console.error(e); process.exit(1); });
