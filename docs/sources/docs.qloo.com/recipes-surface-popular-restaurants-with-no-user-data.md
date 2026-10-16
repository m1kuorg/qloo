---
updatedAt: 2026-05-14T17:15:40.000Z
---

# Surface popular restaurants with no user data

```curl cURL
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:place \
  &filter.popularity.min=0.9 \
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
        "name": "Le Bernardin",
        "entity_id": "...",
        "type": "urn:entity:place",
        "properties": {
          "affinity": 0.99
        }
      }
    ]
  }
}
```

# Set a popularity floor

<!-- curl@3 -->

`filter.popularity.min` accepts a value between 0 and 1. Setting it to 0.9 returns only the top tier of globally recognized entities — a safe default for cold start surfaces.

# Handle the response

<!-- curl@ -->

Results are ranked by global affinity. Once you have user signal, swap in `signal.interests.entities` and remove the popularity filter to move from cold start to personalized mode.
