const fs = require('node:fs');
const path = require('node:path');
const base = __dirname;
const manifestPath = path.join(base, 'references/rookie/manifest.json');
const norm = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = {huckmon:'jesmon', penmon:'penguinmon', dodokunemon:'dokunemon', syakomon:'syakomon'};
// These forms share card names but require a particular design reference.
const preferred = {'Agumon Saviors':'BT12-034','Argomon (Rookie)':'BT2-042','Burgamon (Rookie)':'BT16-010','Falcomon Saviors':'BT13-081','Kudamon Saviors':'BT13-034'};
const ambiguous = new Set(['Falcomon','Kudamon']);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function download(url, target) {
  const result = await fetch(url, {signal: AbortSignal.timeout(25000)});
  if (!result.ok) throw Error('HTTP ' + result.status);
  const bytes = Buffer.from(await result.arrayBuffer());
  const type = result.headers.get('content-type') || '';
  if (!type.startsWith('image/') || bytes.length < 500) throw Error('Invalid image');
  fs.writeFileSync(target, bytes);
}
async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const cache = path.join(base, 'references/rookie/tcg-index.json');
  const cards = fs.existsSync(cache) ? JSON.parse(fs.readFileSync(cache, 'utf8')) : await (await fetch('https://digimoncard.io/api-public/getAllCards?series=Digimon%20Card%20Game')).json();
  if (!Array.isArray(cards)) throw Error('Invalid TCG index');
  fs.writeFileSync(cache, JSON.stringify(cards));
  const netSource = fs.readFileSync(path.join(base, '../../src/lib/digimon-net-images.generated.ts'), 'utf8');
  const net = Object.fromEntries([...netSource.matchAll(/^\s*"([^"]+)":\s*"([^"]+)"/gm)].map(match => [match[1], match[2]]));
  for (const row of manifest) {
    if (row.status === 'reused-approved' || row.referencePath && fs.existsSync(row.referencePath)) continue;
    let key = norm(row.name);
    // Huckmon is called Huckmon in the English TCG, not its final evolution Jesmon.
    if (key !== 'huckmon') key = aliases[key] || key;
    const matches = cards.filter(card => norm(card.name) === key);
    row.tcgCandidates = matches.map(card => card.cardnumber);
    let card = preferred[row.name] || (!ambiguous.has(row.name) && matches.at(-1)?.cardnumber);
    const dir = path.join(base, 'references/rookie');
    if (card) {
      try {
        const url = 'https://images.digimoncard.io/images/cards/' + card + '.webp';
        const target = path.join(dir, row.slug + '-tcg.webp');
        await download(url, target);
        row.referenceUrl = url; row.referencePath = target; row.referenceSource = 'Digimon TCG'; row.card = card; row.status = 'reference-ready';
      } catch(error) {row.tcgError = String(error.message);}
    }
    if (!row.referencePath) {
      const url = net[norm(row.name)];
      if (url) {
        try {
          const target = path.join(dir, row.slug + '-official.jpg');
          await download(url, target);
          row.referenceUrl = url; row.referencePath = target; row.referenceSource = 'digimon.net'; row.status = 'reference-ready';
        } catch(error) {row.referenceError = String(error.message);}
      } else row.referenceError = 'Exact reference not found';
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(row.name + ': ' + (row.referenceSource || row.referenceError));
    await delay(800);
  }
  console.log(JSON.stringify({tcg:manifest.filter(row=>row.referenceSource==='Digimon TCG').length,official:manifest.filter(row=>row.referenceSource==='digimon.net').length,missing:manifest.filter(row=>!row.referencePath&&row.status!=='reused-approved').map(row=>row.name)}));
}
main().catch(error => {console.error(error);process.exitCode=1;});
