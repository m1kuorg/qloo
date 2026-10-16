# Find restaurants near a coordinate point (lat/lon)

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Pass coordinates and a radius](#pass-coordinates-and-a-radius)
    1.  [Add an entity as signal](#add-an-entity-as-signal)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:place \
  &filter.location=POINT(-74.0060 40.7128) \
  &filter.location.radius=2000 \
  &signal.interests.entities=[ENTITY_ID] \
  &take=5' \
  --header 'X-Api-Key: <<apiKey>>'
```

## Response example

```json
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

## Steps

### Pass coordinates and a radius

Use `filter.location` with a WKT POINT string in POINT(longitude latitude) order. Note that longitude comes first. `filter.location.radius` sets the search area in meters.

### Add an entity as signal

Pass a known restaurant entity ID as `signal.interests.entities` to personalize results around a taste profile. Remove this parameter for a popularity-based result set.

### Handle the response

The response returns ranked place entities. Each result includes an affinity score and distance from the coordinate point in meters.

## See also

- [Find restaurants near a coordinate point (lat/lon) on docs.qloo.com](https://docs.qloo.com/recipes/recommendations-for-restaurants-similar-to-a-given-place-in-a-specific-location), fetched 2026-10-16, page updated 2026-05-14
- [Insights API deep dive](insights-api-deep-dive.md)
