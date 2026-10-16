# Create a heatmap for a brand scoped to a neighborhood boundary

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Pass a brand as signal](#pass-a-brand-as-signal)
    1.  [Define the boundary as a WKT polygon](#define-the-boundary-as-a-wkt-polygon)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:heatmap \
  &signal.interests.entities=93A50AC5-FCF2-4F47-87C0-E821E0B9F823 \
  &filter.location=POLYGON((-74.0479 40.6829,-74.0479 40.7831,-73.9067 40.7831,-73.9067 40.6829,-74.0479 40.6829))' \
  --header 'X-Api-Key: <<apiKey>>'
```

## Response example

```json
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

## Steps

### Pass a brand as signal

Use a brand's Qloo entity ID as `signal.interests.entities`. This example uses Jacquemus — entity ID `93A50AC5-FCF2-4F47-87C0-E821E0B9F823`

### Define the boundary as a WKT polygon

Pass a WKT POLYGON to `filter.location`. Coordinates must be in longitude/latitude order, and the polygon must close. This example traces lower Manhattan.

### Handle the response

Heatmap results return as `results.heatmap`, not `results.entities`. Each cell has a `location` object with latitude, longitude, and geohash, and a `query` object with `affinity`, `affinity_rank`, and `popularity`.

## See also

- [Create a heatmap for a brand scoped to a neighborhood boundary on docs.qloo.com](https://docs.qloo.com/recipes/heatmap-for-brand-jacquemus-inside-manhattan-based-on-wkt-shape), fetched 2026-10-16, page updated 2026-05-14
- [Insights API deep dive](insights-api-deep-dive.md)
