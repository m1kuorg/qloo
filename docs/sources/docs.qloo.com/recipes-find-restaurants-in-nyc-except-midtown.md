---
updatedAt: 2026-05-14T17:18:31.000Z
---

# Find restaurants in NYC except Midtown

```curl cURL
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:place \
  &filter.location.query=New York City \
  &filter.exclude.location.query=Midtown \
  &signal.interests.entities=[ENTITY_ID] \
  &take=10' \
  --header 'X-Api-Key: <<apiKey>>'
```

```json Response Example
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

# Pass a location and an exclusion

<!-- curl@3-4 -->

Use `filter.location.query` to set the overall search area and `filter.exclude.location.query` to cut out a specific sub-area. Both accept named location strings.

# Add signal to personalize within the area

<!-- curl@5 -->

Use `signal.interests.entities` to rank results by taste fit. Without signal, results are ranked by popularity within the filtered geography.

# Handle the response

<!-- curl@ -->

Results fall within the location boundary and outside the excluded area. Each result includes an affinity score if a signal entity was provided.
