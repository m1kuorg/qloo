---
updatedAt: 2026-05-14T17:14:17.000Z
---

# Search for an entity by name

```curl cURL
curl --request GET \
  --url 'https://api.qloo.com/search?query=Balthazar&types=urn:entity:place&take=3' \
  --header 'X-Api-Key: <<apiKey>>'
```

```json Response Example
{
  "results": [
    {
      "name": "Balthazar",
      "entity_id": "FCE8B172-4795-43E4-B222-3B550DC05FD9",
      "types": ["urn:entity:place"],
      "popularity": 0.998,
      "properties": {}
    }
  ]
}
```

# Search by name and entity type

<!-- curl@2 -->

Use `query` for the search string and types to scope to a specific entity category.

# Use the entity ID in subsequent calls

<!-- curl@2 -->

The returned entity_id is what you pass as signal.interests.entities in /v2/insights. Most recipes assume you already have an entity ID, this is where you get it.

# Handle the response

<!-- curl@ -->

Results come back as a flat array under results, not nested under `results.entities`. Each result includes `name`, `entity_id`, `types`, `properties`, and `popularity`.
