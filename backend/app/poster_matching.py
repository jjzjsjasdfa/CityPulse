"""Conservative database reconciliation; original OCR evidence remains unchanged."""
from copy import deepcopy
from difflib import SequenceMatcher
from sqlalchemy import and_, func, or_
from sqlmodel import select
from app.models import Entry, EntryName
from app.poster_service import normalized


def reconcile(session, facts):
    output = deepcopy(facts)
    corrections, suggestions = [], []
    pairs = [('name', facts.get('name'), ['event']), ('organizer', facts.get('organizer'), ['organization', 'brand']),
             ('place', facts.get('place'), ['place']), *[('artists', n, ['person']) for n in facts.get('artists', [])]]
    for field, original, kinds in pairs:
        if not original:
            continue
        # City + venue is common in posters; reconcile the specific venue portion.
        query = original.split(' · ')[-1] if field == 'place' else original
        key = normalized(query)
        if len(key) < 2:
            continue
        short_name = and_(func.length(EntryName.name).between(max(2,len(key)-1), len(key)+1),
                          EntryName.name.startswith(key[0], autoescape=True)) if field == 'artists' and len(key) <= 4 else False
        rows = session.exec(select(Entry, EntryName.name).join(EntryName).where(
            Entry.kind.in_(kinds), or_(EntryName.name == key, EntryName.name.op('%')(key), short_name))
            .order_by(func.similarity(EntryName.name, key).desc(), Entry.id).limit(40)).all()
        ranked = {}
        for entry, alias in rows:
            score = SequenceMatcher(None, key, alias).ratio()
            if score > ranked.get(entry.id, (0, None))[0]:
                ranked[entry.id] = (score, entry)
        candidates = sorted(ranked.values(), key=lambda item: item[0], reverse=True)
        if not candidates:
            continue
        score, entry = candidates[0]
        runner_up = candidates[1][0] if len(candidates) > 1 else 0
        if normalized(entry.name) == key and score == 1:
            continue  # Exact-name ambiguity is handled by resolve_names, never arbitrarily resolved.
        threshold = .86 if field == 'artists' else .88 if field == 'place' else .9
        if len(key) >= 5 and score >= threshold and score - runner_up >= .12 and len(rows) < 40:
            corrected = original[:-len(query)] + entry.name if field == 'place' else entry.name
            if field == 'artists':
                output[field] = [corrected if n == original else n for n in output[field]]
            else:
                output[field] = corrected
            corrections.append({'field': field, 'value': corrected, 'entry_id': str(entry.id), 'source': '词条库匹配'})
        elif score >= .6 and score < 1:
            # Suggestions do not silently become facts or trigger automatic favorites.
            suggestions.append({'field': field, 'text': original, 'candidates': [
                {'id': str(e.id), 'name': e.name, 'kind': e.kind} for s, e in candidates[:3] if s >= .6]})
    output['artists'] = list(dict.fromkeys(output.get('artists', [])))
    return output, corrections, suggestions
