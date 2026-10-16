---
updatedAt: 2026-05-14T17:35:45.000Z
---

# Get trending artists this week

```curl cURL
curl --request GET \
  --url 'https://api.qloo.com/v2/trending/?filter.type=urn:entity:artist \
  &filter.start_date=2026-05-05 \
  &filter.end_date=2026-05-12 \
  &take=10' \
  --header 'X-Api-Key: <<apiKey>>'
```

```json Response Example
{
  "success": true,
  "results": {
    "entities": [
      {
        "name": "Sabrina Carpenter",
        "entity_id": "...",
        "type": "urn:entity:artist",
        "properties": {
          "trend_rank": 1
        }
      }
    ]
  }
}
```

# Set the date window

<!-- curl@2 -->

`filter.start_date` and `filter.end_date` are required. The endpoint compares activity within this window against the prior period to calculate trend velocity. A 7-day window is the most common usage.

# Scope to an entity type

<!-- curl@2 -->

Use `filter.type` to limit results to a specific category. The trending endpoint supports any entity type — artists, TV shows, places, brands, and more.

# Handle the response

<!-- curl@ -->

Results are ranked by trend velocity, not overall popularity. An entity near the top may not be globally famous — it's rising fastest within the window.
