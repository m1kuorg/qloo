---
updatedAt: 2026-05-14T17:18:52.000Z
---

# Get the top restaurants per city across multiple markets

```curl cURL
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:place \
  &signal.interests.entities=[ENTITY_ID] \
  &diversify.by=properties.geocode.city \
  &diversify.take=2 \
  &take=10' \
  --header 'X-Api-Key: <<apiKey>>'
```

```json Response Example
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

# Set the diversification group and cap

<!-- curl@3-4 -->

`diversify.by` defines what to group by. Here `properties.geocode.city` groups by `city. diversify.take` sets how many results to allow per group, enforcing a hard cap per market regardless of affinity score.

# Set take high enough to fill every bucket

<!-- curl@5 -->

Set the top-level take to at least cities multiplied by `diversify.take`. For 2 results across 5 cities, take=10 ensures enough candidates to fill each bucket. Avoid broad location filters like country-level queries — use a signal entity to drive geographic distribution instead.

# Handle the response

<!-- curl@ -->

Results come back interleaved across cities. Each entity's `properties.geocode` tells you which market it belongs to.
