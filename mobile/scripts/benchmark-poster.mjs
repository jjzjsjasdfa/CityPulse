// Read-only OCR benchmark. Personal posters and output remain in ignored artifacts.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const path=process.argv[2];if(!path)throw new Error('Pass a poster path');
const output=process.argv[3]||'artifacts/poster-benchmark.json';
const docker=process.env.DOCKER_PATH||'C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const code=`import io,json,sys
from PIL import Image,ImageFilter
from server import recognize
data=sys.stdin.buffer.read()
im=Image.open(io.BytesIO(data)).convert('RGB')
variants=[('original',im),('half_resolution',im.resize((im.width//2,im.height//2))),('blurred',im.filter(ImageFilter.GaussianBlur(1.2)))]
for name,image in variants:
 b=io.BytesIO();image.save(b,'PNG')
 r=recognize(b.getvalue());r['variant']=name
 print('BENCHMARK:'+json.dumps(r,ensure_ascii=False),flush=True)
`;
const child=spawn(docker,['exec','-i','citypulse-ocr-1','python','-c',code],{stdio:['pipe','pipe','pipe']});
let stdout='',stderr='';child.stdout.on('data',b=>{stdout+=b});child.stderr.on('data',b=>{stderr+=b});
child.stdin.end(await readFile(path));
const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve)});
if(exit!==0)throw new Error(stderr);
const results=stdout.split('\n').filter(l=>l.startsWith('BENCHMARK:')).map(l=>JSON.parse(l.slice(10)));
await mkdir('artifacts',{recursive:true});await writeFile(output,JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(({variant,text,seconds,passes})=>({variant,text,seconds,passes})),null,2));
