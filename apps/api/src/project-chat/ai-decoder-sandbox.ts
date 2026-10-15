import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { AiError } from './ai-registry';

let active = 0;

async function decode(
  command: string[],
  mounts: string[],
  bytes: Buffer | string,
  maxBuffer: number,
  errorCode: string,
  signal?: AbortSignal,
  addressSpace = 536_870_912,
) {
  signal?.throwIfAborted();
  if (Buffer.isBuffer(bytes) && (!bytes.length || bytes.length > 8_000_000))
    throw new AiError('INPUT_TOO_LARGE');
  if (process.getuid?.() === 0) throw new AiError(errorCode);
  if (active >= 2) throw new AiError('DOCUMENT_DECODER_BUSY');
  active++;
  try {
    return await new Promise<Buffer>((done, reject) => {
      const child = execFile(
        '/usr/bin/bwrap',
        [
          '--unshare-all',
          '--new-session',
          '--die-with-parent',
          '--clearenv',
          '--cap-drop',
          'ALL',
          '--ro-bind',
          '/usr',
          '/usr',
          '--ro-bind',
          '/lib',
          '/lib',
          '--ro-bind',
          '/lib64',
          '/lib64',
          '--ro-bind',
          '/etc/fonts',
          '/etc/fonts',
          '--proc',
          '/proc',
          '--dev',
          '/dev',
          '--tmpfs',
          '/tmp',
          '--chdir',
          '/tmp',
          '--setenv',
          'HOME',
          '/tmp',
          '--setenv',
          'PATH',
          '/usr/bin',
          '--setenv',
          'LANG',
          'C.UTF-8',
          ...mounts,
          '--remount-ro',
          '/dev',
          '--remount-ro',
          '/tmp',
          '--remount-ro',
          '/',
          '/usr/bin/prlimit',
          `--as=${addressSpace}`,
          '--cpu=4',
          '--nofile=64',
          '--nproc=32',
          '/usr/bin/timeout',
          '--signal=KILL',
          '5',
          ...command,
        ],
        {
          env: {},
          encoding: 'buffer',
          timeout: 6000,
          killSignal: 'SIGKILL',
          maxBuffer,
          signal,
        },
        (error, output) =>
          error
            ? reject(
                new AiError(signal?.aborted ? 'REQUEST_CANCELLED' : errorCode),
              )
            : done(output),
      );
      child.stdin?.on('error', () => {});
      child.stdin?.end(Buffer.isBuffer(bytes) ? bytes : undefined);
    });
  } finally {
    active--;
  }
}

export async function pdfProcess(
  operation: 'pdfinfo' | 'pdftotext' | 'pdftoppm',
  args: string[],
  bytes: Buffer | string,
  maxBuffer: number,
  errorCode: string,
  signal?: AbortSignal,
) {
  try {
    const configured = process.env.GALAXY_AI_PDFINFO ?? '/usr/bin/pdfinfo';
    if (!isAbsolute(configured)) throw new AiError(errorCode);
    const binary = realpathSync(join(dirname(configured), operation));
    const mounts = ['--ro-bind', binary, '/decoder/' + operation];
    if (typeof bytes === 'string') {
      if (!isAbsolute(bytes)) throw new AiError(errorCode);
      const file = await lstat(bytes);
      if (!file.isFile() || file.isSymbolicLink()) throw new AiError(errorCode);
      mounts.push('--ro-bind', bytes, '/input/source.pdf');
    }
    const libraries = process.env.GALAXY_AI_PDF_LIBRARY_PATH?.split(':') ?? [];
    if (libraries.length > 4) throw new AiError(errorCode);
    for (const [i, library] of libraries.entries()) {
      if (!isAbsolute(library) || library === '/') throw new AiError(errorCode);
      mounts.push('--ro-bind', realpathSync(library), '/decoder-libs/' + i);
    }
    if (libraries.length)
      mounts.push(
        '--setenv',
        'LD_LIBRARY_PATH',
        libraries.map((_, i) => '/decoder-libs/' + i).join(':'),
      );
    return await decode(
      ['/decoder/' + operation, ...args],
      mounts,
      bytes,
      maxBuffer,
      errorCode,
      signal,
    );
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw new AiError(signal?.aborted ? 'REQUEST_CANCELLED' : errorCode);
  }
}

