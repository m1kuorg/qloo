---
updatedAt: 2026-05-14T17:19:51.000Z
---

# Recommend movies using weighted tag signals

```curl cURL
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:movie \
  &signal.interests.tags=urn:tag:genre:media:horror,urn:tag:genre:media:thriller \
  &signal.interests.tags.weights=20,7 \
  &take=10' \
  --header 'X-Api-Key: <<apiKey>>'
```

```json Response Example
{
  "success": true,
  "results": {
    "entities": [
      {
        "name": "Doctor Sleep",
        "entity_id": "...",
        "type": "urn:entity",
        "subtype": "urn:entity:movie",
        "query": {
          "affinity": 0.94
        }
      }
    ]
  }
}
```

# Pass tags and weights as parallel arrays

<!-- curl@3-4 -->

`signal.interests.tags` takes a comma-separated list of tag URNs. `signal.interests.tags.weights` takes a parallel comma-separated list of integer weights. Higher weights pull results harder toward that tag.

# Use the right tag URNs for the entity type

<!-- curl@3 -->

Movie tags use the `urn:tag:genre:media`: prefix. Search `/v2/tags` first if you're unsure which URN to use.

# Handle the response

<!-- curl@ -->

Standard insights response with results ranked by combined affinity across the weighted tag inputs.
