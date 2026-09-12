# Ingestion architecture

The runner is intentionally source-agnostic. Website-specific URLs, HTML fields, and
normalization decisions belong to one adapter file per website.

```text
CLI
 `-- source key --> registry.py --> website adapter --> list[IngestionItem]
                                                |
                                                v
                                      generic runner.py
                                                |
                 ingestion_runs / raw_source_items / event_candidates
```

## Files

- `hunan_museum.py`: Hunan Museum URL, listing parser, and fetch behavior.
- `showstart.py`: ShowStart venue URL, real event-card parser, and fetch behavior.
- `registry.py`: the one place that maps CLI source keys to adapter factories.
- `types.py`: `SourceSpec`, the normalized `IngestionItem`, and adapter protocol.
- `common.py`: shared robots-policy and HTML text helpers.
- `runner.py`: generic hash, idempotent upsert, audit, dry-run, and CLI logic.

`runner.py` must not import a concrete adapter or contain a website URL. It only asks
the registry for an adapter and persists the normalized items returned by it.

## Add another website

1. Create one adapter module with a `SourceSpec` and a `fetch()` method.
2. Parse only factual fields into `IngestionItem`; do not copy images or long text.
3. Add its factory to `_ADAPTER_FACTORIES` in `registry.py`.
4. Add a small saved HTML fixture and parser tests.
5. Run `--dry-run` against the live page before allowing database writes.

Every candidate remains unpublished. A separate review/promotion workflow is
responsible for turning verified candidates into public `Event` records.
