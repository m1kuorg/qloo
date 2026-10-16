---
updatedAt: 2026-07-08T16:39:41.000Z
---

# Search Tags

Search for tags that are supported by the `filter.tags`, `exclude.tags`, and `signal.interests.tags parameters`.

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
      "name": "tags",
      "description": "Tag-based filtering and classification"
    }
  ],
  "paths": {
    "/v2/tags": {
      "get": {
        "summary": "Search Tags",
        "x-readme-title": "Search Tags",
        "operationId": "get-tags",
        "description": "Search for tags that are supported by the `filter.tags`, `exclude.tags`, and `signal.interests.tags parameters`.",
        "tags": ["tags"],
        "parameters": [
          {
            "name": "feature.typo_tolerance",
            "in": "query",
            "description": "When set to true, allows tolerance for typos in the `filter.query parameter`. For example, a query for “Mediterranaen” would return tags with the word “Mediterranean” in their titles. Default is false.",
            "schema": {
              "type": "boolean",
              "default": false,
              "examples": [true]
            }
          },
          {
            "name": "feature.semantic_search",
            "in": "query",
            "description": "When set to `true`, enables semantic search for tag queries. Instead of exact or typo-tolerant matching, the API uses semantic similarity to find tags related to the meaning of the query. This feature is currently in beta. Use alongside `filter.query` to perform a semantic tag search.\n",
            "required": false,
            "schema": {
              "type": "boolean",
              "default": false
            },
            "examples": {
              "enabled": {
                "summary": "Enable semantic search",
                "value": true
              }
            }
          },
          {
            "name": "filter.results.tags",
            "in": "query",
            "description": "Filter by a comma-separated list of tag IDs. Often used to assess the affinity of a tag towards input.",
            "required": false,
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "examples": ["urn:tag:genre:place:restaurant:japanese", "urn:tag:style:qloo:indie"]
            }
          },
          {
            "name": "filter.parents.types",
            "in": "query",
            "description": "Filter by a comma-separated list of parental entity types.",
            "required": false,
            "style": "form",
            "explode": false,
            "schema": {
              "type": "string",
              "enum": [
                "urn:audience:communities",
                "urn:audience:global_issues",
                "urn:audience:hobbies_and_interests",
                "urn:audience:investing_interests",
                "urn:audience:leisure",
                "urn:audience:life_stage",
                "urn:audience:lifestyle_preferences_beliefs",
                "urn:audience:political_preferences",
                "urn:audience:professional_area",
                "urn:audience:spending_habits"
              ],
              "examples": ["urn:audience:communities", "urn:audience:global_issues"]
            }
          },
          {
            "name": "filter.popularity.min",
            "in": "query",
            "description": "Filter by the minimum popularity percentile required for a Point of Interest (float, between 0 and 1; closer to 1 indicates higher popularity, e.g., 0.98 for the 98th percentile).",
            "required": false,
            "schema": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "examples": [0.5]
            }
          },
          {
            "name": "filter.popularity.max",
            "in": "query",
            "description": "Filter by the maximum popularity percentile a Point of Interest must have (float, between 0 and 1; closer to 1 indicates higher popularity, e.g., 0.98 for the 98th percentile).",
            "required": false,
            "schema": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "examples": [0.98]
            }
          },
          {
            "name": "filter.query",
            "in": "query",
            "description": "A partial string search on the audience or tag name.",
            "required": false,
            "schema": {
              "type": "string",
              "examples": ["vegan"]
            }
          },
          {
            "name": "filter.tag.types",
            "in": "query",
            "description": "Filter by a comma-separated list of tag types. Each tag type requires an exact match. You can retrieve a list of tag types supported by each entity type via the Tag Types API.",
            "required": false,
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "examples": [
                "urn:tag:accessibility:place",
                "urn:tag:ambience:qloo",
                "urn:tag:amenity:place",
                "urn:tag:category:place"
              ]
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
                    "duration": {
                      "type": "number"
                    },
                    "success": {
                      "type": "boolean"
                    },
                    "results": {
                      "type": "object",
                      "properties": {
                        "tags": {
                          "type": "array",
                          "items": {}
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Bad Request"
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
