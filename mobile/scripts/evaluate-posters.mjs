// Batch local posters without publishing submissions or using filenames as OCR evidence.
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
const folder=process.argv[2];if(!folder)throw Error('Pass a poster folder');
const files=(await readdir(folder)).filter(n=>/\.(webp|png|jpe?g)$/i.test(n)).sort();
const inputs=await Promise.all(files.map(async name=>({name,image:(await readFile(join(folder,name))).toString('base64')})));
const docker=process.env.DOCKER_PATH||'C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const code=`import sys,json,base64
from server import recognize
for item in json.load(sys.stdin):
 try:
  result=recognize(base64.b64decode(item['image']))
  print('RESULT:'+json.dumps({'file':item['name'],**result},ensure_ascii=False),flush=True)
 except Exception as e:
  print('RESULT:'+json.dumps({'file':item['name'],'error':str(e)},ensure_ascii=False),flush=True)
`;
await mkdir('artifacts',{recursive:true});
const results=[];let pending='',stderr='';
const child=spawn(docker,['exec','-i','citypulse-ocr-1','python','-c',code]);
child.stdout.on('data',chunk=>{pending+=chunk.toString();let end;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);if(line.startsWith('RESULT:')){const row=JSON.parse(line.slice(7));results.push(row);console.log(JSON.stringify({file:row.file,seconds:row.seconds,error:row.error}));}}});
child.stderr.on('data',b=>{stderr+=b});child.stdin.end(JSON.stringify(inputs));
const status=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject)});
await writeFile(process.argv[3]||'artifacts/poster-corpus.json',JSON.stringify(results,null,2));
if(status!==0)throw Error(stderr);
console.log(`Completed ${results.length} posters.`);
