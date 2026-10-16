# Search tags

Search for tags that are supported by the `filter.tags`, `exclude.tags`, and `signal.interests.tags` parameters.

Contents:

1.  [Endpoint](#endpoint)
    1.  [Endpoint parameters](#endpoint-parameters)
1.  [Responses](#responses)
1.  [See also](#see-also)

## Endpoint

`GET https://api.qloo.com/v2/tags`

Authentication: API key in the `X-Api-Key` header.

### Endpoint parameters

| Name                      | In    | Type            | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------- | ----- | --------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feature.typo_tolerance`  | query | boolean         | No       | When set to true, allows tolerance for typos in the `filter.query parameter`. For example, a query for “Mediterranaen” would return tags with the word “Mediterranean” in their titles. Default is false. Default: `false`.                                                                                                                                                                                             |
| `feature.semantic_search` | query | boolean         | No       | When set to `true`, enables semantic search for tag queries. Instead of exact or typo-tolerant matching, the API uses semantic similarity to find tags related to the meaning of the query. This feature is currently in beta. Use alongside `filter.query` to perform a semantic tag search. Default: `false`.                                                                                                         |
| `filter.results.tags`     | query | array of string | No       | Filter by a comma-separated list of tag IDs. Often used to assess the affinity of a tag towards input.                                                                                                                                                                                                                                                                                                                  |
| `filter.parents.types`    | query | string          | No       | Filter by a comma-separated list of parental entity types. Allowed values: `urn:audience:communities`, `urn:audience:global_issues`, `urn:audience:hobbies_and_interests`, `urn:audience:investing_interests`, `urn:audience:leisure`, `urn:audience:life_stage`, `urn:audience:lifestyle_preferences_beliefs`, `urn:audience:political_preferences`, `urn:audience:professional_area`, `urn:audience:spending_habits`. |
| `filter.popularity.min`   | query | number          | No       | Filter by the minimum popularity percentile required for a Point of Interest (float, between 0 and 1; closer to 1 indicates higher popularity, e.g., 0.98 for the 98th percentile). Minimum: `0`. Maximum: `1`.                                                                                                                                                                                                         |
| `filter.popularity.max`   | query | number          | No       | Filter by the maximum popularity percentile a Point of Interest must have (float, between 0 and 1; closer to 1 indicates higher popularity, e.g., 0.98 for the 98th percentile). Minimum: `0`. Maximum: `1`.                                                                                                                                                                                                            |
| `filter.query`            | query | string          | No       | A partial string search on the audience or tag name.                                                                                                                                                                                                                                                                                                                                                                    |
| `filter.tag.types`        | query | array of string | No       | Filter by a comma-separated list of tag types. Each tag type requires an exact match. You can retrieve a list of tag types supported by each entity type via the Tag Types API.                                                                                                                                                                                                                                         |
| `page`                    | query | integer         | No       | The page number. Default: `1`. Minimum: `1`. Maximum: `100`.                                                                                                                                                                                                                                                                                                                                                            |
| `take`                    | query | integer         | No       | The number of results to return. Default is `20`. The maximum allowed is `50`. To retrieve additional results, use the `page` parameter to access the next page of results. This is the recommended approach for pagination. For specific cases, the `offset` parameter can be used with `take` to skip a set number of results. Default: `20`. Minimum: `1`. Maximum: `50`.                                            |

## Responses

- `200`: Successful Operation
- `400`: Bad Request
- `500`: Internal Server Error

Response `200` schema:

```json
{
  "type": "object",
  "properties": {
    "duration": {
      "type": "number"
    },
    "success": {
      "type": "boolean"
    },
    "results": {
      "type": "object",
      "properties": {
        "tags": {
          "type": "array",
          "items": {}
        }
      }
    }
  }
}
```

## See also

- [Search tags on docs.qloo.com](https://docs.qloo.com/reference/search-tags), fetched 2026-10-16, page updated 2026-07-08
- [Get tag types](get-tag-types.md)
- [Insights API deep dive](insights-api-deep-dive.md)
