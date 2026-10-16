---
updatedAt: 2026-05-14T17:20:59.000Z
---

# Find a tag ID by keyword

```curl cURL
curl --request GET \
  --url 'https://api.qloo.com/v2/tags?filter.query=rooftop bar&take=3' \
  --header 'X-Api-Key: <<apiKey>>'
```

```json Response Example
{
  "success": true,
  "results": {
    "tags": [
      {
        "id": "urn:tag:amenity:place:rooftop_bar",
        "name": "Rooftop Bar",
        "type": "urn:tag:amenity:place",
        "parents": [{ "type": "urn:entity:place" }],
        "popularity": 0.95
      }
    ]
  }
}
```

# Search for a tag by keyword

<!-- curl@2 -->

Use `filter.query` to search by tag name. A single keyword can return multiple tag types, so review the results to pick the right one.

# Pick the right tag type for your use case

<!-- curl@2 -->

Each tag has a `type` (like urn:tag:amenity:place) and a `parents` array listing which entity types it applies to. Match the tag type to what you're filtering.

# Handle the response

<!-- curl@ -->

Results return as r`esults.tags[]`, each with an `id` (the URN to use), `name`, `type`, and `parents[].type` for entity scope.
