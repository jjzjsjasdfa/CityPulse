"""Spatial reading order and dates from OCR evidence, never from upload filenames."""
import re


def text_rows(blocks):
    pieces = []
    for block in blocks:
        points = block.get('box', [])
        if len(points) < 4:
            continue
        x,y = min(p[0] for p in points), min(p[1] for p in points)
        w,h = max(p[0] for p in points)-x, max(p[1] for p in points)-y
        text = block.get('text','').strip()
        if not text:
            continue
        # Split a mistakenly merged vertical column of isolated city characters.
        if h > w*2.4 and 2 <= len(text) <= 4 and re.fullmatch(r'[\u4e00-\u9fff]+',text):
            for i,char in enumerate(text):
                pieces.append({'text':char,'x':x,'y':y+i*h/len(text),'w':w,'h':h/len(text),'score':block.get('score',0)})
        else:
            pieces.append({'text':text,'x':x,'y':y,'w':w,'h':h,'score':block.get('score',0)})
    rows = []
    for piece in sorted(pieces,key=lambda b:b['y']+b['h']/2):
        cy=piece['y']+piece['h']/2
        row=next((r for r in reversed(rows) if abs(r['cy']-cy)<=min(r['h'],piece['h'])*.6 and piece['h']<piece['w']*2.4),None)
        if row is None:
            rows.append({'parts':[piece],'cy':cy,'h':piece['h']})
        else:
            row['parts'].append(piece)
    for row in rows:
        row['parts'].sort(key=lambda p:p['x'])
        row['text']=' '.join(p['text'] for p in row['parts'])
        row['text']=re.sub(r'(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])','',row['text'])
    return rows


def dates_and_scenes(text, rows):
    # Repair O/I only inside a date token; never change ordinary names.
    text=re.sub(r'(?<![A-Za-z])([IOOl\d]{1,2})([./])([0-9]{1,2})(?!\d)',lambda m:m[1].translate(str.maketrans({'I':'1','l':'1','O':'0','o':'0'}))+m[2]+m[3],text)
    years=set(re.findall(r'(?<!\d)20\d{2}(?!\d)',text))
    year=next(iter(years)) if len(years)==1 else None
    # This also recognizes a visible year immediately followed by M/D (20268/22).
    date_re=r'(?<!\d)(?:(20\d{2})[年./-]?)?(0?[1-9]|1[0-2])[月./-](0?[1-9]|[12]\d|3[01])(?:日)?(?:\s*[-—~至]\s*(?:(20\d{2})[年./-]?)?(?:(0?[1-9]|1[0-2])[月./-])?(0?[1-9]|[12]\d|3[01])日?)?(?!\d)'
    found=[]
    for m in re.finditer(date_re,text):
        y,month,day,y2,m2,d2=m.groups()
        full=f'{y or year}年' if y or year else ''
        value=f'{full}{int(month)}月{int(day)}日'
        if d2:
            value+=f'—{y2+"年" if y2 else ""}{int(m2 or month)}月{int(d2)}日'
        found.append(value)
    scenes=[]
    for row in rows:
        clean=re.sub(r'(?<![A-Za-z])IO(?=\.\d)','10',row['text'])
        m=re.search(date_re,clean)
        if not m:
            continue
        before,after=clean[:m.start()].strip(),clean[m.end():].strip()
        if re.fullmatch(r'[\u4e00-\u9fff]{2,4}',before) and len(after)>=3 and not re.fullmatch(r'[. :\d-]+',after):
            date=dates_and_scenes(m.group(),[])[0]
            if year and date and not re.search(r'20\d{2}',date):
                date=f'{year}年'+date
            scenes.append({'time':date,'place':after,'city':before})
    # Month and day printed in two separate large boxes, often in theatre posters.
    if not found:
        digits=[p for r in rows for p in r['parts'] if re.fullmatch(r'\d{1,2}',p['text']) and p['h']>=35]
        for first in digits:
            for second in digits:
                if (1<=int(first['text'])<=12 and 1<=int(second['text'])<=31 and
                    first['h']*.8<second['y']-first['y']<first['h']*2.5 and abs(first['x']-second['x'])<first['w']*.3):
                    found.append(f'{year+"年" if year else ""}{int(first["text"])}月{int(second["text"])}日')
    times=re.findall(r'(?<!\d)(?:[01]?\d|2[0-3])[:：][0-5]\d(?:\s*[-—]\s*(?:[01]?\d|2[0-3])[:：][0-5]\d)?',text)
    if not times:
        times=[m.group().replace(' ','') for r in rows for m in re.finditer(r'(?<!\d)(?:[01]?\d|2[0-3]):\s+[0-5]\d',r['text'])]
    found=list(dict.fromkeys(found))
    value=' / '.join(found) if found else None
    if value and times:
        value+=' '+times[0]
    return value,scenes if len(scenes)>1 else []


