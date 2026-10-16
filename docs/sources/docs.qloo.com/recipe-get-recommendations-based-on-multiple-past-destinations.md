# Get recommendations based on multiple past destinations

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Pass multiple entities as signal](#pass-multiple-entities-as-signal)
    1.  [Scope to a result type](#scope-to-a-result-type)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:locality \
  &signal.interests.entities=[PARIS_ENTITY_ID],[ROME_ENTITY_ID] \
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
        "name": "Lisbon",
        "entity_id": "...",
        "type": "urn:entity",
        "subtype": "urn:entity:locality",
        "query": {
          "affinity": 0.95
        }
      }
    ]
  }
}
```

## Steps

### Pass multiple entities as signal

`signal.interests.entities` accepts a comma-separated list of entity IDs. Each additional signal entity strengthens and refines the taste profile.

### Scope to a result type

Use `filter.type` to control what category of entity gets returned. Signal entities and result entities don't need to be the same type.

### Handle the response

Results are ranked by combined affinity across all signal entities. Entities that align with the full signal set rank higher than those that only match one input.

## See also

- [Get recommendations based on multiple past destinations on docs.qloo.com](https://docs.qloo.com/recipes/get-recommendations-based-on-multiple-past-destinations), fetched 2026-10-16, page updated 2026-05-14
- [Insights API deep dive](insights-api-deep-dive.md)
