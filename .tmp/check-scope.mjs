import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(process.env.TEMP+'/office-futboll-refactor-tools/package.json');
const acorn=require('acorn'), scope=require('eslint-scope');
const allowed=new Set('console Object Array Map Set Math Date Number String Boolean JSON Promise Error URL URLSearchParams performance document window navigator localStorage globalThis WebSocket HTMLElement ResizeObserver devicePixelRatio requestAnimationFrame cancelAnimationFrame setTimeout clearTimeout setInterval clearInterval process Audio'.split(' '));
for(const dir of ['src','shared','server']) for(const file of fs.readdirSync(dir,{recursive:true}).filter(p=>p.endsWith('.js')&&!p.includes('node_modules')&&!p.startsWith('test'))) {
 const p=path.join(dir,file), code=fs.readFileSync(p,'utf8');
 try {const ast=acorn.parse(code,{ecmaVersion:2022,sourceType:'module',ranges:true}); const missing=[...new Set(scope.analyze(ast,{ecmaVersion:2022,sourceType:'module'}).globalScope.through.map(r=>r.identifier.name))].filter(n=>!allowed.has(n)); if(missing.length) console.log(p,missing);} catch(e){console.log(p,e.message);}
}
