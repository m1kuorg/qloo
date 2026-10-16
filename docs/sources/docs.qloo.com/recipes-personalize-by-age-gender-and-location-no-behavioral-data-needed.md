---
updatedAt: 2026-05-14T17:15:56.000Z
---

# Personalize by age, gender, and location (no behavioral data needed)

```curl cURL
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:artist \
  &signal.demographics.gender=male \
  &signal.demographics.age=25_to_29 \
  &signal.location.query=New York City \
  &take=10' \
  --header 'X-Api-Key: <<apiKey>>'
```

```json Response Example
{
  "success": true,
  "results": {
    "entities": [
      {
        "name": "Tyler, the Creator",
        "entity_id": "...",
        "type": "urn:entity:artist",
        "properties": {
          "affinity": 0.96
        }
      }
    ]
  }
}
```

# Pass demographic signal

<!-- curl@3-4 -->

`signal.demographics.age` takes an age range string such as 25_to_29. `signal.demographics.gender` accepts male or female. These pull regional popularity data for that demographic rather than individual behavioral data.

# Add a location to pull regional signal

<!-- curl@5 -->

`signal.location.query` ties the demographic signal to a geography. A 25 to 29 year old male in Manhattan produces different results than the same demographic in Austin. Qloo uses local cultural context to weight results.

# Handle the response

<!-- curl@ -->

Once behavioral data becomes available, add `signal.interests.entities` alongside the demographic signal to blend individual and population-level preferences.
