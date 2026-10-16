---
updatedAt: 2026-05-14T17:16:49.000Z
---

# Get recommendations based on multiple past destinations

```curl cURL
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:locality \
  &signal.interests.entities=[PARIS_ENTITY_ID],[ROME_ENTITY_ID] \
  &take=5' \
  --header 'X-Api-Key: <<apiKey>>'
```

```json Response Example
{
  "success": true,
  "results": {
    "entities": [
      {
        "name": "Lisbon",
        "entity_id": "...",
        "type": "urn:entity",
        "subtype": "urn:entity:locality",
        "query": {
          "affinity": 0.95
        }
      }
    ]
  }
}
```

# Pass multiple entities as signal

<!-- curl@3 -->

`signal.interests.entities` accepts a comma-separated list of entity IDs. Each additional signal entity strengthens and refines the taste profile.

# Scope to a result type

<!-- curl@2 -->

Use `filter.type` to control what category of entity gets returned. Signal entities and result entities don't need to be the same type.

# Handle the response

<!-- curl@ -->

Results are ranked by combined affinity across all signal entities. Entities that align with the full signal set rank higher than those that only match one input.
