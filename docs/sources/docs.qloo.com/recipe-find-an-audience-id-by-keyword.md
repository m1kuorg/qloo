# Find an audience ID by keyword

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Search for an audience by keyword](#search-for-an-audience-by-keyword)
    1.  [Use the URN form, not the UUID](#use-the-urn-form-not-the-uuid)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/v2/audiences?filter.query=sustainability&take=3' \
  --header 'X-Api-Key: <<apiKey>>'
```

## Response example

```json
{
  "success": true,
  "results": {
    "audiences": [
      {
        "id": "urn:audience:global_issues:sustainability",
        "entity_id": "...",
        "name": "Sustainability",
        "type": "urn:audience:global_issues",
        "parents": []
      }
    ]
  }
}
```

## Steps

### Search for an audience by keyword

Use `filter.query` to search by name. Qloo's audience taxonomy covers life stages, hobbies, spending habits, political preferences, and professional categories.

### Use the URN form, not the UUID

Each result returns both an `id` (URN like `urn:audience:hobbies_and_interests:outdoors`) and an `entity_id` (UUID). Use the URN when passing to `signal.demographics.audiences`.

### Handle the response

Results return as r`esults.audiences[]` with the URN `id`, `name`, `type`, and `parents[]`.

## See also

- [Find an audience ID by keyword on docs.qloo.com](https://docs.qloo.com/recipes/find-an-audience-id-by-keyword), fetched 2026-10-16, page updated 2026-05-14
- [Get audiences](get-audiences.md)
