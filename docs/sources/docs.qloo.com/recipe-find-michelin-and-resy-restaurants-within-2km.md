# Find Michelin and Resy restaurants within 2km

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Require multiple catalog memberships](#require-multiple-catalog-memberships)
    1.  [Set a radius around a coordinate point](#set-a-radius-around-a-coordinate-point)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:place \
  &filter.external.exists=resy,michelin \
  &operator.filter.external.exists=intersection \
  &filter.location=POINT(-74.0060 40.7128) \
  &filter.location.radius=2000 \
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

## Steps

### Require multiple catalog memberships

Pass multiple values to `filter.external.exists` and set `operator.filter.external.exists` to intersection. Results should appear in all listed catalogs.

### Set a radius around a coordinate point

Use `filter.location` with a WKT POINT and `filter.location.radius` in meters to constrain results geographically.

### Handle the response

Results fall within the radius and match the catalog filters. Each result includes distance from the point in meters.

## See also

- [Find Michelin and Resy restaurants within 2km on docs.qloo.com](https://docs.qloo.com/recipes/explore-demographic-data-for-audiences-interested-in-charlize-theron-and-action-genres), fetched 2026-10-16, page updated 2026-05-14
- [Insights API deep dive](insights-api-deep-dive.md)
