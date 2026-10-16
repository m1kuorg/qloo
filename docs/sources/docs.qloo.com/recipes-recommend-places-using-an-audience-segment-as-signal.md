---
updatedAt: 2026-05-14T17:16:36.000Z
---

# Recommend places using an audience segment as signal

```curl cURL
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:place \
  &signal.demographics.audiences=urn:audience:hobbies_and_interests:outdoors \
  &filter.tags=urn:tag:genre:place:hotel \
  &filter.location.query=Denver \
  &take=10' \
  --header 'X-Api-Key: <<apiKey>>'
```

```json Response Example
{
  "success": true,
  "results": {
    "entities": [
      {
        "name": "Gaylord Rockies Resort",
        "entity_id": "...",
        "type": "urn:entity",
        "subtype": "urn:entity:place",
        "query": {
          "affinity": 0.93
        }
      }
    ]
  }
}
```

# Pass an audience URN as signal

<!-- curl@3 -->

`signal.demographics.audiences` accepts the URN form, not the UUID. Find audience URNs by searching `/v2/audiences` first.

# Combine with tag and location filters

<!-- curl@4-5 -->

Audience signal works alongside any other filter. This example surfaces hotels in Denver that match the outdoor enthusiast audience.

# Handle the response

<!-- curl@ -->

Standard insights response with entities ranked by affinity to the audience profile.
