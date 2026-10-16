# Get the top restaurants per city across multiple markets

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Set the diversification group and cap](#set-the-diversification-group-and-cap)
    1.  [Set take high enough to fill every bucket](#set-take-high-enough-to-fill-every-bucket)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:place \
  &signal.interests.entities=[ENTITY_ID] \
  &diversify.by=properties.geocode.city \
  &diversify.take=2 \
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
        "name": "Alinea",
        "entity_id": "...",
        "type": "urn:entity",
        "subtype": "urn:entity:place",
        "query": {
          "affinity": 0.94
        },
        "properties": {
          "geocode": {
            "city": "Chicago"
          }
        }
      }
    ]
  }
}
```

## Steps

### Set the diversification group and cap

`diversify.by` defines what to group by. Here `properties.geocode.city` groups by `city. diversify.take` sets how many results to allow per group, enforcing a hard cap per market regardless of affinity score.

### Set take high enough to fill every bucket

Set the top-level take to at least cities multiplied by `diversify.take`. For 2 results across 5 cities, take=10 ensures enough candidates to fill each bucket. Avoid broad location filters like country-level queries — use a signal entity to drive geographic distribution instead.

### Handle the response

Results come back interleaved across cities. Each entity's `properties.geocode` tells you which market it belongs to.

## See also

- [Get the top restaurants per city across multiple markets on docs.qloo.com](https://docs.qloo.com/recipes/get-the-top-restaurants-per-city-across-multiple-markets), fetched 2026-10-16, page updated 2026-05-14
- [Insights API deep dive](insights-api-deep-dive.md)
