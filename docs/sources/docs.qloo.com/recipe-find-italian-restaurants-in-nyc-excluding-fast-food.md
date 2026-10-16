# Find Italian restaurants in NYC, excluding fast food

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Filter to a cuisine tag](#filter-to-a-cuisine-tag)
    1.  [Exclude an unwanted tag](#exclude-an-unwanted-tag)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:place \
  &filter.tags=urn:tag:category:place:italian_restaurant \
  &filter.exclude.tags=urn:tag:culinary_style:qloo:fast_food \
  &filter.location.query=New York City \
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
        "name": "L'Artusi",
        "entity_id": "...",
        "type": "urn:entity",
        "subtype": "urn:entity:place",
        "query": {
          "affinity": null
        }
      }
    ]
  }
}
```

## Steps

### Filter to a cuisine tag

Pass the full tag URN to `filter.tags`. This example uses `urn:tag:category:place:italian_restaurant` to scope results to Italian restaurants only.

### Exclude an unwanted tag

Use `filter.exclude.tags` to remove results that match a specific tag. Multiple exclusions can be passed as a comma-separated list.

### Handle the response

Results match the inclusion tag and exclude any results matching the exclusion tag. affinity returns null without a signal entity. Add `signal.interests.entities` to rank results by taste fit within the filtered set.

## See also

- [Find Italian restaurants in NYC, excluding fast food on docs.qloo.com](https://docs.qloo.com/recipes/find-italian-restaurants-in-nyc-excluding-fast-food), fetched 2026-10-16, page updated 2026-05-14
- [Insights API deep dive](insights-api-deep-dive.md)
