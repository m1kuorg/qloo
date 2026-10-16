# Create a heatmap based on a WKT point for the brand MUJI in NYC

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Set up request options](#set-up-request-options)
    1.  [Send the request](#send-the-request)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```javascript
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

## Response example

```json
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

## Steps

### Set up request options

Define the HTTP request method and headers, including the API key.

### Send the request

Send a GET Insights request with `filter.type` set to heatmap, a location, and at least one other applicable signal query parameter.

This example returns heatmap data showing the concentration of affinity and affinity rank for the brand MUJI in NYC.

### Handle the response

Process the response by converting it to text, logging the result, and handling any errors.

## See also

- [Create a heatmap based on a WKT point for the brand MUJI in NYC on docs.qloo.com](https://docs.qloo.com/recipes/create-a-heatmap-based-on-a-wkt-point-for-the-brand-muji-in-nyc), fetched 2026-10-16, page updated 2026-09-18
- [Insights API deep dive](insights-api-deep-dive.md)
