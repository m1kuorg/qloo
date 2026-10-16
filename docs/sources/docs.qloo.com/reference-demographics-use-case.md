---
updatedAt: 2025-10-27T16:59:54.000Z
---

# Demographic Insights

Retrieve demographic data for entities

This guide shows you how to set up an Insights request to retrieve **demographic data** for an entity or tag.\
When you include the required parameters, the response returns **demographic distributions** across dimensions such as age and gender, showing how different audience groups align with the selected signal.

# Parameters

## Required

- `filter.type`: Must be set to `urn:demographics` to retrieve demographic data.
- Only one of the following signal parameters is required:
  - `signal.interests.entities`: Specify an entity ID (for example, a movie, restaurant, or brand) to return its demographic breakdown.
  - `signal.interests.tags`: Specify a tag value (for example, `urn:tag:genre:media:action`) to analyze the demographic composition associated with that tag.

## Optional

- You may include both `signal.interests.entities` and `signal.interests.tags` in a single request to compare demographic affinities between a specific entity and a related category or genre.
- For accepted signal types and parameter details, visit the [Parameters reference page](https://docs.qloo.com/reference/parameters).

# Request

Below is a sample request using the `/v2/insights` route to retrieve demographic data for a specific actor and genre combination.

- `filter.type` is set to `urn:demographics`
- `signal.interests.tags` is set to `urn:tag:genre:media:action`
- `signal.interests.entities` is set to `B8BEE72B-B321-481F-B81A-A44881D094D6` (Charlize Theron)

This request returns the demographic affinity scores for audiences associated with **Charlize Theron** and the **action** genre.

```curl Demographics Request Example
curl --location 'https://staging.api.qloo.com/v2/insights?filter.type=urn:demographics&signal.interests.tags=urn:tag:genre:media:action&signal.interests.entities=B8BEE72B-B321-481F-B81A-A44881D094D6' \
--header 'x-api-key: x-api-key'
```

# Response

Below is a truncated sample response showing demographic data for both the entity (Charlize Theron) and the tag (Action).

Each demographic block includes affinity scores by age and gender, where positive values indicate stronger-than-average alignment for that audience group, and negative values indicate lower affinity.

```json Demographics Response Example
{
  "success": true,
  "results": {
    "demographics": [
      {
        "entity_id": "urn:tag:genre:media:action",
        "query": {
          "age": {
            "24_and_younger": 0,
            "25_to_29": 0.43,
            "30_to_34": 0.23,
            "35_to_44": -0.02,
            "45_to_54": -0.28,
            "55_and_older": -0.17
          },
          "gender": {
            "male": 0.08,
            "female": -0.08
          }
        }
      },
      {
        "entity_id": "B8BEE72B-B321-481F-B81A-A44881D094D6",
        "query": {
          "age": {
            "24_and_younger": -0.09,
            "25_to_29": 0.36,
            "30_to_34": 0.7000000000000001,
            "35_to_44": 0.17,
            "45_to_54": -0.53,
            "55_and_older": -0.32
          },
          "gender": {
            "male": 0.16,
            "female": -0.16
          }
        }
      }
    ]
  },
  "duration": 77
}
```

# Step-by-Step Example

<Recipe slug="see-the-affinity-scores-for-demographic-data-related-to-charlize-theron-action-movies" title="See the affinity scores for demographic data related to Charlize Theron action movies." />
