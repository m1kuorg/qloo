---
updatedAt: 2026-05-14T17:36:04.000Z
---

# Resolve a Spotify ID to a Qloo entity

```curl cURL
curl --request GET \
  --url 'https://api.qloo.com/entities/?external.spotify.ids=74KM79TiuVKeVCqs8QtB0B&take=1' \
  --header 'X-Api-Key: <<apiKey>>'
```

```json Response Example
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

# Pass the external ID

<!-- curl@2 -->

Use `external.spotify.ids` with the Spotify artist ID. The parameter name follows the pattern `external.[namespace].ids` — swap the namespace for IMDB, Resy, ISBN, and others.

# Use the returned entity ID as signal

<!-- curl@ -->

Take the `entity_id` from the response and pass it as `signal.interests.entities` in a subsequent `/v2/insights` call. Note that the `/entities` endpoint returns results as a flat array, not `results.entities`.
