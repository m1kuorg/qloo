# Find restaurants like Balthazar in New York

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Pass an entity as signal](#pass-an-entity-as-signal)
    1.  [Scope results to a location](#scope-results-to-a-location)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:place \
  &signal.interests.entities=[BALTHAZAR_ENTITY_ID] \
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
        "name": "Catch NYC",
        "entity_id": "8119141A-D38C-428E-819D-CAA5027120C2",
        "type": "urn:entity",
        "subtype": "urn:entity:place",
        "query": {
          "affinity": 0.97
        }
      }
    ]
  }
}
```

## Steps

### Pass an entity as signal

Use a restaurant's Qloo entity ID as `signal.interests.entities`. To find the entity ID, search for the restaurant by name using the /search endpoint with `types=urn:entity:place`.

### Scope results to a location

Use `filter.location.query` to limit results to a specific city or neighborhood. The signal entity's location doesn't need to match — a Brooklyn restaurant can drive recs in Paris.

### Handle the response

Results are ranked by affinity to the signal entity's taste profile. Each result includes an affinity score and distance if a location filter was applied.

## See also

- [Find restaurants like Balthazar in New York on docs.qloo.com](https://docs.qloo.com/recipes/recommendations-for-restaurants-similar-to-balthazar-in-nyc), fetched 2026-10-16, page updated 2026-05-14
- [Insights API deep dive](insights-api-deep-dive.md)
