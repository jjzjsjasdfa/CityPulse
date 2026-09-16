from datetime import UTC, datetime
from types import SimpleNamespace

from app.poster_service import extract, match_score


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
