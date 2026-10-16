---
updatedAt: 2026-05-14T17:17:50.000Z
---

# Find places inside a neighborhood boundary (WKT polygon)

```c cURL
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:place \
  &filter.location=POLYGON((2.3270 48.8606, 2.3270 48.8796, 2.3602 48.8796, 2.3602 48.8606, 2.3270 48.8606)) \
  &take=10' \
  --header 'X-Api-Key: <<apiKey>>'
```

```json Response Example
{
  "success": true,
  "results": {
    "entities": [
      {
        "name": "The Centre Pompidou",
        "entity_id": "...",
        "type": "urn:entity",
        "subtype": "urn:entity:place",
        "query": {
          "affinity": null,
          "distance": null
        }
      }
    ]
  }
}
```

# 1. Define the boundary as a WKT polygon

<!-- c@3 -->

Pass a WKT POLYGON string to `filter.location`. Coordinates must be in longitude/latitude order and the polygon must close — the last coordinate pair must match the first.

# 2. Scope to an entity type

<!-- c@2 -->

Use `filter.type` to limit results to a specific category. This example returns places, but the polygon filter works with any entity type.

# 3. Handle the response

<!-- c@ -->

Results are constrained to the polygon boundary and ranked by popularity. affinity and distance return null when no signal entity is provided. Add `signal.interests.entities` to get personalized ranking within the boundary.
