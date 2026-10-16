# Find restaurants in NYC except Midtown

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Pass a location and an exclusion](#pass-a-location-and-an-exclusion)
    1.  [Add signal to personalize within the area](#add-signal-to-personalize-within-the-area)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:place \
  &filter.location.query=New York City \
  &filter.exclude.location.query=Midtown \
  &signal.interests.entities=[ENTITY_ID] \
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
        "name": "Roberta's",
        "entity_id": "...",
        "type": "urn:entity",
        "subtype": "urn:entity:place",
        "query": {
          "affinity": 0.95
        }
      }
    ]
  }
}
```

## Steps

### Pass a location and an exclusion

Use `filter.location.query` to set the overall search area and `filter.exclude.location.query` to cut out a specific sub-area. Both accept named location strings.

### Add signal to personalize within the area

Use `signal.interests.entities` to rank results by taste fit. Without signal, results are ranked by popularity within the filtered geography.

### Handle the response

Results fall within the location boundary and outside the excluded area. Each result includes an affinity score if a signal entity was provided.

## See also

- [Find restaurants in NYC except Midtown on docs.qloo.com](https://docs.qloo.com/recipes/find-restaurants-in-nyc-except-midtown), fetched 2026-10-16, page updated 2026-05-14
- [Insights API deep dive](insights-api-deep-dive.md)
