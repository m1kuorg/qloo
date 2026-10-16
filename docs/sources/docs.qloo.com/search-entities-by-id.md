# Search entities by ID

Get entities based on an array of IDs.

Contents:

1.  [Endpoint](#endpoint)
    1.  [Endpoint parameters](#endpoint-parameters)
1.  [Responses](#responses)
1.  [See also](#see-also)

## Endpoint

`GET https://api.qloo.com/entities`

Authentication: API key in the `X-Api-Key` header.

### Endpoint parameters

| Name                               | In    | Type            | Required | Description                                                 |
| ---------------------------------- | ----- | --------------- | -------- | ----------------------------------------------------------- |
| `entity_ids`                       | query | array of string | No       | The entities to base the search on.                         |
| `external.facebook.ids`            | query | array of string | No       | The Facebook IDs to base the search on.                     |
| `external.goodreads.ids`           | query | array of string | No       | The Goodreads Book IDs to base the search on.               |
| `external.goodreads_author.ids`    | query | array of string | No       | The Goodreads Author IDs to base the search on.             |
| `external.igdb.ids`                | query | array of string | No       | The external IGDB IDs to base the search on.                |
| `external.imdb.ids`                | query | array of string | No       | The external IMDB IDs to base the search on.                |
| `external.instagram.ids`           | query | array of string | No       | The external Instagram IDs to base the search on.           |
| `external.isbn10.ids`              | query | array of string | No       | The external ISBN10 IDs to base the search on.              |
| `external.isbn13.ids`              | query | array of string | No       | The external ISBN13 IDs to base the search on.              |
| `external.itunes.ids`              | query | array of string | No       | The external iTunes IDs to base the search on.              |
| `external.lastfm.ids`              | query | array of string | No       | The external Last.fm IDs to base the search on.             |
| `external.library_of_congress.ids` | query | array of string | No       | The external Library of Congress IDs to base the search on. |
| `external.metacritic.ids`          | query | array of string | No       | The external Metacritic IDs to base the search on.          |
| `external.michelin.ids`            | query | array of string | No       | The external Michelin Guide IDs to base the search on.      |
| `external.musicbrainz.ids`         | query | array of string | No       | The external MusicBrainz IDs to base the search on.         |
| `external.rottentomatoes.ids`      | query | array of string | No       | The external Rotten Tomatoes IDs to base the search on.     |
| `external.soundcloud.ids`          | query | array of string | No       | The external SoundCloud IDs to base the search on.          |
| `external.spotify.ids`             | query | array of string | No       | The external Spotify IDs to base the search on.             |
| `external.tablet.ids`              | query | array of string | No       | The external Tablet Hotels IDs to base the search on.       |
| `external.twitch.ids`              | query | array of string | No       | The external Twitch IDs to base the search on.              |
| `external.twitter.ids`             | query | array of string | No       | The external Twitter IDs to base the search on.             |
| `external.wikidata.ids`            | query | array of string | No       | The external Wikidata IDs to base the search on.            |
| `external.resy.ids`                | query | array of string | No       | The external Resy IDs to base the search on.                |

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

- [Search entities by ID on docs.qloo.com](https://docs.qloo.com/reference/get-entities), fetched 2026-10-16, page updated 2026-07-20
- [Search entities](search-entities.md)
