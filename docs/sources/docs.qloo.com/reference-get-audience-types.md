---
updatedAt: 2026-07-08T16:26:38.000Z
---

# Get Audience Types

The Get Audience Types API returns all available audience type IDs, representing different audience categories. You can use this API to explore audience classifications and refine searches in the Find Audiences API. Including `filter.parents.types` allows you to narrow results by relevant entity types.

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
      "name": "audiences",
      "description": "Segment and filter by audience groupings"
    }
  ],
  "paths": {
    "/v2/audiences/types": {
      "get": {
        "deprecated": true,
        "summary": "Get Audience Types",
        "x-readme-title": "Get Audience Types",
        "operationId": "get-audience-types",
        "description": "The Get Audience Types API returns all available audience type IDs, representing different audience categories. You can use this API to explore audience classifications and refine searches in the Find Audiences API. Including `filter.parents.types` allows you to narrow results by relevant entity types.",
        "tags": ["audiences"],
        "parameters": [
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
                    "success": {
                      "type": "boolean"
                    },
                    "results": {
                      "type": "object",
                      "properties": {
                        "entities": {
                          "type": "array",
                          "items": {}
                        },
                        "duration": {
                          "type": "number"
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
