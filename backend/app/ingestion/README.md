# Ingestion architecture

The runner is intentionally source-agnostic. Website-specific URLs, HTML fields, and
normalization decisions belong to one adapter file per website.

```text
CLI --> registry.py --> SourceJob
                         |-- DiscoveryAdapter --> list[IngestionItem]
                         |-- source-specific enrichers
                         `-- shared enrichers (for example VenueLookup)
                                      |
                                      v
                               generic runner.py
                                      |
               ingestion_runs / raw_source_items / event_candidates
```

## Files

- `showstart.py`: ShowStart venue discovery and real event-card parser.
- `listing.py`: declarative HTML listing sources and their shared discovery adapter.
- `showstart_detail.py`: ShowStart detail enricher and factual parsing without executing scripts.
- `http.py`: shared HTTP lifecycle, truthful User-Agent handling and cached robots policy.
- `pipeline.py`: ordered enrichment composition and `SourceJob` resource ownership.
- `places.py`: optional city-scoped Amap venue lookup, ambiguity handling and import-local cache.
- `coordinates.py`: approximate BD-09 / GCJ-02 to WGS84 conversion with source attribution.
- `enrichment_types.py`: typed source/provenance and location-match responses for reviewers.
- `registry.py`: the one place that composes source jobs from adapters and enrichers.
- `types.py`: normalized items and discovery/enrichment/job protocols.
- `common.py`: shared robots-policy and HTML text helpers.
- `runner.py`: generic hash, idempotent upsert, audit, dry-run, and CLI logic.

`runner.py` must not import a concrete adapter or contain a website URL. It only asks
the registry for an adapter and persists the normalized items returned by it.

## Add another website

1. For a simple HTML listing, declare an `HtmlListingSource` with its `SourceSpec`,
   parser, request parameters, and empty-result message. Use a custom
   `DiscoveryAdapter` only when discovery needs paging, authentication, JSON, or
   multiple requests.
2. Parse only factual fields into `IngestionItem`; do not copy images or long text.
3. Add source-specific detail enrichers separately when the listing is incomplete.
4. Compose the adapter and enrichers in `_JOB_FACTORIES` in `registry.py`.
5. Add a small saved HTML fixture and parser tests.
6. Run `--dry-run` against the live page before allowing database writes.

Every candidate remains unpublished. A separate review/promotion workflow is
responsible for turning verified candidates into public `Event` records.

The default ShowStart job runs its detail enricher and then the shared venue lookup.
A failed detail
request keeps the listing usable and records a warning. Previously collected detail
facts are preserved on transient failures. Original source coordinates and time text
stay in `facts.enrichment`; normalized WGS84 coordinates are first-class candidate
fields. No ticket sale timestamps or current-year guesses are used to complete dates.
