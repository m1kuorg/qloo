# Search for an entity by name

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Search by name and entity type](#search-by-name-and-entity-type)
    1.  [Use the entity ID in subsequent calls](#use-the-entity-id-in-subsequent-calls)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/search?query=Balthazar&types=urn:entity:place&take=3' \
  --header 'X-Api-Key: <<apiKey>>'
```

## Response example

```json
{
  "results": [
    {
      "name": "Balthazar",
      "entity_id": "FCE8B172-4795-43E4-B222-3B550DC05FD9",
      "types": ["urn:entity:place"],
      "popularity": 0.998,
      "properties": {}
    }
  ]
}
```

## Steps

### Search by name and entity type

Use `query` for the search string and types to scope to a specific entity category.

### Use the entity ID in subsequent calls

The returned entity_id is what you pass as signal.interests.entities in /v2/insights. Most recipes assume you already have an entity ID, this is where you get it.

### Handle the response

Results come back as a flat array under results, not nested under `results.entities`. Each result includes `name`, `entity_id`, `types`, `properties`, and `popularity`.

## See also

- [Search for an entity by name on docs.qloo.com](https://docs.qloo.com/recipes/search-for-an-entity-by-name), fetched 2026-10-16, page updated 2026-05-14
- [Search entities](search-entities.md)
