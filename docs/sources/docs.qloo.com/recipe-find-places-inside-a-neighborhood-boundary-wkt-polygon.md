# Find places inside a neighborhood boundary (WKT polygon)

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [1. Define the boundary as a WKT polygon](#1-define-the-boundary-as-a-wkt-polygon)
    1.  [2. Scope to an entity type](#2-scope-to-an-entity-type)
    1.  [3. Handle the response](#3-handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:place \
  &filter.location=POLYGON((2.3270 48.8606, 2.3270 48.8796, 2.3602 48.8796, 2.3602 48.8606, 2.3270 48.8606)) \
  &take=10' \
  --header 'X-Api-Key: <<apiKey>>'
```

## Response example

```json
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

## Steps

### 1. Define the boundary as a WKT polygon

Pass a WKT POLYGON string to `filter.location`. Coordinates must be in longitude/latitude order and the polygon must close — the last coordinate pair must match the first.

### 2. Scope to an entity type

Use `filter.type` to limit results to a specific category. This example returns places, but the polygon filter works with any entity type.

### 3. Handle the response

Results are constrained to the polygon boundary and ranked by popularity. affinity and distance return null when no signal entity is provided. Add `signal.interests.entities` to get personalized ranking within the boundary.

## See also

- [Find places inside a neighborhood boundary (WKT polygon) on docs.qloo.com](https://docs.qloo.com/recipes/recommendations-for-popular-brands-inside-paris-center-based-on-wkt-shape), fetched 2026-10-16, page updated 2026-05-14
- [Insights API deep dive](insights-api-deep-dive.md)
