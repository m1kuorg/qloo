# Get audience types

The Get Audience Types API returns all available audience type IDs, representing different audience categories. You can use this API to explore audience classifications and refine searches in the Find Audiences API. Including `filter.parents.types` allows you to narrow results by relevant entity types.

Contents:

1.  [Endpoint](#endpoint)
    1.  [Endpoint parameters](#endpoint-parameters)
1.  [Responses](#responses)
1.  [See also](#see-also)

## Endpoint

`GET https://api.qloo.com/v2/audiences/types`

Authentication: API key in the `X-Api-Key` header.

### Endpoint parameters

| Name                   | In    | Type    | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ----- | ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filter.parents.types` | query | string  | No       | Filter by a comma-separated list of parental entity types. Allowed values: `urn:audience:communities`, `urn:audience:global_issues`, `urn:audience:hobbies_and_interests`, `urn:audience:investing_interests`, `urn:audience:leisure`, `urn:audience:life_stage`, `urn:audience:lifestyle_preferences_beliefs`, `urn:audience:political_preferences`, `urn:audience:professional_area`, `urn:audience:spending_habits`. |
| `page`                 | query | integer | No       | The page number. Default: `1`. Minimum: `1`. Maximum: `100`.                                                                                                                                                                                                                                                                                                                                                            |
| `take`                 | query | integer | No       | The number of results to return. Default is `20`. The maximum allowed is `50`. To retrieve additional results, use the `page` parameter to access the next page of results. This is the recommended approach for pagination. For specific cases, the `offset` parameter can be used with `take` to skip a set number of results. Default: `20`. Minimum: `1`. Maximum: `50`.                                            |

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

- [Get audience types on docs.qloo.com](https://docs.qloo.com/reference/get-audience-types), fetched 2026-10-16, page updated 2026-07-08
- [Get audiences](get-audiences.md)
