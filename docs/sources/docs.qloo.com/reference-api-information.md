---
updatedAt: 2026-07-20T16:07:12.000Z
---

# Get API Information

Returns general information about the Qloo API, including the current version, deployment date, and contact details.

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
      "name": "info",
      "description": "General API information"
    }
  ],
  "paths": {
    "/": {
      "get": {
        "summary": "Get API Information",
        "x-readme-title": "Get API Information",
        "x-readme-slug": "api-information",
        "operationId": "api-information",
        "description": "Returns general information about the Qloo API, including the current version, deployment date, and contact details.",
        "tags": ["info"],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "properties": {
                    "version": {
                      "type": "string"
                    },
                    "title": {
                      "type": "string"
                    },
                    "description": {
                      "type": "string"
                    },
                    "contact": {
                      "type": "object",
                      "properties": {
                        "name": {
                          "type": "string"
                        },
                        "url": {
                          "type": "string"
                        },
                        "email": {
                          "type": "string"
                        }
                      }
                    }
                  }
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
