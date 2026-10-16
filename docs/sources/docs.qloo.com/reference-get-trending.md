---
updatedAt: 2026-07-08T16:57:12.000Z
---

# Get Trending Data

The Trending API provides time-series data showing the popularity trends of a specific entity over a given time period. It returns weekly trending statistics including population percentile, rank, velocity, and acceleration metrics for the specified entity. Results are ordered by date in descending order. Use this endpoint to monitor how an entity's popularity evolves over time.

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
      "name": "trends",
      "description": "Features involving trend data"
    }
  ],
  "paths": {
    "/v2/trending": {
      "get": {
        "summary": "Get Trending Data",
        "x-readme-title": "Get Trending Data",
        "x-readme-slug": "get-trending",
        "operationId": "get-trending",
        "description": "The Trending API provides time-series data showing the popularity trends of a specific entity over a given time period. It returns weekly trending statistics including population percentile, rank, velocity, and acceleration metrics for the specified entity. Results are ordered by date in descending order. Use this endpoint to monitor how an entity's popularity evolves over time.\n",
        "tags": ["trends"],
        "parameters": [
          {
            "name": "signal.interests.entities",
            "in": "query",
            "description": "A comma-separated list of entity IDs that influence the affinity score.",
            "required": false,
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "examples": ["636E1B95-6232-43E1-BDFE-37CD209C2CE3,7D2B1DFF-9D5D-44DE-970E-46B80C76CFA6"]
            }
          },
          {
            "name": "filter.type",
            "in": "query",
            "description": "Filter by the category of entity to return (urn:entity:place). The `urn:entity:audience` value is deprecated and should not be used for new integrations.\n",
            "required": true,
            "schema": {
              "examples": ["urn:entity:book"],
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
              ]
            }
          },
          {
            "name": "filter.start_date",
            "in": "query",
            "required": true,
            "description": "Start date for the trending analysis period in ISO 8601 format (YYYY-MM-DD).\n",
            "schema": {
              "type": "string",
              "format": "date"
            },
            "example": "2025-01-03"
          },
          {
            "name": "filter.end_date",
            "in": "query",
            "required": true,
            "description": "End date for the trending analysis period in ISO 8601 format (YYYY-MM-DD).\n",
            "schema": {
              "type": "string",
              "format": "date"
            },
            "example": "2025-07-03"
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
          },
          {
            "name": "page",
            "in": "query",
            "description": "The page number of results to return. This is equivalent to take + offset and is the recommended approach for most use cases.",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "examples": [1]
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Successful Operation",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": {
                      "type": "boolean",
                      "example": true
                    },
                    "duration": {
                      "type": "number",
                      "example": 123
                    },
                    "results": {
                      "type": "object",
                      "properties": {
                        "trending": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "properties": {
                              "date": {
                                "type": "string",
                                "format": "date",
                                "example": "2025-01-03"
                              },
                              "population_percentile": {
                                "type": "number",
                                "example": 85.2
                              },
                              "population_rank": {
                                "type": "integer",
                                "example": 150
                              },
                              "population_rank_velocity": {
                                "type": "integer",
                                "example": 5
                              },
                              "velocity_fold_change": {
                                "type": "number",
                                "example": 1.15
                              },
                              "population_percent_delta": {
                                "type": "number",
                                "example": 1.15
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Bad Request — invalid parameters or missing required fields"
          },
          "500": {
            "description": "Internal Server Error"
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