export async function decodeImage(bytes: Buffer, signal?: AbortSignal) {
  try {
    const dependencies = realpathSync(
      resolve(__dirname, '../../../../node_modules'),
    );
    const entry = relative(
      dependencies,
      createRequire(__filename).resolve('sharp'),
    );
    if (entry.startsWith('..') || isAbsolute(entry))
      throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
    const program = `const sharp=require(${JSON.stringify('/modules/' + entry)});sharp.concurrency(1);let size=0;const chunks=[];process.stdin.on('data',b=>{size+=b.length;if(size>8000000)process.exit(1);chunks.push(b)});process.stdin.on('end',async()=>{try{await sharp(Buffer.concat(chunks),{limitInputPixels:8000000,failOn:'warning'}).raw().timeout({seconds:3}).toBuffer();process.stdout.write('OK')}catch{process.exit(1)}});`;
    const output = await decode(
      [
        '/decoder/node',
        '--max-old-space-size=128',
        '--max-semi-space-size=4',
        '-e',
        program,
      ],
      [
        '--ro-bind',
        dependencies,
        '/modules',
        '--ro-bind',
        realpathSync(process.execPath),
        '/decoder/node',
      ],
      bytes,
      4096,
      'DOCUMENT_IMAGE_UNAVAILABLE',
      signal,
      2_147_483_648,
    );
    if (output.toString() !== 'OK')
      throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
  }
}

