"""Replay saved OCR evidence without inference, database writes or filename hints.

Usage (backend environment): python scripts/evaluate_poster_text.py corpus.json output.json
The input is produced by mobile/scripts/evaluate-posters.mjs.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.poster_service import OCRText, extract  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    results = []
    for item in json.loads(args.input.read_text(encoding='utf-8')):
        if item.get('error'):
            results.append({'file': item.get('file'), 'error': item['error']})
            continue
        evidence = OCRText(item['text'], item.get('blocks'), item.get('quality'))
        results.append({'file': item.get('file'), 'facts': extract(evidence)})
    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'Replayed {len(results)} posters; no database records modified.')


if __name__ == '__main__':
    main()
