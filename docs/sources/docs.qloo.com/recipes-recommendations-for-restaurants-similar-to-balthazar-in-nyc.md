---
updatedAt: 2026-05-14T17:14:49.000Z
---

# Find restaurants like Balthazar in New York

```c cURL
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:place \
  &signal.interests.entities=[BALTHAZAR_ENTITY_ID] \
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
        "name": "Catch NYC",
        "entity_id": "8119141A-D38C-428E-819D-CAA5027120C2",
        "type": "urn:entity",
        "subtype": "urn:entity:place",
        "query": {
          "affinity": 0.97
        }
      }
    ]
  }
}
```

# Pass an entity as signal

<!-- c@6 -->

Use a restaurant's Qloo entity ID as `signal.interests.entities`. To find the entity ID, search for the restaurant by name using the /search endpoint with `types=urn:entity:place`.

# Scope results to a location

<!-- c@6 -->

Use `filter.location.query` to limit results to a specific city or neighborhood. The signal entity's location doesn't need to match — a Brooklyn restaurant can drive recs in Paris.

# Handle the response

<!-- c@ -->

Results are ranked by affinity to the signal entity's taste profile. Each result includes an affinity score and distance if a location filter was applied.
