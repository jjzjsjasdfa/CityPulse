from datetime import UTC, datetime
from types import SimpleNamespace

from app.poster_service import OCRText, extract, match_score


def test_extract_only_evidence_and_keep_unknown_fields_empty():
    data = extract("星河音乐节\n阵容：星雨、海风乐队\n时间：2026年10月16日\n地点：长沙橘子洲\n主办方：星河文化")
    assert data["artists"] == ["星雨", "海风乐队"]
    assert data["organizer"] == "星河文化"
    assert extract("不清晰的文字")["time"] is None
    assert extract("音乐节\n阵容\n星雨\n海风乐队\n地点：长沙")["artists"] == ["星雨", "海风乐队"]


def test_match_requires_venue_and_date_for_auto_save():
    event = SimpleNamespace(name="星河音乐节", venue_name="橘子洲", city="长沙", address="橘子洲", starts_at=datetime(2026, 10, 16, tzinfo=UTC))
    facts = {"name": "星河音乐节", "place": "长沙橘子洲", "time": "2026年10月16日"}
    assert match_score(facts, event) == (1, True)
    assert match_score({**facts, "time": "2027年10月16日"}, event)[1] is False
    assert match_score({**facts, "place": "长沙"}, event)[1] is False
    assert match_score({**facts, "place": "北京公园"}, event)[0] == 0
    assert match_score({**facts, "time": None}, event)[1] is False


def test_unlabelled_lineup_and_separate_clock():
    facts = extract("2027.10.16\n19:30\nCITY FESTIVAL\n甲乙Key\n丙丁\nSome Band\n长沙站\n市民音乐馆\nTICKET\n380 / 580")
    assert facts["name"] == "CITY FESTIVAL"
    assert facts["time"] == "2027.10.16 19:30"
    assert facts["place"] == "长沙站 · 市民音乐馆"
    assert facts["artists"] == ["甲乙Key", "丙丁", "Some Band"]
    assert facts["organizer"] is None


def test_layout_pairs_labels_without_turning_time_into_title():
    def block(text, x, y, width=100):
        return {'text': text, 'score': .95, 'box': [[x,y],[x+width,y],[x+width,y+20],[x,y+20]]}
    blocks = [block('演出时间',0,10),block('演出地点',400,10),block('2027年10月16日',120,12,220),
              block('长沙公园',520,11),block('阵容',0,50),block('甲乙',100,51),block('Some Band',260,49)]
    text = OCRText('演出时间\n演出地点\n2027年10月16日\n长沙公园\n阵容\n甲乙\nSome Band\n星河音乐节', blocks)
    facts = extract(text)
    assert facts['name'] == '星河音乐节'
    assert facts['time'] == '2027年10月16日'
    assert facts['place'] == '长沙公园'
    assert facts['artists'] == ['甲乙', 'Some Band']


def test_fuzzy_venue_typo_still_requires_full_matching_date():
    event = SimpleNamespace(name='RAN HIPHOP', venue_name='湖南国际会展中心芒果馆', city='长沙', address='长沙', starts_at=datetime(2026,9,25,tzinfo=UTC))
    facts = {'name':'RANHIPHOP','place':'长沙站 · 湖南国际会展中心苦果馆','time':'2026.09.25 19:30'}
    assert match_score(facts,event)[1] is True
    assert match_score({**facts,'time':'2027.09.25'},event)[1] is False
    assert match_score({**facts,'time':'09.25'},event)[1] is False
    assert match_score({**facts,'place':'长沙'},event)[1] is False


def test_partial_dates_do_not_invent_year_and_song_list_is_not_cast():
    facts = extract('诗意中秋音乐会\n茉莉花\n月亮代表我的心\n知否知否\n9/26\n19:30\n长沙音乐厅')
    assert facts['time'] == '9月26日 19:30'
    assert facts['artists'] == []
    assert facts['cautions']
    assert extract('胡彦斌WORLD TOUR\n2026\n长沙站|IO.5 19:30')['time'] == '2026年10月5日 19:30'


def test_tour_rows_keep_city_date_and_venue_together():
    def b(text,x,y,w):
        return {'text':text,'score':.99,'box':[[x,y],[x+w,y],[x+w,y+25],[x,y+25]]}
    blocks=[b('某某2026全国巡演',0,0,260),b('长春09.12',0,100,160),b('长春乐活LIVEHOUSE',180,100,240),
            b('长沙11.14',0,160,160),b('长沙VOXLIVEHOUSE',180,160,240)]
    facts=extract(OCRText('\n'.join(x['text'] for x in blocks),blocks))
    assert facts['time'] is None and facts['place'] is None
    assert facts['scenes']==[{'city':'长春','time':'2026年9月12日','place':'长春乐活LIVEHOUSE'},
                             {'city':'长沙','time':'2026年11月14日','place':'长沙VOXLIVEHOUSE'}]
    event=SimpleNamespace(name='某某2026全国巡演',venue_name='长沙VOXLIVEHOUSE',city='长沙',address='长沙',starts_at=datetime(2026,11,14,tzinfo=UTC))
    assert not match_score({**facts,'time':'2026年11月14日','place':event.venue_name},event)[1]


def test_tribute_and_creator_do_not_imply_performer_attendance():
    assert extract('LOVE STORY\nTaylor Swift\n金曲演唱会\n生日特别场')['artists']==[]
    assert extract('互动儿童剧\n导演：甲乙\n原著：丙丁')['artists']==[]
    facts=extract('理查德·克莱德曼\n钢琴音乐会')
    assert facts['artists']==['理查德·克莱德曼']
    assert facts['time'] is None and facts['place'] is None
