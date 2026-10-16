# Find a tag ID by keyword

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Search for a tag by keyword](#search-for-a-tag-by-keyword)
    1.  [Pick the right tag type for your use case](#pick-the-right-tag-type-for-your-use-case)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/v2/tags?filter.query=rooftop bar&take=3' \
  --header 'X-Api-Key: <<apiKey>>'
```

## Response example

```json
{
  "success": true,
  "results": {
    "tags": [
      {
        "id": "urn:tag:amenity:place:rooftop_bar",
        "name": "Rooftop Bar",
        "type": "urn:tag:amenity:place",
        "parents": [{ "type": "urn:entity:place" }],
        "popularity": 0.95
      }
    ]
  }
}
```

## Steps

### Search for a tag by keyword

Use `filter.query` to search by tag name. A single keyword can return multiple tag types, so review the results to pick the right one.

### Pick the right tag type for your use case

Each tag has a `type` (like urn:tag:amenity:place) and a `parents` array listing which entity types it applies to. Match the tag type to what you're filtering.

### Handle the response

Results return as r`esults.tags[]`, each with an `id` (the URN to use), `name`, `type`, and `parents[].type` for entity scope.

## See also

- [Find a tag ID by keyword on docs.qloo.com](https://docs.qloo.com/recipes/find-a-tag-id-by-keyword), fetched 2026-10-16, page updated 2026-05-14
- [Search tags](search-tags.md)
