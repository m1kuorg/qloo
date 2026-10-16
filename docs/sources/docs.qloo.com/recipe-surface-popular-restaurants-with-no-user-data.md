# Surface popular restaurants with no user data

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Set a popularity floor](#set-a-popularity-floor)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:place \
  &filter.popularity.min=0.9 \
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
        "name": "Le Bernardin",
        "entity_id": "...",
        "type": "urn:entity:place",
        "properties": {
          "affinity": 0.99
        }
      }
    ]
  }
}
```

## Steps

### Set a popularity floor

`filter.popularity.min` accepts a value between 0 and 1. Setting it to 0.9 returns only the top tier of globally recognized entities — a safe default for cold start surfaces.

### Handle the response

Results are ranked by global affinity. Once you have user signal, swap in `signal.interests.entities` and remove the popularity filter to move from cold start to personalized mode.

## See also

- [Surface popular restaurants with no user data on docs.qloo.com](https://docs.qloo.com/recipes/surface-popular-restaurants-with-no-user-data), fetched 2026-10-16, page updated 2026-05-14
- [Insights API deep dive](insights-api-deep-dive.md)
