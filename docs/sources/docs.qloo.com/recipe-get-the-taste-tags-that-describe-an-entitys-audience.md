# Get the taste tags that describe an entity's audience

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Set filter.type to urn:tag](#set-filtertype-to-urntag)
    1.  [Scope to a specific tag category](#scope-to-a-specific-tag-category)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:tag \
  &filter.tag.types=urn:tag:ambience:qloo \
  &signal.interests.entities=[RUCOLA_ENTITY_ID] \
  &take=10' \
  --header 'X-Api-Key: <<apiKey>>'
```

## Response example

```json
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

## Steps

### Set filter.type to urn:tag

Most insights calls return entities. Setting filter.type=urn:tag returns tags instead, scored by how strongly they apply to the signal entity's audience.

### Scope to a specific tag category

Use `filter.tag.types` to limit results to a tag dimension like ambience, lifestyle, or genre. Without this, results span all tag types.

### Handle the response

Results return as `results.tags[]` with `tag_id`, `name`, and `query.affinity` showing how strongly the tag applies to the signal audience.

## See also

- [Get the taste tags that describe an entity's audience on docs.qloo.com](https://docs.qloo.com/recipes/get-the-taste-tags-that-describe-an-entitys-audience), fetched 2026-10-16, page updated 2026-05-14
- [Insights API deep dive](insights-api-deep-dive.md)
