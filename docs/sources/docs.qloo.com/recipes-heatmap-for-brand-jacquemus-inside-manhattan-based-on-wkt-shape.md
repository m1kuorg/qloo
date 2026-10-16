---
updatedAt: 2026-05-14T17:34:31.000Z
---

# Create a heatmap for a brand scoped to a neighborhood boundary

```c cURL
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:heatmap \
  &signal.interests.entities=93A50AC5-FCF2-4F47-87C0-E821E0B9F823 \
  &filter.location=POLYGON((-74.0479 40.6829,-74.0479 40.7831,-73.9067 40.7831,-73.9067 40.6829,-74.0479 40.6829))' \
  --header 'X-Api-Key: <<apiKey>>'
```

```json Response Example
{
  "success": true,
  "results": {
    "heatmap": [
      {
        "location": {
          "latitude": 40.722885,
          "longitude": -74.00047,
          "geohash": "dr5rsj6"
        },
        "query": {
          "affinity": 1,
          "affinity_rank": 0.9990308778803031,
          "popularity": 0.9986206896551724
        }
      }
    ]
  }
}
```

# Pass a brand as signal

<!-- c@3 -->

Use a brand's Qloo entity ID as `signal.interests.entities`. This example uses Jacquemus — entity ID `93A50AC5-FCF2-4F47-87C0-E821E0B9F823`

# Define the boundary as a WKT polygon

<!-- c@4 -->

Pass a WKT POLYGON to `filter.location`. Coordinates must be in longitude/latitude order, and the polygon must close. This example traces lower Manhattan.

# Handle the response

<!-- c@ -->

Heatmap results return as `results.heatmap`, not `results.entities`. Each cell has a `location` object with latitude, longitude, and geohash, and a `query` object with `affinity`, `affinity_rank`, and `popularity`.
