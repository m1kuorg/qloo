# Get audiences

The Find Audiences API retrieves a list of audience IDs that can be used for filtering results and refining targeting in recommendations. You can use the returned audience IDs as values for `signal.demographics.audiences` to filter Insights API query results by specific audiences.

Contents:

1.  [Endpoint](#endpoint)
    1.  [Endpoint parameters](#endpoint-parameters)
1.  [Responses](#responses)
1.  [See also](#see-also)

## Endpoint

`GET https://api.qloo.com/v2/audiences`

Authentication: API key in the `X-Api-Key` header.

### Endpoint parameters

| Name                       | In    | Type            | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | ----- | --------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filter.parents.types`     | query | string          | No       | Filter by a comma-separated list of parental entity types. Allowed values: `urn:audience:communities`, `urn:audience:global_issues`, `urn:audience:hobbies_and_interests`, `urn:audience:investing_interests`, `urn:audience:leisure`, `urn:audience:life_stage`, `urn:audience:lifestyle_preferences_beliefs`, `urn:audience:political_preferences`, `urn:audience:professional_area`, `urn:audience:spending_habits`. |
| `filter.results.audiences` | query | array of string | No       | Filter by a comma-separated list of audience IDs.                                                                                                                                                                                                                                                                                                                                                                       |
| `filter.audience.types`    | query | array of string | No       | Filter by a list of audience types.                                                                                                                                                                                                                                                                                                                                                                                     |
| `filter.query`             | query | string          | No       | A partial string search on the audience or tag name.                                                                                                                                                                                                                                                                                                                                                                    |
| `filter.popularity.min`    | query | number          | No       | Filter by the minimum popularity percentile required for a Point of Interest (float, between 0 and 1; closer to 1 indicates higher popularity, e.g., 0.98 for the 98th percentile). Minimum: `0`. Maximum: `1`.                                                                                                                                                                                                         |
| `filter.popularity.max`    | query | number          | No       | Filter by the maximum popularity percentile a Point of Interest must have (float, between 0 and 1; closer to 1 indicates higher popularity, e.g., 0.98 for the 98th percentile). Minimum: `0`. Maximum: `1`.                                                                                                                                                                                                            |
| `page`                     | query | integer         | No       | The page number. Default: `1`. Minimum: `1`. Maximum: `100`.                                                                                                                                                                                                                                                                                                                                                            |
| `take`                     | query | integer         | No       | The number of results to return. Default is `20`. The maximum allowed is `50`. To retrieve additional results, use the `page` parameter to access the next page of results. This is the recommended approach for pagination. For specific cases, the `offset` parameter can be used with `take` to skip a set number of results. Default: `20`. Minimum: `1`. Maximum: `50`.                                            |

## Responses

- `200`: Successful Operation
- `400`: Bad Request
- `500`: Internal Server Error

Response `200` schema:

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "results": {
      "type": "object",
      "properties": {
        "entities": {
          "type": "array",
          "items": {}
        },
        "duration": {
          "type": "number"
        }
      }
    }
  }
}
```

## See also

- [Get audiences on docs.qloo.com](https://docs.qloo.com/reference/get-audiences), fetched 2026-10-16, page updated 2026-07-08
- [Get audience types](get-audience-types.md)
- [Insights API deep dive](insights-api-deep-dive.md)
