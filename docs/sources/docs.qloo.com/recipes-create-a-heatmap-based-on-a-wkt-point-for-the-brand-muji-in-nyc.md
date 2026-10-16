---
updatedAt: 2026-09-18T13:42:37.000Z
---

# Create a heatmap based on a WKT point for the brand MUJI in NYC

```javascript Heatmap
const options = {
  method: 'GET',
  headers: { 'X-Api-Key': '<<apiKey>>' }
}

fetch(
  'https://api.qloo.com/v2/insights/?filter.type=urn:heatmap&filter.location=POINT (-73.99245931266024 40.739611459641964)&signal.interests.entities=E12201A5-CC50-40AF-97AE-C54A2CA303F7',
  options
)
  .then((response) => response.json())
  .then((result) => console.log(result))
  .catch((error) => console.error('Error:', error))
```

```json Response Example
{
  "success": true,
  "results": {
    "heatmap": [
      {
        "location": {
          "latitude": 40.74005126953125,
          "longitude": -73.9874267578125,
          "geohash": "dr5ru2"
        },
        "query": {
          "affinity": 0,
          "popularity": 0
        }
      }
    ]
  },
  "duration": 72
}
```

# Set up request options

<!-- javascript@1-4 -->

Define the HTTP request method and headers, including the API key.

# Send the request

<!-- javascript@6 -->

Send a GET Insights request with `filter.type` set to heatmap, a location, and at least one other applicable signal query parameter.

This example returns heatmap data showing the concentration of affinity and affinity rank for the brand MUJI in NYC.

# Handle the response

<!-- javascript@7-9 -->

Process the response by converting it to text, logging the result, and handling any errors.
