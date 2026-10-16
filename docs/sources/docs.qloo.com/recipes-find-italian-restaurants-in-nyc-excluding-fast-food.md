---
updatedAt: 2026-05-14T17:19:14.000Z
---

# Find Italian restaurants in NYC, excluding fast food

```curl cURL
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:place \
  &filter.tags=urn:tag:category:place:italian_restaurant \
  &filter.exclude.tags=urn:tag:culinary_style:qloo:fast_food \
  &filter.location.query=New York City \
  &take=10' \
  --header 'X-Api-Key: <<apiKey>>'
```

```json Response Example
{
  "success": true,
  "results": {
    "entities": [
      {
        "name": "L'Artusi",
        "entity_id": "...",
        "type": "urn:entity",
        "subtype": "urn:entity:place",
        "query": {
          "affinity": null
        }
      }
    ]
  }
}
```

# Filter to a cuisine tag

<!-- curl@3 -->

Pass the full tag URN to `filter.tags`. This example uses `urn:tag:category:place:italian_restaurant` to scope results to Italian restaurants only.

# Exclude an unwanted tag

<!-- curl@4 -->

Use `filter.exclude.tags` to remove results that match a specific tag. Multiple exclusions can be passed as a comma-separated list.

# Handle the response

<!-- curl@ -->

Results match the inclusion tag and exclude any results matching the exclusion tag. affinity returns null without a signal entity. Add `signal.interests.entities` to rank results by taste fit within the filtered set.
