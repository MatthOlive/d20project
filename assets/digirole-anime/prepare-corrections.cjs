const fs=require('node:fs'),path=require('node:path');
const base=__dirname,dir=path.join(base,'corrections-20260911');
const specs=[
['in-training-ii','sakuttomon','Missing artwork; preserve exact official anatomy.'],
['in-training-ii','gurimon','Head only. No torso, legs or separate body.'],
['in-training-ii','nyaromon','Rebuild round head and long striped tail faithfully.'],
['in-training-ii','tumblemon','Rebuild exact official stone body with single eye.'],
['in-training-ii','viximon','Rebuild exact official proportions, ears and tail.'],
['rookie','agumon-alternativo-anime-2006','Restore missing claw on anatomical right hand. Exactly three claws per hand. Keep red wrist straps.'],
['rookie','bearmon','One diagonal chest belt; gloves made from belts wrapped around both hands.'],
['rookie','betamon-x-antibody','Non-humanoid low-slung amphibian anatomy, never an upright human torso.'],
['rookie','burgamon-rookie','Burgamon Rookie only. Old image was wrong species Helloogarmon.','BT12-046'],
['rookie','chiropmon','No legs. Preserve canonical winged body.'],
['rookie','gaomon','Boxing gloves on both hands, no red scarf or cloth across chest.'],
['rookie','gazimon-x-antibody','Both tails pass behind torso and hind leg, never through or in front of that leg.'],
['rookie','ghostmon','New composition and reference; canonical ghost anatomy.','BT4-077'],
['rookie','gumdramon','Exactly two legs. Separate tail with hammer-shaped tip, not a third leg.'],
['rookie','hawkmon','Two complete visible legs.'],
['rookie','kakamon','Correct pants drawstring hanging from waistband, simple textile cord, not anatomical appendage.'],
['rookie','penmon','Both flipper arms must be visible.'],
['rookie','psychemon','Rebuild correct proportions and anatomy.'],
['rookie','pulsemon','Dark shapes are feet. Show two correct separate feet attached to two legs.','BT6-033'],
['rookie','renamon-x-antibody','Two separate tails. No wings.'],
['rookie','salamon','Four legs, both front paws visible.'],
['rookie','sistermon-blanc-awakened','Correct Awakened form, anatomy, limb count, outfit and accessories.'],
['rookie','sparrowmon','New reference, faithful mechanical avian aircraft anatomy.','BT10-060'],
['rookie','swimmon','New reference, faithful fish body, fins and tail.','BT12-020'],
['rookie','tapirmon','Only front legs; cloud replaces hindquarters. No hind legs or rear paws.'],
['rookie','toyagumon','Correct toy-block dinosaur assembly, separated rectangular head, limbs and tail.'],
['rookie','veemon','TCG reference, faithful blue dinosaur anatomy and white chest.','ST8-04'],
['rookie','vorvomon','Correct dragon anatomy, wing attachment and limb count.'],
['rookie','wormmon','Correct caterpillar segmentation and paired feet, no fused anatomy.'],
['rookie','zenimon','Exactly one Zenimon, no crowd, merged bodies or extra faces.']
];
fs.mkdirSync(path.join(dir,'references'),{recursive:true});
const source=fs.readFileSync(path.join(base,'../../src/lib/digimon-net-images.generated.ts'),'utf8');
const net=Object.fromEntries([...source.matchAll(/^\s*"([^"]+)":\s*"([^"]+)"/gm)].map(m=>[m[1],m[2]]));
async function download(url,file){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok||!(r.headers.get('content-type')||'').startsWith('image/'))throw Error('Invalid image '+r.status);fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));}
async function main(){const jobs=[];for(const [stage,slug,correction,card] of specs){
const m=JSON.parse(fs.readFileSync(path.join(base,'references',stage,'manifest.json'),'utf8'));
const item=m.find(x=>x.slug===slug);if(!item)throw Error(slug);
const job={name:item.name,stage,slug,correction,old:path.join(base,stage,slug+'.png'),output:path.join(dir,stage,slug+'-v2.png'),reference:item.referencePath||path.resolve(base,'../..',item.reference),official:null};
fs.mkdirSync(path.join(dir,stage),{recursive:true});
if(card){const f=path.join(dir,'references',slug+'-tcg.webp');try{if(!fs.existsSync(f))await download('https://images.digimoncard.io/images/cards/'+card+'.webp',f);job.reference=f;job.card=card;}catch(e){job.newReferenceError=e.message;}}
const url=net[item.name.toLowerCase().replace(/[^a-z0-9]/g,'')];
if(stage==='rookie'&&url){const f=path.join(dir,'references',slug+'-official.jpg');try{if(!fs.existsSync(f))await download(url,f);job.official=f;}catch(e){job.officialError=e.message;}}
jobs.push(job);fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(jobs,null,2));console.log(item.name+': '+(job.newReferenceError||'ready'));
}console.log('COUNT='+jobs.length);}
main().catch(e=>{console.error(e);process.exitCode=1;});
