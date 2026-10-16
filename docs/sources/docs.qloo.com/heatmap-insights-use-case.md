# Heatmap insights use case

Retrieve heatmap data for location-based affinity analysis.

This guide shows you how to set up an Insights request to generate **heatmap data** for a given location or tag. A heatmap request returns a grid of coordinates with calculated **affinity**, **affinity_rank**, and **popularity** values, which can be visualized to understand how interest in a particular signal varies across a geographic area.

> This page covers the technical details you need to send a heatmap Insights request. For a detailed explanation of the benefits and visualization methods for heatmap data, see [Heatmaps Overview](heatmap-insights.md).

Contents:

1.  [Parameters](#parameters)
    1.  [Required parameters](#required-parameters)
    1.  [Optional parameters](#optional-parameters)
1.  [Request example](#request-example)
1.  [Response example](#response-example)
1.  [Step-by-step example](#step-by-step-example)
1.  [See also](#see-also)

## Parameters

### Required parameters

- `filter.type`: Must be set to `urn:heatmap` to generate a heatmap response.
- Only one of the following location parameters is required:
  - `filter.location.query`: Specify a location using a natural-language query (for example, `NYC`, `Los Angeles`, `Paris`).
  - `filter.location`: Specify a location using a WKT geometry or locality UUID.
- At least one valid signal parameter:
  - `signal.interests.entities`: Provide an entity UUID (for example, a brand or restaurant).
  - `signal.interests.tags`: Provide a tag to anchor the heatmap (for example, `urn:tag:genre:media:non_fiction`).

### Optional parameters

- `bias.trends`: Apply a bias toward trending entities within the selected area.
- `output.heatmap.boundary`: Define the map boundary or shape to constrain results.
- `signal.demographics.audiences.weight`: Apply audience weighting if using demographic signals.
- `signal.demographics.age`: Filter results to a specific age group.
- `signal.demographics.gender`: Filter results by gender.

For comprehensive parameter descriptions and accepted types, visit the [Parameters reference page](parameter-reference.md).

## Request example

Below is a sample request using the `/v2/insights` route to generate heatmap data for the **non-fiction media** genre within **New York City**.

- `filter.type` is set to `urn:heatmap`.
- `filter.location.query` is set to `"NYC"`.
- `signal.interests.tags` is set to `urn:tag:genre:media:non_fiction`.

This request returns a grid of coordinates with affinity, affinity rank, and popularity values showing where audiences most associate with non-fiction media in NYC.

**Heatmaps request example**

```shell
curl --location 'https://api.qloo.com/v2/insights/?filter.type=urn:heatmap&filter.location.query=NYC&signal.interests.tags=urn:tag:genre:media:non_fiction' \
--header 'x-api-key: x-api-key'
```

## Response example

Below is a truncated sample response showing part of the heatmap data returned for the request above. Each object in the heatmap array represents a grid point, along with its corresponding latitude, longitude, and calculated metrics.

**Heatmaps response example**

```json
{
    "success": true,
    "results": {
        "heatmap": [
            {
                "location": {
                    "latitude": 40.591736,
                    "longitude": -73.756714,
                    "geohash": "dr5wct"
                },
                "query": {
                    "affinity": 1,
                    "affinity_rank": 0.9976498237367802,
                    "popularity": 0.9717472118959107
                }
            },
            {
                "location": {
                    "latitude": 40.74005,
                    "longitude": -73.87756,
                    "geohash": "dr5ryb"
                },
                "query": {
                    "affinity": 0.9992565055762082,
                    "affinity_rank": 0.9960474308300395,
                    "popularity": 0.5449814126394052
                }
            },
            {
                "location": {
                    "latitude": 40.811462,
                    "longitude": -73.91052,
                    "geohash": "dr72nj"
                },
                "query": {
                    "affinity": 0.9985130111524163,
                    "affinity_rank": 0.9959211420802175,
                    "popularity": 0.9234200743494424
                }
            },
            {
                "location": {
                    "latitude": 40.866394,
                    "longitude": -73.85559,
                    "geohash": "dr72rr"
                },
                "query": {
                    "affinity": 0.9977695167286246,
                    "affinity_rank": 0.9952654717619208,
                    "popularity": 0.6423791821561339
                }
            },
            {
                "location": {
                    "latitude": 40.816956,
                    "longitude": -73.92151,
                    "geohash": "dr72jy"
                },
                "query": {
                    "affinity": 0.9970260223048327,
                    "affinity_rank": 0.9951690821256038,
                    "popularity": 0.7234200743494423
                }
            },
            {
                "location": {
                    "latitude": 40.58075,
                    "longitude": -73.82263,
                    "geohash": "dr5wb5"
                },
                "query": {
                    "affinity": 0.9962825278810409,
                    "affinity_rank": 0.9948072698222489,
                    "popularity": 0.9531598513011152
                }
            },
            {
                "location": {
                    "latitude": 40.73456,
                    "longitude": -73.83362,
                    "geohash": "dr5rxz"
                },
                "query": {
                    "affinity": 0.995539033457249,
                    "affinity_rank": 0.9939903846153846,
                    "popularity": 0.2312267657992565
                }
. . .
            }
        ]
    },
    "query": {
        "localities": {
            "filter": {
                "entity_id": "81E61924-6CEE-4AB4-93D3-282A5C784AB8",
                "name": "New York",
                "subtype": "urn:entity:locality",
                "location": {
                    "lat": -73.93889084762313,
                    "lng": 40.66320611815103
                },
                "popularity": 1,
                "disambiguation": "New York, New York, United States of America"
            }
        }
    },
    "duration": 75
}
```

Each result in the heatmap array corresponds to a geospatial coordinate within the defined area. The values returned under query represent:

- `affinity`: relative interest or similarity score for the signal at that location
- `affinity_rank`: rank-normalized affinity within the result set
- `popularity`: overall engagement or prevalence of the signal in that location

## Step-by-step example

The example above demonstrates how to generate heatmap data for a specific tag within a city. In this case, the tag represents the non-fiction media genre, and the results visualize audience affinity for that genre across New York City.

Each point in the response can be plotted on a map to show:

- Areas of high and low affinity for the selected signal
- How affinity values correlate with popularity across neighborhoods
- Patterns of geographic distribution for audience interests

This same request pattern can be used for any tag or entity to visualize where affinity and affinity rank concentrations are most substantial.

- [Create a heatmap based on a WKT point for the brand MUJI in NYC](recipe-create-a-heatmap-based-on-a-wkt-point-for-the-brand-muji-in-nyc.md)

## See also

- [Heatmap insights use case on docs.qloo.com](https://docs.qloo.com/reference/heatmaps-use-case), fetched 2026-10-16, page updated 2026-07-08
- [Heatmap insights](heatmap-insights.md)
- [Parameter reference](parameter-reference.md)