const workbookProgram = String.raw`
import json,os,posixpath,re,struct,sys,zipfile
from xml.parsers import expat
source='/input/source.xlsx'
size=os.stat(source).st_size
with open(source,'rb') as stream:
 stream.seek(max(0,size-65557));tail=stream.read(65557)
end=tail.rfind(b'PK\x05\x06')
assert end>=0 and end+22<=len(tail)
record=struct.unpack('<4s4H2IH',tail[end:end+22])
assert record[1]==record[2]==0 and record[3]==record[4] and record[4]<=512
assert record[5]<=262144 and record[6]+record[5]<=size and end+22+record[7]==len(tail)
book=zipfile.ZipFile(source)
parts=book.infolist()
assert len(parts)==record[4] and len({p.filename.casefold() for p in parts})==len(parts)
assert all(len(p.filename)<=256 and not p.filename.startswith('/') and '..' not in p.filename.split('/') and '\\' not in p.filename and not p.flag_bits&1 and p.compress_type in (0,8) for p in parts)
assert not any(p.filename.lower().endswith(('vbaproject.bin','.vba')) for p in parts)
total=0

def reject(*args):raise ValueError('forbidden XML declaration')
def local(name):return name.rsplit('}',1)[-1]
def xml(path,start,stop,text=lambda value:None):
 global total
 entry=book.getinfo(path)
 assert entry.file_size<=33554432
 parser=expat.ParserCreate(namespace_separator='}')
 parser.StartDoctypeDeclHandler=reject;parser.EntityDeclHandler=reject;parser.ExternalEntityRefHandler=reject
 parser.StartElementHandler=lambda name,attrs:start(local(name),attrs)
 parser.EndElementHandler=lambda name:stop(local(name))
 parser.CharacterDataHandler=text
 read=0
 with book.open(entry) as stream:
  while True:
   part=stream.read(65536)
   if not part:break
   read+=len(part);total+=len(part)
   assert read<=33554432 and total<=134217728
   parser.Parse(part,False)
  parser.Parse(b'',True)
 assert read==entry.file_size

sheets=[];relationships={};date1904=False

def workbook_start(name,attrs):
 global date1904
 if name=='sheet':
  assert len(sheets)<100 and 0<len(attrs['name'])<=100
  sheets.append({'name':attrs['name'],'id':attrs['http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']})
 if name=='workbookPr':date1904=attrs.get('date1904','0') in ('1','true')
xml('xl/workbook.xml',workbook_start,lambda name:None)
assert sheets and len({s['name'] for s in sheets})==len(sheets)

def relationship(name,attrs):
 if name=='Relationship' and attrs.get('Type','').endswith('/worksheet'):
  assert attrs.get('TargetMode','Internal')=='Internal'
  raw=attrs['Target'];assert not raw.startswith('//')
  target=posixpath.normpath(raw[1:] if raw.startswith('/') else posixpath.join('xl',raw))
  assert target.startswith('xl/') and target in book.namelist() and attrs['Id'] not in relationships
  relationships[attrs['Id']]=target
xml('xl/_rels/workbook.xml.rels',relationship,lambda name:None)
for sheet in sheets:sheet['path']=relationships[sheet.pop('id')]

request=json.loads(sys.argv[1])
selected=request is not None
if selected:
 sheet=next((s for s in sheets if s['name']==request['sheet']),None)
 if sheet is None:print(json.dumps({'error':'SHEET_NOT_FOUND'}));sys.exit(0)
 limits=request['limits'];left,top,right,bottom=limits
 assert 1<=left<=right<=16384 and 1<=top<=bottom<=1048576 and (right-left+1)*(bottom-top+1)<=400
else:limits=None
cells={};shared=set();manifest=[];referenced_formulas=[]

def coordinate(address):
 match=re.fullmatch(r'([A-Z]{1,3})([1-9]\d{0,6})',address)
 assert match
 column=0
 for letter in match[1]:column=column*26+ord(letter)-64
 row=int(match[2]);assert column<=16384 and row<=1048576
 return column,row

for sheet in ([sheet] if selected else sheets):
 state={'rows':0,'columns':0,'populatedRows':0,'lastRow':0,'row':0,'cell':None,'field':None}
 def start(name,attrs):
  if name=='row':
   row=int(attrs['r']);assert 1<=row<=1048576 and row>state['lastRow']
   state['row']=row;state['lastRow']=row
  if name=='c':
   address=attrs['r'];column,row=coordinate(address);assert row==state['row']
   state['rows']=max(state['rows'],row);state['columns']=max(state['columns'],column)
   wanted=selected and left<=column<=right and top<=row<=bottom
   state['cell']={'address':address,'type':attrs.get('t','n'),'style':int(attrs.get('s','0')),'value':None,'formula':None,'formulaSource':None,'inline':'','wanted':wanted}
   assert 0<=state['cell']['style']<10000
   state['hasCells']=True
  if name=='f' and state['cell'] is not None:
   kind=attrs.get('t','normal');assert kind in ('normal','shared','array','dataTable')
   index=attrs.get('si');ref=attrs.get('ref')
   assert index is None or re.fullmatch(r'\d{1,10}',index)
   if ref is not None:
    ends=ref.split(':');assert 1<=len(ends)<=2
    x1,y1=coordinate(ends[0]);x2,y2=coordinate(ends[-1]);assert x1<=x2 and y1<=y2
   metadata={'type':kind,'sharedIndex':index,'range':ref} if kind!='normal' else None
   if state['cell']['wanted']:state['cell']['formulaSource']=metadata
   if selected and kind in ('array','dataTable'):
    assert ref is not None
    if x1<=right and x2>=left and y1<=bottom and y2>=top:
     assert len(referenced_formulas)<400
     referenced_formulas.append((x1,y1,x2,y2,metadata))
  if name in ('v','f','t') and state['cell'] is not None:state['field']=name
 def text(value):
  cell=state['cell'];field=state['field']
  if cell is None or not cell['wanted'] or field is None:return
  key={'v':'value','f':'formula','t':'inline'}[field]
  cell[key]=(cell[key] or '')+value;assert len(cell[key].encode())<=16000
 def stop(name):
  if name in ('v','f','t'):state['field']=None
  if name=='c':
   cell=state['cell']
   if cell['wanted']:
    assert cell['address'] not in cells
    if cell['type']=='s':
     assert cell['value'] is not None and re.fullmatch(r'\d{1,8}',cell['value'])
     shared.add(int(cell['value']))
    cells[cell['address']]=cell
   state['cell']=None
  if name=='row':
   if state.pop('hasCells',False):state['populatedRows']+=1
 xml(sheet['path'],start,stop,text)
 manifest.append({'name':sheet['name'],'rows':state['rows'],'columns':state['columns'],'populatedRows':state['populatedRows']})

strings={}
if shared:
 state={'index':-1,'collect':False,'text':''}
 def start(name,attrs):
  if name=='si':
   state['index']+=1;state['text']='';state['collect']=state['index'] in shared
  if name=='t':state['inText']=True
 def text(value):
  if state['collect'] and state.get('inText',False):
   state['text']+=value;assert len(state['text'].encode())<=16000
 def stop(name):
  if name=='t':state['inText']=False
  if name=='si' and state['collect']:strings[state['index']]=state['text']
 xml('xl/sharedStrings.xml',start,stop,text)
 assert shared==set(strings)
formats={0:'General',1:'0',2:'0.00',3:'#,##0',4:'#,##0.00',9:'0%',10:'0.00%',14:'mm-dd-yy',15:'d-mmm-yy',16:'d-mmm',17:'mmm-yy',18:'h:mm AM/PM',19:'h:mm:ss AM/PM',20:'h:mm',21:'h:mm:ss',22:'m/d/yy h:mm',49:'@'}
styles=[];in_cells=False

def style_start(name,attrs):
 global in_cells
 if name=='numFmt':
  value=attrs['formatCode'];assert len(value.encode())<=2000
  formats[int(attrs['numFmtId'])]=value
 if name=='cellXfs':in_cells=True
 if name=='xf' and in_cells:
  assert len(styles)<10000
  styles.append(int(attrs.get('numFmtId','0')))
def style_stop(name):
 global in_cells
 if name=='cellXfs':in_cells=False
if selected and 'xl/styles.xml' in book.namelist():xml('xl/styles.xml',style_start,style_stop)
result=[]
if selected:
 for row in range(top,bottom+1):
  for column in range(left,right+1):
   letters='';n=column
   while n:n,remainder=divmod(n-1,26);letters=chr(65+remainder)+letters
   address=letters+str(row);cell=cells.get(address)
   value=cell['value'] if cell else None;kind=cell['type'] if cell else 'n'
   if cell and kind=='s':value=strings[int(value)]
   if cell and kind=='inlineStr':value=cell['inline']
   if value is not None and kind=='b':assert value in ('0','1');value='true' if value=='1' else 'false'
   index=cell['style'] if cell else 0
   assert index==0 or index<len(styles)
   format_id=styles[index] if styles else 0
   formula_source=cell['formulaSource'] if cell else None
   covering=[metadata for x1,y1,x2,y2,metadata in referenced_formulas if x1<=column<=x2 and y1<=row<=y2]
   assert len(covering)<=1
   if covering:
    assert formula_source is None or formula_source==covering[0]
    formula_source=covering[0]
   result.append({'address':address,'value':value,'formula':cell['formula'] if cell else None,'formulaSource':formula_source,'format':formats.get(format_id,'Number format id '+str(format_id)),'numeric':value is not None and kind=='n'})
output={'sheets':manifest,'cells':result,'date1904':date1904}
encoded=json.dumps(output,ensure_ascii=False);assert len(encoded.encode())<=65536
print(encoded)
`;

export async function xlsxProcess(
  path: string,
  request: { sheet: string; limits: number[] } | null,
  signal?: AbortSignal,
) {
  try {
    if (!isAbsolute(path)) throw new AiError('WORKBOOK_READ_UNAVAILABLE');
    const file = await lstat(path);
    if (!file.isFile() || file.isSymbolicLink())
      throw new AiError('WORKBOOK_READ_UNAVAILABLE');
    const output = await decode(
      [
        '/usr/bin/python3',
        '-I',
        '-c',
        workbookProgram,
        JSON.stringify(request),
      ],
      ['--ro-bind', path, '/input/source.xlsx'],
      path,
      65536,
      'WORKBOOK_READ_UNAVAILABLE',
      signal,
    );
    const result: unknown = JSON.parse(output.toString('utf8'));
    if (
      result !== null &&
      typeof result === 'object' &&
      Object.keys(result).length === 1 &&
      'error' in result &&
      result.error === 'SHEET_NOT_FOUND'
    )
      throw new AiError('SHEET_NOT_FOUND');
    return output;
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw new AiError(
      signal?.aborted ? 'REQUEST_CANCELLED' : 'WORKBOOK_READ_UNAVAILABLE',
    );
  }
}
