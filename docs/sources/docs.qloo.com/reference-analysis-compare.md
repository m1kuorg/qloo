---
updatedAt: 2026-07-08T16:57:19.000Z
---

# Analysis Compare

Analyze and compare two groups of entities.

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
      "name": "analysis",
      "description": "Features for anaylzing and comparing entities."
    }
  ],
  "paths": {
    "/v2/analysis/compare": {
      "get": {
        "summary": "Analysis Compare",
        "x-readme-title": "Analysis Compare",
        "operationId": "analysis-compare",
        "description": "Analyze and compare two groups of entities.",
        "tags": ["analysis"],
        "parameters": [
          {
            "name": "a.signal.interests.entities",
            "in": "query",
            "required": true,
            "description": "The first group of entities to base the comparison on.",
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "examples": {
              "example1": {
                "value": ["entity5"]
              }
            }
          },
          {
            "name": "b.signal.interests.entities",
            "in": "query",
            "required": true,
            "description": "The second group of entities to base the comparison on.",
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "examples": {
              "example1": {
                "value": ["entity5"]
              }
            }
          },
          {
            "name": "filter.type",
            "in": "query",
            "required": false,
            "description": "The category to search against.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "description": "Qloo Types supported by Insights API. Note: `urn:entity:locality` is partially supported and only allows `signal.interests.entities` when the provided entities are localities.\n",
                "type": "string",
                "enum": [
                  "urn:entity:artist",
                  "urn:entity:book",
                  "urn:entity:brand",
                  "urn:entity:locality",
                  "urn:entity:movie",
                  "urn:entity:person",
                  "urn:entity:place",
                  "urn:entity:podcast",
                  "urn:entity:tv_show",
                  "urn:entity:videogame",
                  "urn:heatmap",
                  "urn:entity:audience"
                ],
                "x-enum-descriptions": [
                  "Artist",
                  "Book",
                  "Brand",
                  "Locality (partially supported)",
                  "Movie",
                  "Person",
                  "Place",
                  "Podcast",
                  "TV show",
                  "Videogame",
                  "Heatmap",
                  "Audience (deprecated)"
                ],
                "examples": [
                  {
                    "summary": "Artist type",
                    "value": "urn:entity:artist"
                  },
                  {
                    "summary": "TV show type",
                    "value": "urn:entity:tv_show"
                  }
                ]
              }
            },
            "examples": {
              "movie-and-tv": {
                "value": ["urn:entity:movie", "urn:entity:tv_show"]
              }
            }
          },
          {
            "name": "filter.entities.query",
            "in": "query",
            "description": "A query string used to search for entity IDs to filter results. This allows\nyou to supply a human-readable term which the system resolves to one or more\nmatching entity identifiers.\n",
            "required": false,
            "schema": {
              "type": "string",
              "examples": ["restaurant"]
            }
          },
          {
            "name": "filter.exclude.entities.query",
            "in": "query",
            "description": "This parameter can only be supplied when using POST HTTP method, since it requires JSON encoded body.\nThe value for `filter.exclude.entities.query` is a JSON array with objects containing the `name` and `address` properties.\nFor a fuzzier search, just include an array of strings.\nWhen supplied, it overwrites the `filter.exclude.entities` object with resolved entity IDs.\nThe response will contain a path `query.entities.exclude`, with partial Qloo entities that were matched by the query.\nIf no entities are found, the API will throw a `400` error.\n",
            "required": false,
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {
                      "name": {
                        "type": "string"
                      },
                      "address": {
                        "type": "string"
                      }
                    }
                  },
                  {
                    "type": "string"
                  }
                ]
              },
              "examples": [
                {
                  "name": "Balthazar",
                  "address": "80 Spring St, New York"
                },
                "Balthazar"
              ]
            }
          },
          {
            "name": "filter.location.query",
            "in": "query",
            "description": "A text-based name lookup used to search for one or more named `urn:entity:locality` Qloo IDs for filtering requests. This parameter performs fuzzy text matching only — it will not work with a UUID or Qloo entity ID. To pass a locality ID directly, use `filter.location` instead.\n  - For **GET requests**: Provide a single locality query as a string.\n  - For **POST requests**:\n    - You can still send a single locality as a string.\n    - Or you can send an array of locality names to query multiple localities\nat once. When multiple localities are provided, their geographic shapes are merged, and the system returns results with the highest affinities across the combined area.\nLocality queries are fuzzy-matched and case-insensitive. Examples include `New York City`, `Garden City`, `New York`, `Los Angeles`, `Lower East Side`, and AKAs like `The Big Apple`. When a single locality is supplied, the response JSON includes `query.locality.signal` with the matched Qloo entity. If multiple are supplied, this field is omitted. By default, the API includes a tuning that also captures nearby entities just outside the official boundaries of the locality. To turn this off and limit results strictly to within the locality, set `filter.location.radius=0`. If no localities are found, the API returns a 400 error.\n",
            "required": false,
            "schema": {
              "oneOf": [
                {
                  "type": "string"
                },
                {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              ]
            },
            "examples": {
              "singleLocality": {
                "summary": "A single locality string",
                "value": "New York City"
              },
              "multipleLocalities": {
                "summary": "An array of locality strings (POST only)",
                "value": ["Miami", "Miami Beach"]
              }
            }
          },
          {
            "name": "filter.location.radius",
            "in": "query",
            "description": "Filter by the radius (in meters) when also supplying `filter.location` or `filter.location.query`.\nWhen a locality is passed via `filter.location` or `filter.location.query` and this parameter is **not provided**, the API expands the locality boundary by the lesser of 10% of the locality's diameter or 2,414 meters (~1.5 miles).\nSetting this parameter to **0** disables this padding and restricts results strictly to within the locality boundary.\nA larger value pads the boundary by that radius in meters.\n",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 15000,
              "maximum": 800000
            },
            "examples": {
              "defaultRadius": {
                "summary": "Custom radius in meters",
                "value": 10000
              },
              "disableTuning": {
                "summary": "Turn off default tuning behavior",
                "value": 0
              }
            }
          },
          {
            "name": "filter.exclude.location.query",
            "in": "query",
            "description": "A query used to exclude results based on one or more named `urn:entity:locality` Qloo IDs, resolved from fuzzy-matched locality names.   This is equivalent to passing the resolved Locality Qloo ID(s) into `filter.exclude.location`.\n- For **GET requests**: Provide a single locality query as a string. - For **POST requests**:\n  - You can still send a single locality as a string.\n  - Or send an array of locality names to exclude multiple areas at once. When\nmultiple localities are provided, their geographic shapes are merged, and the system excludes results from across the combined area.\nLocality queries are case-insensitive and support common AKAs (e.g., `The Big Apple` for New York).   When a single locality is supplied, the response includes `query.locality.exclude.signal` with the matched Qloo entity.   If multiple are supplied, this field is omitted. If no localities are matched, the API returns a 400 error.\n",
            "required": false,
            "schema": {
              "oneOf": [
                {
                  "type": "string"
                },
                {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              ]
            },
            "examples": {
              "singleLocality": {
                "summary": "A single locality to exclude",
                "value": "Williamsburg"
              },
              "multipleLocalities": {
                "summary": "Multiple localities to exclude (POST only)",
                "value": ["Chelsea", "SoHo"]
              }
            }
          },
          {
            "name": "filter.exclude.location.radius",
            "in": "query",
            "description": "Radius (in meters) to apply when excluding a location defined by\n`filter.exclude.location.id` or `filter.exclude.location.query`. A value of\n`0` restricts exclusion strictly to the boundary; a positive value expands the\nexclusion zone.\n",
            "required": false,
            "schema": {
              "type": "integer",
              "examples": [10000]
            }
          },
          {
            "name": "filter.subtype",
            "in": "query",
            "required": false,
            "description": "Subtype to filter on.",
            "schema": {
              "type": "string",
              "enum": ["urn:tag:occupation", "urn:tag:genre"]
            },
            "examples": {
              "genre-example": {
                "value": "urn:tag:genre"
              }
            }
          },
          {
            "name": "model",
            "in": "query",
            "required": false,
            "description": "Model to base results on.",
            "schema": {
              "type": "string",
              "enum": ["descriptive", "predictive"]
            },
            "examples": {
              "descriptive-example": {
                "value": "descriptive"
              }
            }
          },
          {
            "name": "page",
            "in": "query",
            "description": "The page number",
            "schema": {
              "type": "integer",
              "format": "int32",
              "minimum": 1,
              "maximum": 100,
              "default": 1
            },
            "examples": {
              "default": {
                "value": 1
              }
            }
          },
          {
            "name": "take",
            "in": "query",
            "required": false,
            "description": "The number of results to return. Default is `20`. The maximum allowed is `50`.\nTo retrieve additional results, use the `page` parameter to access the next page of results. This is the recommended approach for pagination.\nFor specific cases, the `offset` parameter can be used with `take` to skip a set number of results.\n",
            "schema": {
              "type": "integer",
              "default": 20,
              "minimum": 1,
              "maximum": 50,
              "examples": [10]
            }
          },
          {
            "name": "offset",
            "in": "query",
            "description": "The number of results to skip, starting from 0. Allows arbitrary offsets but is less commonly used than `page`.",
            "schema": {
              "type": "integer",
              "examples": [5]
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
