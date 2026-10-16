---
updatedAt: 2026-05-14T17:34:16.000Z
---

# Find Michelin and Resy restaurants within 2km

```c cURL
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:place \
  &filter.external.exists=resy,michelin \
  &operator.filter.external.exists=intersection \
  &filter.location=POINT(-74.0060 40.7128) \
  &filter.location.radius=2000 \
  &take=10' \
  --header 'X-Api-Key: <<apiKey>>'
```

```json Response Example
{
  "success": true,
  "results": {
    "entities": [
      {
        "name": "Marea",
        "entity_id": "...",
        "type": "urn:entity",
        "subtype": "urn:entity:place",
        "query": {
          "affinity": null,
          "distance": 1240.5
        }
      }
    ]
  }
}
```

# Require multiple catalog memberships

<!-- c@3-4 -->

Pass multiple values to `filter.external.exists` and set `operator.filter.external.exists` to intersection. Results should appear in all listed catalogs.

# Set a radius around a coordinate point

<!-- c@6 -->

Use `filter.location` with a WKT POINT and `filter.location.radius` in meters to constrain results geographically.

# Handle the response

<!-- c@ -->

Results fall within the radius and match the catalog filters. Each result includes distance from the point in meters.
