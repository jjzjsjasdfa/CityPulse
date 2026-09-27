from app.fuzzy import name_similarity


def test_full_name_matching_does_not_promote_substrings_to_exact():
    assert name_similarity('王以太', '王以太') == 1
    assert 0 < name_similarity('王以太', '王以太致敬音乐会') < .6
    assert name_similarity('', '') == 0
    assert name_similarity('陈奕迅', '陈奕汛') < .9


def test_long_venue_typo_produces_candidate_not_exact():
    score = name_similarity('湖南国际会展中心芒果馆', '湖南国际会展中心苦果馆')
    assert .8 < score < 1
    assert score == name_similarity('湖南国际会展中心苦果馆', '湖南国际会展中心芒果馆')
