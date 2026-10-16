---
updatedAt: 2026-07-20T16:07:12.000Z
---

# Search Entities

Search for an entity by name or property.

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
      "name": "search",
      "description": "Search across entities"
    }
  ],
  "paths": {
    "/search": {
      "get": {
        "summary": "Search Entities",
        "x-readme-title": "Search Entities",
        "x-readme-slug": "get-search",
        "operationId": "get-search",
        "description": "Search for an entity by name or property.",
        "tags": ["search"],
        "parameters": [
          {
            "name": "query",
            "in": "query",
            "description": "The text to search against.",
            "schema": {
              "type": "string"
            },
            "examples": {
              "default": {
                "value": "Beyonce"
              }
            }
          },
          {
            "name": "types",
            "in": "query",
            "description": "The category to search against.\nThe following values are legacy types available for search only and are not supported in `/v2/insights`:\n- `urn:entity:actor` - `urn:entity:album` - `urn:entity:author` - `urn:entity:director` - `urn:entity:locality`\n",
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
              "default": {
                "value": ["urn:entity:movie", "urn:entity:tv_show"]
              }
            }
          },
          {
            "name": "filter.location",
            "in": "query",
            "description": "A location to base searches on. Accepts a lat/lon coordinate pair or a WKT geometry string. Also accepts a Qloo entity UUID.\n\n- **Lat/lon coordinate pair**: `latitude,longitude` (e.g. `40.742306,-74.003494`)\n- **WKT geometry string**: a Well-Known Text geometry such as `POINT(-73.99823 40.722668)`\n- **Qloo entity UUID**: a Qloo entity ID\n",
            "style": "form",
            "explode": false,
            "examples": {
              "latLonExample": {
                "summary": "Latitude/longitude coordinate pair",
                "value": "40.742306,-74.003494"
              },
              "wktExample": {
                "summary": "WKT geometry string",
                "value": "POINT(-73.99823 40.722668)"
              }
            },
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "filter.radius",
            "in": "query",
            "description": "The max distance in miles from the location to base results on. This only applies to categories with geolocation data. Default is 10 miles.",
            "schema": {
              "type": "number",
              "format": "float",
              "default": 10,
              "maximum": 100,
              "minimum": 0
            },
            "examples": {
              "default": {
                "value": 10
              }
            }
          },
          {
            "name": "filter.exists",
            "in": "query",
            "description": "Filter results by existential property check like `external.resy` or `external.michelin`",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string",
                "pattern": "^external\\.\\w+$"
              }
            }
          },
          {
            "name": "filter.tags",
            "in": "query",
            "description": "Filter results by a tag",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "examples": {
              "default": {
                "value": ["urn:tag:genre:action", "urn:tag:genre:place:tourist_attraction"]
              }
            }
          },
          {
            "name": "filter.rating",
            "in": "query",
            "description": "Filter by the lowest desired business rating.",
            "schema": {
              "type": "number",
              "format": "double",
              "minimum": 0,
              "maximum": 5
            },
            "examples": {
              "default": {
                "value": 4.5
              }
            }
          },
          {
            "name": "filter.popularity",
            "in": "query",
            "description": "The minimum value of popularity an entity must have to be output.",
            "schema": {
              "type": "number",
              "format": "double",
              "minimum": 0,
              "maximum": 1
            },
            "examples": {
              "default": {
                "value": 0.5
              }
            }
          },
          {
            "name": "filter.address",
            "in": "query",
            "description": "Filter by address using a partial string match. Supports comma-separated terms.\n",
            "required": false,
            "style": "form",
            "explode": false,
            "schema": {
              "type": "string",
              "minLength": 1
            },
            "examples": {
              "commaSeparated": {
                "summary": "Comma-separated address terms",
                "value": "123 Main St,New York,NY"
              },
              "partial": {
                "summary": "Partial string match",
                "value": "123 Main St"
              }
            }
          },
          {
            "name": "operator.filter.tags",
            "in": "query",
            "description": "The operator.filter.tags parameter controls whether the API returns results matching all (\"intersection\") or any (\"union\") of the input tags.",
            "schema": {
              "type": "string",
              "enum": ["intersection", "union"],
              "default": "union"
            },
            "examples": {
              "default": {
                "value": "intersection"
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
            "description": "Number of results to return",
            "required": false,
            "schema": {
              "type": "integer",
              "exclusiveMaximum": 200
            }
          },
          {
            "name": "sort_by",
            "in": "query",
            "description": "Sort results by criteria",
            "schema": {
              "type": "string",
              "default": "match",
              "enum": ["match", "distance", "popularity"]
            },
            "examples": {
              "default": {
                "value": "match"
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
