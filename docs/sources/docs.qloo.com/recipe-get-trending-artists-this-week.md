# Get trending artists this week

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Set the date window](#set-the-date-window)
    1.  [Scope to an entity type](#scope-to-an-entity-type)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/v2/trending/?filter.type=urn:entity:artist \
  &filter.start_date=2026-05-05 \
  &filter.end_date=2026-05-12 \
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
        "name": "Sabrina Carpenter",
        "entity_id": "...",
        "type": "urn:entity:artist",
        "properties": {
          "trend_rank": 1
        }
      }
    ]
  }
}
```

## Steps

### Set the date window

`filter.start_date` and `filter.end_date` are required. The endpoint compares activity within this window against the prior period to calculate trend velocity. A 7-day window is the most common usage.

### Scope to an entity type

Use `filter.type` to limit results to a specific category. The trending endpoint supports any entity type — artists, TV shows, places, brands, and more.

### Handle the response

Results are ranked by trend velocity, not overall popularity. An entity near the top may not be globally famous — it's rising fastest within the window.

## See also

- [Get trending artists this week on docs.qloo.com](https://docs.qloo.com/recipes/get-trending-artists-this-week), fetched 2026-10-16, page updated 2026-05-14
- [Get trending data](get-trending-data.md)
