# Get API information

Returns general information about the Qloo API, including the current version, deployment date, and contact details.

Contents:

1.  [Endpoint](#endpoint)
1.  [Responses](#responses)
1.  [See also](#see-also)

## Endpoint

`GET https://api.qloo.com/`

Authentication: API key in the `X-Api-Key` header.

## Responses

- `200`: OK
- `404`: No results
- `429`: Rate limit exceeded

Response `200` schema:

```json
{
  "properties": {
    "version": {
      "type": "string"
    },
    "title": {
      "type": "string"
    },
    "description": {
      "type": "string"
    },
    "contact": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string"
        },
        "url": {
          "type": "string"
        },
        "email": {
          "type": "string"
        }
      }
    }
  }
}
```

## See also

- [Get API information on docs.qloo.com](https://docs.qloo.com/reference/api-information), fetched 2026-10-16, page updated 2026-07-20
- [API overview](api-overview.md)
