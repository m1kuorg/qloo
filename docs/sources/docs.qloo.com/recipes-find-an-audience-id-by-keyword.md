---
updatedAt: 2026-05-14T17:15:21.000Z
---

# Find an audience ID by keyword

```curl cURL
curl --request GET \
  --url 'https://api.qloo.com/v2/audiences?filter.query=sustainability&take=3' \
  --header 'X-Api-Key: <<apiKey>>'
```

```json Response Example
{
  "success": true,
  "results": {
    "audiences": [
      {
        "id": "urn:audience:global_issues:sustainability",
        "entity_id": "...",
        "name": "Sustainability",
        "type": "urn:audience:global_issues",
        "parents": []
      }
    ]
  }
}
```

# Search for an audience by keyword

<!-- curl@2 -->

Use `filter.query` to search by name. Qloo's audience taxonomy covers life stages, hobbies, spending habits, political preferences, and professional categories.

# Use the URN form, not the UUID

<!-- curl@ -->

Each result returns both an `id` (URN like `urn:audience:hobbies_and_interests:outdoors`) and an `entity_id` (UUID). Use the URN when passing to `signal.demographics.audiences`.

# Handle the response

<!-- curl@ -->

Results return as r`esults.audiences[]` with the URN `id`, `name`, `type`, and `parents[]`.
