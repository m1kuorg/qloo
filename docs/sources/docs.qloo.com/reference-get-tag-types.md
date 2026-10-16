---
updatedAt: 2026-07-20T16:07:12.000Z
---

# Get Tag Types

Returns a list of tag types supported by each entity type. You can leverage this data with the Tags API to filter results by specific tag types.

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
    "/v2/tags/types": {
      "get": {
        "summary": "Get Tag Types",
        "x-readme-title": "Get Tag Types",
        "operationId": "get-tag-types",
        "description": "Returns a list of tag types supported by each entity type. You can leverage this data with the Tags API to filter results by specific tag types.",
        "tags": ["tags"],
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
        ]
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
