---
updatedAt: 2025-10-27T16:57:37.000Z
---

# Recommendation Insights

This guide shows you how to set up an Insights request to retrieve recommendations for a specific entity type, such as restaurants, destinations, or brands.

Recommendation Insights identify entities with a high affinity score to a given signal (like a restaurant or brand) and can be refined by location, tags, or demographics.

<Callout icon="📘" theme="info">
  This page covers the technical details you need to send a basic Insights request. For a detailed explanation of the benefits and functionality of the Insights API, please refer to the [Insights API Deep Dive](https://docs.qloo.com/reference/insights-api-deep-dive).
</Callout>

# Parameters

## Required

- `filter.type`: Defines what kind of recommendations to return.
  - Example: `urn:entity:place` (restaurants), `urn:entity:brand` (brands)
- At least one valid [filter](https://docs.qloo.com/reference/parameters#filters) or [signal](https://docs.qloo.com/reference/parameters#signal)

## Optional

- `signal.interests.entities`: Anchor recommendations to a specific entity ID (e.g., Balthazar’s restaurant ID)
- `signal.location.query`: Specify a region or neighborhood in natural language (e.g., `New York`)
- `signal.location`: Specify a location using WKT geometry or a locality ID
- `filter.tags`: Refine results by attributes such as `urn:tag:genre:brand:food_beverage` or `urn:tag:dining_options:place:brunch`

For comprehensive parameter descriptions and types, visit the [Parameters reference page](https://docs.qloo.com/reference/parameters).

# Request

Below is a sample request using the Insights route. Take a look at the sample parameters included and their values:

- `filter.type` is set to `urn:entity:movie`
- `filter.tags` is set to `urn:tag:genre:comedy`
- `filter.release_year.min` is set to `2022`

This request returns a list of movie entities tagged as comedies and released after 2022. Each result includes identifying metadata, tags, and descriptive fields such as name, entity\_id, and subtype. Depending on the request, results may also include a ranking or a relevance measure reflecting how closely an entity matches your query filters.

```curl Basic Insights Request Example
curl --location 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:movie&filter.tags=urn:tag:genre:media:comedy&filter.release_year.min=2022' \
--header 'x-api-key: x-api-key'
```

# Response

Below is a truncated sample response showing the first result of the query:

```json Basic Insights Response Example
{
    "success": true,
    "results": {
        "entities": [
            {
                "name": "Everything Everywhere All at Once",
                "entity_id": "F0D354AA-BA7E-49D2-8ABA-9A8250F5C852",
                "type": "urn:entity",
                "subtype": "urn:entity:movie",
                "properties": {
                    "release_year": 2022,
                    "release_date": "2022-04-08",
                    "description": "A middle-aged Chinese immigrant is swept up into an insane adventure in which she alone can save existence by exploring other universes and connecting with the lives she could have led.",
                    "content_rating": "R",
                    "duration": 139,
                    "image": {
                        "url": "https://staging.images.qloo.com/i/F0D354AA-BA7E-49D2-8ABA-9A8250F5C852-420x-outside.jpg"
                    },
                    "akas": [
                        {
                            "value": "Minden, mindenhol, mindenkor",
                            "languages": [
                                "hu"
                            ]
                        },
                        {
                            "value": "Все завжди і водночас",
                            "languages": [
                                "uk"
                            ]
                        },
                        {
                            "value": "一切隨處可見",
                            "languages": [
                                "zh"
                            ]
                        },
...
                    ],
                    "filming_location": "400 National Way, Simi Valley, California, USA",
                    "production_companies": [
                        "A24",
                        "AGBO",
                        "IAC Films"
                    ],
                    "release_country": [
                        "United States"
                    ],
                    "short_descriptions": [
                        {
                            "value": "film Dana Kwana a Daniela Scheinerta z roku 2022",
                            "languages": [
                                "cs"
                            ]
                        },
                        {
                            "value": "amerikansk film fra 2022",
                            "languages": [
                                "nb"
                            ]
                        },
                        {
                            "value": "فیلم علمی تخیلی ۲۰۲۲",
                            "languages": [
                                "fa"
                            ]
                        },
...
                    ],
                    "websites": [
                        "https://a24films.com/films/everything-everywhere-all-at-once",
                        "https://www.instagram.com/everythingeverywheremovie/"
                    ]
                },
                "popularity": 0.9984116946335868,
                "tags": [
                    {
                        "id": "urn:tag:streaming_service:media:neon_tv",
                        "name": "Neon Tv",
                        "type": "urn:tag:streaming_service:media"
                    },
                    {
                        "id": "urn:tag:keyword:media:multiverse",
                        "name": "Multiverse",
                        "type": "urn:tag:keyword:media"
                    },
                    {
                        "id": "urn:tag:streaming_service:media:cineplex",
                        "name": "Cineplex",
                        "type": "urn:tag:streaming_service:media"
                    },
                    {
                        "id": "urn:tag:streaming_service:media:claro_video",
                        "name": "Claro Video",
                        "type": "urn:tag:streaming_service:media"
                    },
...
                ],
                "query": {
                    "measurements": {
                        "audience_growth": -0.04072975141723856
                    }
                },
                "disambiguation": "2022, Daniel Scheinert, Daniel Kwan",
                "external": {
                    "instagram": [
                        {
                            "id": "everythingeverywheremovie"
                        }
                    ],
                    "wikidata": [
                        {
                            "id": "q83808444"
                        }
                    ],
                    "twitter": [
                        {
                            "id": "allatoncemovie"
                        }
                    ],
                    "letterboxd": [
                        {
                            "id": "everything-everywhere-all-at-once"
                        }
                    ],
                    "metacritic": [
                        {
                            "id": "everything-everywhere-all-at-once",
                            "critic_rating": 81,
                            "user_rating": 7.8
                        }
                    ],
                    "rottentomatoes": [
                        {
                            "id": "everything_everywhere_all_at_once",
                            "user_rating": "89",
                            "user_rating_count": "2500"
                        }
                    ],
                    "imdb": [
                        {
                            "id": "tt6710474",
                            "user_rating": 7.8,
                            "user_rating_count": 549113
                        }
                    ]
                }
            }
    },
    "duration": 34
}
```

# Step-by-Step Example

Now that you’ve seen how to send a basic Insights request, let’s look at a more specific use case.
The following example demonstrates how to use the same endpoint to generate recommendations — in this case, finding restaurants similar to a known place, filtered by a location parameter.

This example shows how Qloo’s recommendation engine combines entity signals (like a restaurant’s ID) with location filters to produce geographically relevant results.

<Recipe slug="recommendations-for-restaurants-similar-to-balthazar-in-nyc" title="Recommendations for restaurants similar to Balthazar in NYC" />

<br />
