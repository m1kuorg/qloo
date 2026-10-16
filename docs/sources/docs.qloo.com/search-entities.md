# Search entities

Search for an entity by name or property.

Contents:

1.  [Endpoint](#endpoint)
    1.  [Endpoint parameters](#endpoint-parameters)
1.  [Responses](#responses)
1.  [See also](#see-also)

## Endpoint

`GET https://api.qloo.com/search`

Authentication: API key in the `X-Api-Key` header.

### Endpoint parameters

| Name                   | In    | Type            | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ----- | --------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query`                | query | string          | No       | The text to search against.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `types`                | query | array of string | No       | The category to search against. The following values are legacy types available for search only and are not supported in `/v2/insights`: `urn:entity:actor` - `urn:entity:album` - `urn:entity:author` - `urn:entity:director` - `urn:entity:locality` Allowed values: `urn:entity:artist`, `urn:entity:book`, `urn:entity:brand`, `urn:entity:locality`, `urn:entity:movie`, `urn:entity:person`, `urn:entity:place`, `urn:entity:podcast`, `urn:entity:tv_show`, `urn:entity:videogame`, `urn:heatmap`, `urn:entity:audience`. |
| `filter.location`      | query | string          | No       | A location to base searches on. Accepts a lat/lon coordinate pair or a WKT geometry string. Also accepts a Qloo entity UUID. **Lat/lon coordinate pair**: `latitude,longitude` (e.g. `40.742306,-74.003494`); **WKT geometry string**: a Well-Known Text geometry such as `POINT(-73.99823 40.722668)`; **Qloo entity UUID**: a Qloo entity ID.                                                                                                                                                                                  |
| `filter.radius`        | query | number          | No       | The max distance in miles from the location to base results on. This only applies to categories with geolocation data. Default is 10 miles. Default: `10`. Minimum: `0`. Maximum: `100`.                                                                                                                                                                                                                                                                                                                                         |
| `filter.exists`        | query | array of string | No       | Filter results by existential property check like `external.resy` or `external.michelin`                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `filter.tags`          | query | array of string | No       | Filter results by a tag.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `filter.rating`        | query | number          | No       | Filter by the lowest desired business rating. Minimum: `0`. Maximum: `5`.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `filter.popularity`    | query | number          | No       | The minimum value of popularity an entity must have to be output. Minimum: `0`. Maximum: `1`.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `filter.address`       | query | string          | No       | Filter by address using a partial string match. Supports comma-separated terms.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `operator.filter.tags` | query | string          | No       | The operator.filter.tags parameter controls whether the API returns results matching all ("intersection") or any ("union") of the input tags. Allowed values: `intersection`, `union`. Default: `"union"`.                                                                                                                                                                                                                                                                                                                       |
| `page`                 | query | integer         | No       | The page number. Default: `1`. Minimum: `1`. Maximum: `100`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `take`                 | query | integer         | No       | Number of results to return.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `sort_by`              | query | string          | No       | Sort results by criteria. Allowed values: `match`, `distance`, `popularity`. Default: `"match"`.                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Responses

- `200`: OK
- `404`: No results
- `429`: Rate limit exceeded

Response `200` schema:

```json
{
  "allOf": [
    {
      "type": "object",
      "properties": {
        "success": {
          "type": "boolean",
          "examples": [
            {
              "summary": "Indicates the request was successful",
              "value": true
            }
          ]
        },
        "duration": {
          "type": "number",
          "format": "float",
          "examples": [
            {
              "summary": "Time taken to process the request (in seconds)",
              "value": 0.1
            }
          ]
        }
      }
    },
    {
      "type": "object",
      "properties": {
        "results": {
          "type": "array",
          "items": {
            "oneOf": [
              {
                "$include#1": "./Common.yml",
                "$include#2": "./UniqueToArtist.yml"
              },
              {
                "$include#1": "./Common.yml",
                "$include#2": "./UniqueToGeolocational.yml"
              },
              {
                "$include#1": "./Common.yml",
                "$include#2": "./UniqueToMovie.yml"
              },
              {
                "$include#1": "./Common.yml",
                "$include#2": "./UniqueToTV.yml"
              },
              {
                "$include#1": "./Common.yml",
                "$include#2": "./UniqueToVideogame.yml"
              }
            ]
          },
          "examples": [
            {
              "$include": "../../examples/entity.yml"
            }
          ]
        }
      }
    }
  ]
}
```

## See also

- [Search entities on docs.qloo.com](https://docs.qloo.com/reference/get-search), fetched 2026-10-16, page updated 2026-07-20
- [Search entities by ID](search-entities-by-id.md)
