---
updatedAt: 2026-07-20T16:07:12.000Z
---

# Search Entities by ID

Get entities based on an array of IDs.

# OpenAPI definition

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "Qloo API",
    "version": "2.0",
    "description": "Qloo's API",
    "contact": {
      "name": "Support",
      "email": "support@qloo.com"
    }
  },
  "servers": [
    {
      "url": "https://api.qloo.com",
      "description": "Production Qloo API server"
    }
  ],
  "security": [
    {
      "ApiKey": []
    }
  ],
  "tags": [
    {
      "name": "entities",
      "description": "Retrieve entity data"
    }
  ],
  "paths": {
    "/entities": {
      "get": {
        "summary": "Search Entities by ID",
        "x-readme-title": "Search Entities by ID",
        "x-readme-slug": "get-entities",
        "operationId": "get-entities",
        "description": "Get entities based on an array of IDs.",
        "tags": ["entities"],
        "parameters": [
          {
            "name": "entity_ids",
            "in": "query",
            "required": false,
            "description": "The entities to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string",
                "format": "uuid"
              }
            },
            "examples": {
              "entity-id-example": {
                "summary": "Example entity IDs",
                "value": ["E12201A5-CC50-40AF-97AE-C54A2CA303F7", "F6754C46-B3E7-457F-8B7E-06C613597320"]
              }
            }
          },
          {
            "name": "external.facebook.ids",
            "in": "query",
            "required": false,
            "description": "The Facebook IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.goodreads.ids",
            "in": "query",
            "required": false,
            "description": "The Goodreads Book IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.goodreads_author.ids",
            "in": "query",
            "required": false,
            "description": "The Goodreads Author IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.igdb.ids",
            "in": "query",
            "required": false,
            "description": "The external IGDB IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.imdb.ids",
            "in": "query",
            "required": false,
            "description": "The external IMDB IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.instagram.ids",
            "in": "query",
            "required": false,
            "description": "The external Instagram IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.isbn10.ids",
            "in": "query",
            "required": false,
            "description": "The external ISBN10 IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.isbn13.ids",
            "in": "query",
            "required": false,
            "description": "The external ISBN13 IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.itunes.ids",
            "in": "query",
            "required": false,
            "description": "The external iTunes IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.lastfm.ids",
            "in": "query",
            "required": false,
            "description": "The external Last.fm IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.library_of_congress.ids",
            "in": "query",
            "required": false,
            "description": "The external Library of Congress IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.metacritic.ids",
            "in": "query",
            "required": false,
            "description": "The external Metacritic IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.michelin.ids",
            "in": "query",
            "required": false,
            "description": "The external Michelin Guide IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.musicbrainz.ids",
            "in": "query",
            "required": false,
            "description": "The external MusicBrainz IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.rottentomatoes.ids",
            "in": "query",
            "required": false,
            "description": "The external Rotten Tomatoes IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.soundcloud.ids",
            "in": "query",
            "required": false,
            "description": "The external SoundCloud IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.spotify.ids",
            "in": "query",
            "required": false,
            "description": "The external Spotify IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.tablet.ids",
            "in": "query",
            "required": false,
            "description": "The external Tablet Hotels IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.twitch.ids",
            "in": "query",
            "required": false,
            "description": "The external Twitch IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.twitter.ids",
            "in": "query",
            "required": false,
            "description": "The external Twitter IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.wikidata.ids",
            "in": "query",
            "required": false,
            "description": "The external Wikidata IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "external.resy.ids",
            "in": "query",
            "required": false,
            "description": "The external Resy IDs to base the search on.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
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
              }
            }
          },
          "404": {
            "description": "No results",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "code": {
                      "type": "number",
                      "description": "HTTP error code"
                    },
                    "reason": {
                      "type": "string",
                      "description": "Description of error code"
                    },
                    "message": {
                      "type": "string",
                      "description": "Detailed description of why the request failed, where available."
                    }
                  },
                  "examples": [
                    {
                      "code": 400,
                      "reason": "Bad Request",
                      "message": "entity_ids must be specified."
                    }
                  ]
                }
              }
            }
          },
          "429": {
            "description": "Rate limit exceeded",
            "headers": {},
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "code": {
                      "type": "number",
                      "description": "HTTP error code"
                    },
                    "reason": {
                      "type": "string",
                      "description": "Description of error code"
                    },
                    "message": {
                      "type": "string",
                      "description": "Detailed description of why the request failed, where available."
                    }
                  },
                  "examples": [
                    {
                      "code": 400,
                      "reason": "Bad Request",
                      "message": "entity_ids must be specified."
                    }
                  ]
                }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "ApiKey": {
        "type": "apiKey",
        "in": "header",
        "name": "X-Api-Key"
      }
    }
  }
}
```