EVENT_WORDS=r'音乐节|演唱会|巡演|音乐会|锦标赛|冠军赛|马拉松|特展|展览|艺术节|喜剧专场|脱口秀|儿童剧|舞台剧|HIP\s*HOP|FESTIVAL|\bLIVE\b|\bTOUR\b'
NON_TITLE=r'主办|承办|时间|日期|地址|地点|阵容|演出时间|演出地点|演出阵容|活动时间|活动地点|活动须知|演出须知|禁止|和孩子|一起|一场演出'


def choose_title(lines,rows):
    joined=[r['text'] for r in rows]
    candidates=[s for s in [*lines,*joined] if re.search(EVENT_WORDS,s,re.I) and not re.match(NON_TITLE,s) and len(s)<150]
    title=candidates[0] if candidates else None
    parts=[p for r in rows for p in r['parts']]
    def font(p):
        return min(p['h'],p['w']/max(1,sum(1 if '\u4e00'<=c<='\u9fff' else .55 for c in p['text'])))
    prominent=[p for p in parts if len(p['text'])>=2 and p['score']>=.82 and not re.fullmatch(r'[\d\W]+',p['text'])
               and not re.match(NON_TITLE,p['text']) and not re.search('站$|票价|TIME|TICKET|SAT|MON|FRI',p['text'],re.I)]
    if title and re.search(r'音乐会|儿童剧|金曲演唱会',title):
        # Associate a readable heading with a smaller generic event-type subtitle.
        if '钢琴音乐会' in title:
            index=lines.index(title) if title in lines else -1
            if index>0 and re.fullmatch(r'[\u4e00-\u9fff]+[·•][\u4e00-\u9fff]+',lines[index-1]):
                return lines[index-1]+' '+title
        if prominent:
            biggest=max(prominent,key=font)
            if biggest['text'] not in title and ('儿童剧' in title or re.search(r'^[·\s]*诗意|^金曲',title)):
                # For tribute posters use the event headline, not the pictured original singer.
                if '金曲' in title:
                    upper=[p for p in prominent if p['y']<max(x['y'] for x in parts)*.4]
                    biggest=max(upper,key=font) if upper else biggest
                return biggest['text']+' · '+title.lstrip('· ')
    if title:
        # Include the preceding sponsor/event-series line when it shares the title's typography.
        if re.search('锦标赛',title) and title in lines:
            i=lines.index(title)
            if i and re.search('国际汽联|方程式',lines[i-1]):
                return lines[i-1]+' '+title
        return title
    # No invented event type when only the large, readable headline survives.
    if prominent:
        biggest=max(prominent,key=font)
        row=next((r for r in rows if biggest in r['parts']),None)
        peers=[p for p in row['parts'] if font(p)>=font(biggest)*.65] if row else [biggest]
        text=' '.join(p['text'] for p in peers)
        return text if len(text)>=3 else None
    return None
