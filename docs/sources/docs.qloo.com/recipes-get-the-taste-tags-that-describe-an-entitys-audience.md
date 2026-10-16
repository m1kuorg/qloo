---
updatedAt: 2026-05-14T17:20:22.000Z
---

# Get the taste tags that describe an entity's audience

```curl cURL
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:tag \
  &filter.tag.types=urn:tag:ambience:qloo \
  &signal.interests.entities=[RUCOLA_ENTITY_ID] \
  &take=10' \
  --header 'X-Api-Key: <<apiKey>>'
```

```json Response Example
{
  "success": true,
  "results": {
    "tags": [
      {
        "tag_id": "urn:tag:ambience:qloo:intimate",
        "name": "Intimate",
        "types": ["urn:tag"],
        "subtype": "urn:tag:ambience:qloo",
        "query": {
          "affinity": 0.992
        }
      }
    ]
  }
}
```

# Set filter.type to urn:tag

<!-- curl@2 -->

Most insights calls return entities. Setting filter.type=urn:tag returns tags instead, scored by how strongly they apply to the signal entity's audience.

# Scope to a specific tag category

<!-- curl@3 -->

Use `filter.tag.types` to limit results to a tag dimension like ambience, lifestyle, or genre. Without this, results span all tag types.

# Handle the response

<!-- curl@ -->

Results return as `results.tags[]` with `tag_id`, `name`, and `query.affinity` showing how strongly the tag applies to the signal audience.
