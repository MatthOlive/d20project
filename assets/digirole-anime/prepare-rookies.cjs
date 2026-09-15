const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '../..');
const catalog = path.join(repo, 'supabase/manual/20260915120000_digirole_updated_xlsx_catalog_v2_parts');
const output = path.join(__dirname, 'rookie');
const references = path.join(__dirname, 'references/rookie');
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(references, { recursive: true });
const rows = [];
for (const file of fs.readdirSync(catalog).filter(name => name.endsWith('_species.sql'))) {
  const sql = fs.readFileSync(path.join(catalog, file), 'utf8');
  const start = sql.indexOf('$catalog$[');
  const end = sql.indexOf(']$catalog$', start);
  if (start >= 0 && end > start) rows.push(...JSON.parse(sql.slice(start + 9, end + 1)));
}
const prompt = 'Premium hand-painted 2D anime trading-card illustration matching the approved Agumon: dynamic perspective, expressive crisp linework, cel shading and painterly highlights. Red and crimson digital rocky landscape with luminous red geometric circuits, floating rocks and warm dramatic rim lighting. Preserve the exact canonical species identity from its selected reference. One subject, readable silhouette, square composition, no card frame, text, logo, watermark or 3D rendering. Reference priority: current Digimon TCG; digimon.net only when an exact TCG identity reference is unavailable.';
const manifest = rows.filter(row => row.stage === 'Rookie').map(row => {
  const alternative = row.name === 'Agumon Saviors';
  const slug = alternative ? 'agumon-alternativo-anime-2006' : row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    name: row.name, canonicalArtName: alternative ? 'Agumon' : row.name,
    alternative, slug, output: path.join(output, slug + '.png'),
    status: row.name === 'Agumon' ? 'reused-approved' : 'awaiting-reference',
    referencePriority: ['Digimon TCG', 'digimon.net'], referenceUrl: null,
    prompt: `Subject: ${alternative ? 'Agumon, 2006 Digimon Savers anime design, as alternate artwork of standard Agumon' : row.name}. ${prompt}`,
  };
});
const agumon = path.join(output, 'agumon.png');
if (!fs.existsSync(agumon)) fs.copyFileSync(path.join(__dirname, 'references/style-approved-agumon.png'), agumon);
fs.writeFileSync(path.join(references, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({total: manifest.length, reused: 1, awaiting: manifest.length - 1, output}));
