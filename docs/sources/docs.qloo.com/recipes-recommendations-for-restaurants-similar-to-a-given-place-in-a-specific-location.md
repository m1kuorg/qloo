---
updatedAt: 2026-05-14T17:17:18.000Z
---

# Find restaurants near a coordinate point (lat/lon)

```c cURL
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:place \
  &filter.location=POINT(-74.0060 40.7128) \
  &filter.location.radius=2000 \
  &signal.interests.entities=[ENTITY_ID] \
  &take=5' \
  --header 'X-Api-Key: <<apiKey>>'
```

```json Response Example
{
  "success": true,
  "results": {
    "entities": [
      {
        "name": "il Buco",
        "entity_id": "...",
        "type": "urn:entity",
        "subtype": "urn:entity:place",
        "query": {
          "affinity": 0.97,
          "distance": 1817.0
        }
      }
    ]
  }
}
```

# Pass coordinates and a radius

<!-- c@3-4 -->

Use `filter.location` with a WKT POINT string in POINT(longitude latitude) order. Note that longitude comes first. `filter.location.radius` sets the search area in meters.

# Add an entity as signal

<!-- c@5 -->

Pass a known restaurant entity ID as `signal.interests.entities` to personalize results around a taste profile. Remove this parameter for a popularity-based result set.

# Handle the response

<!-- c@ -->

The response returns ranked place entities. Each result includes an affinity score and distance from the coordinate point in meters.
