# Get trending data

The Trending API provides time-series data showing the popularity trends of a specific entity over a given time period. It returns weekly trending statistics including population percentile, rank, velocity, and acceleration metrics for the specified entity. Results are ordered by date in descending order. Use this endpoint to monitor how an entity's popularity evolves over time.

Contents:

1.  [Endpoint](#endpoint)
    1.  [Endpoint parameters](#endpoint-parameters)
1.  [Responses](#responses)
1.  [See also](#see-also)

## Endpoint

`GET https://api.qloo.com/v2/trending`

Authentication: API key in the `X-Api-Key` header.

### Endpoint parameters

| Name                        | In    | Type            | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | ----- | --------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signal.interests.entities` | query | array of string | No       | A comma-separated list of entity IDs that influence the affinity score.                                                                                                                                                                                                                                                                                                                                                             |
| `filter.type`               | query | string          | Yes      | Filter by the category of entity to return (urn:entity:place). The `urn:entity:audience` value is deprecated and should not be used for new integrations. Allowed values: `urn:entity:artist`, `urn:entity:book`, `urn:entity:brand`, `urn:entity:locality`, `urn:entity:movie`, `urn:entity:person`, `urn:entity:place`, `urn:entity:podcast`, `urn:entity:tv_show`, `urn:entity:videogame`, `urn:heatmap`, `urn:entity:audience`. |
| `filter.start_date`         | query | string          | Yes      | Start date for the trending analysis period in ISO 8601 format (YYYY-MM-DD).                                                                                                                                                                                                                                                                                                                                                        |
| `filter.end_date`           | query | string          | Yes      | End date for the trending analysis period in ISO 8601 format (YYYY-MM-DD).                                                                                                                                                                                                                                                                                                                                                          |
| `take`                      | query | integer         | No       | The number of results to return. Default is `20`. The maximum allowed is `50`. To retrieve additional results, use the `page` parameter to access the next page of results. This is the recommended approach for pagination. For specific cases, the `offset` parameter can be used with `take` to skip a set number of results. Default: `20`. Minimum: `1`. Maximum: `50`.                                                        |
| `offset`                    | query | integer         | No       | The number of results to skip, starting from 0. Allows arbitrary offsets but is less commonly used than `page`.                                                                                                                                                                                                                                                                                                                     |
| `page`                      | query | integer         | No       | The page number of results to return. This is equivalent to take + offset and is the recommended approach for most use cases. Minimum: `1`.                                                                                                                                                                                                                                                                                         |

## Responses

- `200`: Successful Operation
- `400`: Bad Request — invalid parameters or missing required fields
- `500`: Internal Server Error

Response `200` schema:

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "example": true
    },
    "duration": {
      "type": "number",
      "example": 123
    },
    "results": {
      "type": "object",
      "properties": {
        "trending": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "date": {
                "type": "string",
                "format": "date",
                "example": "2025-01-03"
              },
              "population_percentile": {
                "type": "number",
                "example": 85.2
              },
              "population_rank": {
                "type": "integer",
                "example": 150
              },
              "population_rank_velocity": {
                "type": "integer",
                "example": 5
              },
              "velocity_fold_change": {
                "type": "number",
                "example": 1.15
              },
              "population_percent_delta": {
                "type": "number",
                "example": 1.15
              }
            }
          }
        }
      }
    }
  }
}
```

## See also

- [Get trending data on docs.qloo.com](https://docs.qloo.com/reference/get-trending), fetched 2026-10-16, page updated 2026-07-08
- [Search entities](search-entities.md)
