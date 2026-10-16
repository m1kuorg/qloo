# Location-based insights

Retrieve recommendations scoped to a specific location.

This guide shows you how to set up an Insights request that includes a location parameter. When you provide a location, Qloo limits recommendations to entities relevant to that area, such as restaurants in a neighborhood, brands in a city, or destinations within a defined shape.

> This page covers the technical details you need to send a location-based Insights request. For a deeper explanation of how location signals are used in Qloo’s recommendation models, see [Location Insights](location-insights.md).

Contents:

1.  [Parameters](#parameters)
    1.  [Required parameters](#required-parameters)
    1.  [Optional parameters](#optional-parameters)
1.  [Request example](#request-example)
1.  [Response example](#response-example)
1.  [Step-by-step examples](#step-by-step-examples)
1.  [See also](#see-also)

## Parameters

### Required parameters

- `filter.type`: Defines the entity type for which to retrieve results.
  - Example: `urn:entity:place` (restaurants), `urn:entity:brand` (brands), `urn:entity:destination` (travel destinations)

- At least one valid [filter](parameter-reference.md) or [signal](parameter-reference.md) parameter in your request

- Only one of the following location parameters is required:
  - `signal.location.query`: Specify a location in natural language (for example, `SoHo`, `Lower East Side`, `Paris`).
  - `signal.location`: Specify a location using WKT geometry (for example, `POINT`, `POLYGON`, or `MULTIPOLYGON`) or a locality UUID.

### Optional parameters

- `filter.tags`: Refine results to entities that match specific attributes, such as `urn:tag:dining_options:place:brunch` or `urn:tag:genre:brand:food_beverage`.
- `filter.types`: Restrict results to specific entity subtypes (for example, only restaurants or cafés).
- `filter.distance.max`: Limit results to a specific radius around the provided coordinates (used with point-based locations).

For comprehensive parameter descriptions and types, visit the [Parameters](parameter-reference.md) reference page.

## Request example

Below is a sample request using the Insights route with a location query. In this case, the location is set to the Lower East Side, and the entity type is set to `urn:entity:movie`:

- `filter.type` is set to `urn:entity:movie`
- `signal.location.query` is set to `Lower East Side`

This request returns a list of movies that have a high affinity score in the Lower East Side.

**Insights by location request example**

```shell
curl --location 'https://staging.api.qloo.com/v2/insights/?filter.type=urn:entity:movie&signal.location.query=Lower%20East%20Side' \
--header 'x-api-key: x-api-key'
```

## Response example

Below is a truncated sample response showing movie entities with metadata such as name, entity_id, subtype, and properties. Each result includes standard entity details (e.g., description, release year) and any associated tags:

**Insights by location response example**

```json
{
    "success": true,
    "results": {
        "entities": [
            {
                "name": "Queen & Slim",
                "entity_id": "9E2FD257-7E23-483A-8276-36FF51A5DD67",
                "type": "urn:entity",
                "subtype": "urn:entity:movie",
                "properties": {
                    "release_year": 2019,
                    "release_date": "2019-11-27",
                    "description": "A couple's first date takes an unexpected turn when a police officer pulls them over.",
                    "content_rating": "R",
                    "duration": 132,
                    "image": {
                        "url": "https://staging.images.qloo.com/i/9E2FD257-7E23-483A-8276-36FF51A5DD67-420x-outside.jpg"
                    },
                    "akas": [
                        {
                            "value": "Queen and Slim",
                            "languages": [
                                "fr",
                                "en"
                            ]
                        }
                    ],
                    "filming_location": "6900 St. Clair Avenue, Cleveland, Ohio, USA",
                    "production_companies": [
                        "De La Revolución Films",
                        "Hillman Grad",
                        "Makeready"
                    ],
                    "release_country": [
                        "United States",
                        "Canada"
                    ],
                    "short_descriptions": [
                        {
                            "value": "2019 film directed by Melina Matsoukas",
                            "languages": [
                                "en"
                            ]
                        },
 . . .

}
        }
    }
}
```

## Step-by-step examples

Now that you’ve seen how to include a location parameter in an Insights request, let’s look at practical examples that demonstrate how different location formats affect your results.

These examples show how Qloo combines **entity signals** (such as a restaurant’s entity ID) with **location inputs** (like a city name, coordinates, or polygon) to retrieve geographically relevant recommendations. You’ll see how using `signal.location.query`, latitude and longitude coordinates, or a WKT geometry can each return context-specific recommendations.

Each example below links to a step-by-step recipe that includes its own `curl` request and response walkthrough.

- [Find restaurants like Balthazar in New York (location via query string)](https://docs.qloo.com/recipes/recommendations-for-restaurants-similar-to-balthazar-in-nyc)
- [Find restaurants like BADMAASH in New York (location via lat/lon coordinates)](https://docs.qloo.com/recipes/recommendations-for-restaurants-similar-to-a-given-place-in-a-specific-location)
- [Recommendations for popular brands inside Paris center based on WKT shape](https://docs.qloo.com/recipes/recommendations-for-popular-brands-inside-paris-center-based-on-wkt-shape)

## See also

- [Location-based insights on docs.qloo.com](https://docs.qloo.com/reference/insights-with-location-use-case), fetched 2026-10-16, page updated 2025-11-12
- [Location insights](location-insights.md)
- [Parameter reference](parameter-reference.md)
