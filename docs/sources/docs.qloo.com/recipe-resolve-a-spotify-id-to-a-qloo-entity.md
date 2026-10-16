# Resolve a Spotify ID to a Qloo entity

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Pass the external ID](#pass-the-external-id)
    1.  [Use the returned entity ID as signal](#use-the-returned-entity-id-as-signal)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/entities/?external.spotify.ids=74KM79TiuVKeVCqs8QtB0B&take=1' \
  --header 'X-Api-Key: <<apiKey>>'
```

## Response example

```json
{
  "results": [
    {
      "name": "Sabrina Carpenter",
      "entity_id": "F5453A45-593C-41EC-BD5A-453D1AEC565C",
      "types": ["urn:entity:artist"],
      "properties": {
        "external": {
          "spotify": {
            "id": "74KM79TiuVKeVCqs8QtB0B"
          }
        }
      }
    }
  ]
}
```

## Steps

### Pass the external ID

Use `external.spotify.ids` with the Spotify artist ID. The parameter name follows the pattern `external.[namespace].ids` — swap the namespace for IMDB, Resy, ISBN, and others.

### Use the returned entity ID as signal

Take the `entity_id` from the response and pass it as `signal.interests.entities` in a subsequent `/v2/insights` call. Note that the `/entities` endpoint returns results as a flat array, not `results.entities`.

## See also

- [Resolve a Spotify ID to a Qloo entity on docs.qloo.com](https://docs.qloo.com/recipes/resolve-a-spotify-id-to-a-qloo-entity), fetched 2026-10-16, page updated 2026-05-14
- [Search entities by ID](search-entities-by-id.md)
