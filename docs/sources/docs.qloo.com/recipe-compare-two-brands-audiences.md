# Compare two brands' audiences

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Pass two signals using a. and b. prefixes](#pass-two-signals-using-a-and-b-prefixes)
    1.  [Read the shared tags from the response](#read-the-shared-tags-from-the-response)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/v2/analysis/compare?a.signal.interests.entities=[LULULEMON_ENTITY_ID] \
  &b.signal.interests.entities=[PATAGONIA_ENTITY_ID] \
  &take=10' \
  --header 'X-Api-Key: <<apiKey>>'
```

## Response example

```json
{
  "duration": 0.42,
  "results": {
    "tags": [
      {
        "tag_id": "urn:tag:style:qloo:athletic",
        "name": "Athletic",
        "type": "urn:tag",
        "subtype": "urn:tag:style:qloo",
        "popularity": 0.91,
        "query": {
          "score": 0.729
        }
      }
    ]
  }
}
```

## Steps

### Pass two signals using a. and b. prefixes

Each side accepts the full insights parameter set with an `a.` or `b.` prefix. Most common pattern is comparing two entities as signals.

### Read the shared tags from the response

The endpoint always returns tags, never entities, regardless of what you passed in. Each tag includes a `score` showing how strongly both audiences index for it.

### Handle the response

Top-level keys are `duration` and `results` only, with no `success` field. Results live in `results.tags[]` with `tag_id`, `name`, `popularity`, and `query.score`.

## See also

- [Compare two brands' audiences on docs.qloo.com](https://docs.qloo.com/recipes/compare-two-brands-audiences), fetched 2026-10-16, page updated 2026-05-14
- [Analysis compare](analysis-compare.md)
