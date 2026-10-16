# Recommend movies using weighted tag signals

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Pass tags and weights as parallel arrays](#pass-tags-and-weights-as-parallel-arrays)
    1.  [Use the right tag URNs for the entity type](#use-the-right-tag-urns-for-the-entity-type)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:movie \
  &signal.interests.tags=urn:tag:genre:media:horror,urn:tag:genre:media:thriller \
  &signal.interests.tags.weights=20,7 \
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

## Steps

### Pass tags and weights as parallel arrays

`signal.interests.tags` takes a comma-separated list of tag URNs. `signal.interests.tags.weights` takes a parallel comma-separated list of integer weights. Higher weights pull results harder toward that tag.

### Use the right tag URNs for the entity type

Movie tags use the `urn:tag:genre:media`: prefix. Search `/v2/tags` first if you're unsure which URN to use.

### Handle the response

Standard insights response with results ranked by combined affinity across the weighted tag inputs.

## See also

- [Recommend movies using weighted tag signals on docs.qloo.com](https://docs.qloo.com/recipes/recommend-movies-using-weighted-tag-signals), fetched 2026-10-16, page updated 2026-05-14
- [Insights API deep dive](insights-api-deep-dive.md)
