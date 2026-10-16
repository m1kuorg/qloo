# Get restaurant recommendations from transaction history

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Format the transaction array](#format-the-transaction-array)
    1.  [Scope the results to a location](#scope-the-results-to-a-location)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request POST \
  --url 'https://api.qloo.com/v2/insights/' \
  --header 'X-Api-Key: <<apiKey>>' \
  --header 'Content-Type: application/json' \
  --data '{
    "filter.type": "urn:entity:place",
    "signal.interests.entities.query": [
      {"name": "Nobu", "address": "105 Hudson St, New York, NY"},
      {"name": "Balthazar", "address": "80 Spring St, New York, NY"}
    ],
    "filter.location.query": "Chicago",
    "take": 5
  }'
```

## Response example

```json
{
  "success": true,
  "results": {
    "entities": [
      {
        "name": "Sepia",
        "entity_id": "...",
        "type": "urn:entity",
        "subtype": "urn:entity:place",
        "query": {
          "affinity": 0.86,
          "distance": 800.2,
          "measurements": {
            "audience_growth": 0
          }
        },
        "properties": {}
      }
    ]
  }
}
```

## Steps

### Format the transaction array

Each transaction is an object with a name and address field. Qloo resolves these against its knowledge graph — the closer the match, the stronger the signal. Note: signal.interests.entities.query requires a POST request with a JSON body.

### Scope the results to a location

Use `filter.location.query` to specify where you want recommendations returned. This is independent of where the transactions occurred. A customer who dined in LA and Seattle can get recs in Chicago.

### Handle the response

The response returns ranked restaurant entities. Each result includes an affinity score reflecting how well it matches the inferred taste profile.

## See also

- [Get restaurant recommendations from transaction history on docs.qloo.com](https://docs.qloo.com/recipes/get-restaurant-recommendations-from-transaction-history), fetched 2026-10-16, page updated 2026-05-14
- [Insights API deep dive](insights-api-deep-dive.md)
