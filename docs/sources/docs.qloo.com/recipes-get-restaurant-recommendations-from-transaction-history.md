---
updatedAt: 2026-05-14T17:16:26.000Z
---

# Get restaurant recommendations from transaction history

```c cURL
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

```json Response Example
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

# Format the transaction array

<!-- c@3-4 -->

Each transaction is an object with a name and address field. Qloo resolves these against its knowledge graph — the closer the match, the stronger the signal. Note: signal.interests.entities.query requires a POST request with a JSON body.

# Scope the results to a location

<!-- c@5 -->

Recipe 1, Step 2 explanation:  
Use `filter.location.query` to specify where you want recommendations returned. This is independent of where the transactions occurred. A customer who dined in LA and Seattle can get recs in Chicago.

# Handle the response

<!-- c@7-9 -->

The response returns ranked restaurant entities. Each result includes an affinity score reflecting how well it matches the inferred taste profile.
