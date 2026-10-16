---
updatedAt: 2026-05-14T17:33:57.000Z
---

# Compare two brands' audiences

```curl cURL
curl --request GET \
  --url 'https://api.qloo.com/v2/analysis/compare?a.signal.interests.entities=[LULULEMON_ENTITY_ID] \
  &b.signal.interests.entities=[PATAGONIA_ENTITY_ID] \
  &take=10' \
  --header 'X-Api-Key: <<apiKey>>'
```

```json Response Example
{
  "duration": 0.42,
  "results": {
    "tags": [
      {
        "tag_id": "urn:tag:style:qloo:athletic",
        "name": "Athletic",
        "type": "urn:tag",
        "subtype": "urn:tag:style:qloo",
        "popularity": 0.91,
        "query": {
          "score": 0.729
        }
      }
    ]
  }
}
```

# Pass two signals using a. and b. prefixes

<!-- curl@2 -->

Each side accepts the full insights parameter set with an `a.` or `b.` prefix. Most common pattern is comparing two entities as signals.

# Read the shared tags from the response

<!-- curl@2 -->

The endpoint always returns tags, never entities, regardless of what you passed in. Each tag includes a `score` showing how strongly both audiences index for it.

# Handle the response

<!-- curl@ -->

Top-level keys are `duration` and `results` only, with no `success` field. Results live in `results.tags[]` with `tag_id`, `name`, `popularity`, and `query.score`.
