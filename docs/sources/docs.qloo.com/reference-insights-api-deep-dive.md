---
updatedAt: 2026-07-08T16:26:36.000Z
---

# Insights API Deep Dive

Provides taste insights that reflect audience preferences and cultural alignment.

Qloo’s Insights API helps uncover the underlying factors that shape human preferences, offering cultural intelligence about how people relate to different entities like brands, artists, destinations, and more. It draws from billions of signals to deliver nuanced, taste-based insights that reflect real-world behavior and affinities.

This Deep Dive is designed to help users explore the full capabilities of the Insights API, emphasizing how different parameters shape results. It allows you to view and test the complete set of supported parameters directly on this page, making it easier to explore functionality in context and understand how different inputs impact responses.

# Helpful Resources

- Need to understand how current parameters map to legacy fields? Visit the [Parameter Reference.](https://docs.qloo.com/reference/parameters)
- Want to know which parameters are valid for each entity type (like Actor, Destination, or Brand)? See the [Entity Type Parameter Guide](https://docs.qloo.com/reference/available-parameters-by-entity-type).

# OpenAPI definition

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "Qloo API",
    "version": "2.0",
    "description": "Qloo's API",
    "contact": {
      "name": "Support",
      "email": "support@qloo.com"
    }
  },
  "servers": [
    {
      "url": "https://api.qloo.com",
      "description": "Production Qloo API server"
    }
  ],
  "security": [
    {
      "ApiKey": []
    }
  ],
  "tags": [
    {
      "name": "insights",
      "description": "Returns high-level insights across entities"
    }
  ],
  "paths": {
    "/v2/insights": {
      "get": {
        "summary": "Insights API Deep Dive",
        "x-readme-title": "Insights API Deep Dive",
        "operationId": "get-insights",
        "description": "Provides taste insights that reflect audience preferences and cultural alignment.",
        "tags": ["insights"],
        "parameters": [
          {
            "name": "filter.type",
            "in": "query",
            "description": "Filter by the category of entity to return (urn:entity:place). The `urn:entity:audience` value is deprecated and should not be used for new integrations.\n",
            "required": true,
            "schema": {
              "examples": ["urn:entity:book"],
              "description": "Qloo Types supported by Insights API. Note: `urn:entity:locality` is partially supported and only allows `signal.interests.entities` when the provided entities are localities.\n",
              "type": "string",
              "enum": [
                "urn:entity:artist",
                "urn:entity:book",
                "urn:entity:brand",
                "urn:entity:locality",
                "urn:entity:movie",
                "urn:entity:person",
                "urn:entity:place",
                "urn:entity:podcast",
                "urn:entity:tv_show",
                "urn:entity:videogame",
                "urn:heatmap",
                "urn:entity:audience"
              ],
              "x-enum-descriptions": [
                "Artist",
                "Book",
                "Brand",
                "Locality (partially supported)",
                "Movie",
                "Person",
                "Place",
                "Podcast",
                "TV show",
                "Videogame",
                "Heatmap",
                "Audience (deprecated)"
              ]
            }
          },
          {
            "name": "bias.trends",
            "in": "query",
            "description": "Adjusts how much strength trends alter the result set.",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "string",
              "enum": ["off", "very_low", "low", "mid", "medium", "high", "very_high"],
              "default": "medium"
            },
            "examples": {
              "default": {
                "value": "medium"
              }
            }
          },
          {
            "name": "bias.content_based",
            "in": "query",
            "description": "The amount of strength content-based metadata has on the recommendations affinity score.",
            "required": false,
            "schema": {
              "type": "number",
              "format": "integer",
              "default": 0.5,
              "maximum": 1,
              "minimum": 0
            },
            "examples": {
              "default": {
                "value": 0.75
              }
            }
          },
          {
            "name": "bias.quality",
            "in": "query",
            "description": "Biases place ranking by quality score. When quality is the only ranking signal, results sort by quality by default. When combined with other signals, ranking uses the merged affinity score. Places without a quality score are filtered out.\nAccepts a positive number or a weight string (`very_low`, `low`, `mid`, `medium`, `high`, `very_high`). Applies to `filter.type=urn:entity:place` only.\n",
            "required": false,
            "schema": {
              "oneOf": [
                {
                  "type": "string",
                  "enum": ["very_low", "low", "mid", "medium", "high", "very_high"]
                },
                {
                  "type": "number",
                  "exclusiveMinimum": 0
                }
              ],
              "examples": ["high"]
            }
          },
          {
            "name": "diversify.by",
            "in": "query",
            "description": "Limits results to a set number of high-affinity entities per group, controlled by `diversify.take`. Set to `properties.geocode.city` to group by city, or `properties.geocode.metro` to group by metro area. Set to `subtype` to cap results per tag subtype; applies to `filter.type=urn:tag` only.\nGroups are ranked based on the highest-affinity entity within them. Entities within each group are ordered by individual affinity.\n",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["properties.geocode.city", "properties.geocode.metro", "subtype"],
              "examples": ["properties.geocode.city", "properties.geocode.metro", "subtype"]
            }
          },
          {
            "name": "diversify.take",
            "in": "query",
            "description": "Sets the maximum number of results to return per city when using \"diversify.by\": \"properties.geocode.city\". For example, if set to 5, the response will include up to 5 entities with the highest affinities in each city.\n",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "examples": [5]
            }
          },
          {
            "name": "backfill.cross_domain.take",
            "in": "query",
            "description": "Controls the maximum number of cross-domain backfill results appended when primary results are insufficient. Default is 20. Maximum is 20.\n",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 20,
              "default": 20
            }
          },
          {
            "name": "backfill.content_based.take",
            "in": "query",
            "description": "Controls the maximum number of content-based similarity backfill results appended when other signals are unavailable. Default is 10. Maximum is 10.\n",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 10,
              "default": 10
            }
          },
          {
            "name": "feature.explainability",
            "in": "query",
            "required": false,
            "schema": {
              "type": "boolean",
              "examples": [true]
            },
            "description": "When set to `true`, the response includes explainability metadata for each recommendation and for the overall result set. Default is `false`.\n**Per recommendation**: Each result includes a `query.explainability` section showing which input entities (e.g., `signal.interests.entities`) contributed to the recommendation, with normalized scores between 0 and 1. Entities scoring ≥ 0.1 are always included; lower-impact entities may be omitted to reduce response size.\n**Aggregate impact**: The top-level `query.explainability` object shows the average influence of each input entity across top-N result subsets (e.g., top 3, 5, 10, all).\n**Note**: If explainability cannot be computed, a warning is returned under `query.explainability.warning`, but results are still returned as normal.\n"
          },
          {
            "name": "filter.address",
            "in": "query",
            "description": "Filter by address using a partial string match. Supports comma-separated terms.\n",
            "required": false,
            "style": "form",
            "explode": false,
            "schema": {
              "type": "string",
              "minLength": 1
            },
            "examples": {
              "commaSeparated": {
                "summary": "Comma-separated address terms",
                "value": "123 Main St,New York,NY"
              },
              "partial": {
                "summary": "Partial string match",
                "value": "123 Main St"
              }
            }
          },
          {
            "name": "filter.content_rating",
            "in": "query",
            "description": "Filter by a comma-separated list of content ratings. Only applies to entities of type `urn:entity:movie` and `urn:entity:tv_show`. Content ratings are based on the MPAA and TV Parental Guidelines systems, and represent suitability for different audiences.\nCommon values include: - G, PG, PG-13, R, NC-17 (MPAA film ratings) - TV-G, TV-PG, TV-14, TV-MA, TV-Y, TV-Y7 (TV parental ratings) - Not Rated, Unrated, Approved, Passed (legacy or uncategorized labels)\n",
            "required": false,
            "schema": {
              "type": "string",
              "enum": [
                "G",
                "PG",
                "PG-13",
                "R",
                "NC-17",
                "TV-G",
                "TV-PG",
                "TV-14",
                "TV-MA",
                "TV-Y",
                "TV-Y7",
                "TV-Y7-FV",
                "Not Rated",
                "Unrated",
                "Approved",
                "Passed",
                "X",
                "GP",
                "M",
                "13+",
                "16+",
                "18+"
              ],
              "examples": ["PG-13", "TV-MA", "R,TV-14"]
            }
          },
          {
            "name": "filter.date_of_birth.max",
            "in": "query",
            "description": "Filter by the most recent date of birth desired for the queried person.",
            "required": false,
            "schema": {
              "type": "string",
              "format": "date",
              "examples": ["2004-01-01"]
            }
          },
          {
            "name": "filter.date_of_birth.min",
            "in": "query",
            "description": "Filter by the earliest date of birth desired for the queried person.",
            "required": false,
            "schema": {
              "type": "string",
              "format": "date",
              "examples": ["1996-01-01"]
            }
          },
          {
            "name": "filter.date_of_death.max",
            "in": "query",
            "description": "Filter by the most recent date of death desired for the queried person.",
            "required": false,
            "schema": {
              "type": "string",
              "format": "date",
              "examples": ["2004-01-01"]
            }
          },
          {
            "name": "filter.date_of_death.min",
            "in": "query",
            "description": "Filter by the earliest date of death desired for the queried person.",
            "required": false,
            "schema": {
              "type": "string",
              "format": "date",
              "examples": ["1985-01-01"]
            }
          },
          {
            "name": "filter.exclude.tags",
            "in": "query",
            "description": "Exclude entities associated with a comma-separated list of tags.",
            "schema": {
              "type": "string",
              "examples": ["urn:tag:genre:media:mystery,urn:tag:genre:media:drama"]
            }
          },
          {
            "name": "operator.filter.exclude.tags",
            "in": "query",
            "description": "Specifies how multiple `filter.exclude.tags` values are combined in the query. Use \"union\" (equivalent to a logical \"or\") to exclude results that contain at least one of the specified tags, or \"intersection\" (equivalent to a logical \"and\") to exclude only results that contain all specified tags. The default is \"union\".",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["union", "intersection"],
              "examples": ["union"]
            }
          },
          {
            "name": "filter.exists",
            "in": "query",
            "description": "Filter results to include only entities that contain the specified property. For example, use `properties.image` to return only entities that include an image URL, or `properties.description` to filter for entities with a text description.\n",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["properties.image", "properties.description"],
              "examples": ["properties.image", "properties.description"]
            }
          },
          {
            "name": "filter.external.exists",
            "in": "query",
            "description": "Filter by a comma-separated list of external keys. (`resy`\\|`michelin`\\|`tablet`).",
            "required": false,
            "schema": {
              "type": "string",
              "examples": ["resy,michelin"]
            }
          },
          {
            "name": "operator.filter.external.exists",
            "in": "query",
            "description": "Specifies how multiple `filter.external.exists` values are combined in the query. Use \"union\" (equivalent to a logical \"or\") to return results that match at least one of the specified external keys (e.g., resy, michelin, or tablet), or \"intersection\" (equivalent to a logical \"and\") to return only results that match all specified external keys. The default is \"union\".",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["union", "intersection"],
              "examples": ["union"]
            }
          },
          {
            "name": "filter.external.resy.count.max",
            "in": "query",
            "description": "Filter places to include only those with a Resy rating count less than or equal to the specified maximum.   Applies only to entities with `filter.type` of `urn:entity:place`.\n",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 0,
              "examples": [200]
            }
          },
          {
            "name": "filter.external.resy.count.min",
            "in": "query",
            "description": "Filter places to include only those with a Resy rating count greater than or equal to the specified minimum.   Applies only to entities with `filter.type` of `urn:entity:place`.\n",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 0,
              "examples": [20]
            }
          },
          {
            "name": "filter.external.resy.party_size.max",
            "in": "query",
            "description": "Filter by the maximum supported party size required for a Point of Interest.",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "examples": [10]
            }
          },
          {
            "name": "filter.external.resy.party_size.min",
            "in": "query",
            "description": "Filter by the minimum supported party size required for a Point of Interest.",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "examples": [2]
            }
          },
          {
            "name": "filter.external.resy.rating.max",
            "in": "query",
            "description": "Filter places to include only those with a Resy rating less than or equal to the specified maximum (1–5 scale). Applies only to entities with `filter.type` of `urn:entity:place`.",
            "required": false,
            "schema": {
              "type": "number",
              "minimum": 0,
              "maximum": 5,
              "examples": [4.5]
            }
          },
          {
            "name": "filter.external.resy.rating.min",
            "in": "query",
            "description": "Filter places to include only those with a Resy rating greater than or equal to the specified minimum (1–5 scale). Applies only to entities with `filter.type` of `urn:entity:place`.",
            "required": false,
            "schema": {
              "type": "number",
              "minimum": 0,
              "maximum": 5,
              "examples": [3.5]
            }
          },
          {
            "name": "filter.external.tripadvisor.rating.count.min",
            "in": "query",
            "description": "Filter places to include only those with a Tripadvisor review count greater than or equal to the specified minimum. This filter only applies to entities with `filter.type` of `urn:entity:place`.\n",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 0,
              "examples": [50]
            }
          },
          {
            "name": "filter.external.tripadvisor.rating.count.max",
            "in": "query",
            "description": "Filter places to include only those with a Tripadvisor review count less than or equal to the specified maximum. This filter only applies to entities with `filter.type` of `urn:entity:place`.\n",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 0,
              "examples": [500]
            }
          },
          {
            "name": "filter.external.tripadvisor.rating.max",
            "in": "query",
            "description": "Filter places to include only those with a Tripadvisor rating less than or equal to the specified maximum. This filter only applies to entities with `filter.type` of `urn:entity:place`.\n",
            "required": false,
            "schema": {
              "type": "number",
              "minimum": 0,
              "maximum": 5,
              "examples": [4]
            }
          },
          {
            "name": "filter.external.tripadvisor.rating.min",
            "in": "query",
            "description": "Filter places to include only those with a Tripadvisor rating greater than or equal to the specified minimum. This filter only applies to entities with `filter.type` of `urn:entity:place`.\n",
            "required": false,
            "schema": {
              "type": "number",
              "minimum": 0,
              "maximum": 5,
              "examples": [3]
            }
          },
          {
            "name": "filter.finale_year.max",
            "in": "query",
            "description": "Filter by the latest desired year for the final season of a TV show.",
            "required": false,
            "schema": {
              "type": "integer",
              "examples": [2021]
            }
          },
          {
            "name": "filter.finale_year.min",
            "in": "query",
            "description": "Filter by the earliest desired year for the final season of a TV show.",
            "required": false,
            "schema": {
              "type": "integer",
              "examples": [2014]
            }
          },
          {
            "name": "filter.gender",
            "in": "query",
            "description": "Filter results to align with a specific gender identity. Used to personalize output based on known or inferred gender preferences.\n",
            "required": false,
            "schema": {
              "type": "string",
              "examples": ["female"]
            }
          },
          {
            "name": "filter.geocode.admin1_region",
            "in": "query",
            "description": "Filter by `properties.geocode.admin1_region`. Exact match (usually state).",
            "required": false,
            "schema": {
              "type": "string",
              "examples": ["NY"]
            }
          },
          {
            "name": "filter.geocode.admin2_region",
            "in": "query",
            "description": "Filter by `properties.geocode.admin2_region`. Exact match (often county or borough).",
            "required": false,
            "schema": {
              "type": "string",
              "examples": ["New York County"]
            }
          },
          {
            "name": "filter.geocode.country_code",
            "in": "query",
            "description": "Filter by `properties.geocode.country_code`. Exact match (two-letter country code).",
            "required": false,
            "schema": {
              "type": "string",
              "examples": ["US"]
            }
          },
          {
            "name": "filter.geocode.name",
            "in": "query",
            "description": "Filter by `properties.geocode.name`. Exact match (usually city or town name).",
            "required": false,
            "schema": {
              "type": "string",
              "examples": ["New York"]
            }
          },
          {
            "name": "filter.location.metro",
            "in": "query",
            "description": "Filter by `properties.geocode.metro`. Exact match on metro area name. Use this to narrow results to entities within a specific metropolitan area.",
            "required": false,
            "schema": {
              "type": "string",
              "examples": ["New York"]
            }
          },
          {
            "name": "filter.hotel_class.max",
            "in": "query",
            "description": "Filter by the maximum desired hotel class (1-5, inclusive).",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 5,
              "examples": [5]
            }
          },
          {
            "name": "filter.hotel_class.min",
            "in": "query",
            "description": "Filter by the minimum desired hotel class (1-5, inclusive).",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 5,
              "examples": [3]
            }
          },
          {
            "name": "filter.dimensions.hotel_class",
            "in": "query",
            "description": "Restricts the `hotel_class` heatmap dimension to specified hotel classes. When set, the dimension score reflects the proportion of hotels in the selected classes. Without this parameter, the score is based on the average hotel class across each geohash. Also adds `hotel_class_count_affinity_rank` and `hotel_class_count_affinity` to the response.\nRequires `hotel_class` in `heatmap.dimensions`.\n",
            "required": false,
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "integer",
                "minimum": 1,
                "maximum": 5
              },
              "examples": [4, 5]
            }
          },
          {
            "name": "filter.hours",
            "in": "query",
            "description": "Filter by the day of the week the Point of Interest must be open (Monday, Tuesday, etc.).",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
              "examples": ["monday"]
            }
          },
          {
            "name": "filter.latest_known_year.max",
            "in": "query",
            "description": "Filter by a certain maximum year that shows were released or updated.",
            "required": false,
            "content": {
              "application/json": {
                "schema": {
                  "type": "integer",
                  "examples": [2023]
                }
              }
            }
          },
          {
            "name": "filter.latest_known_year.min",
            "in": "query",
            "description": "Filter by a certain minimum year that shows were released or updated.",
            "required": false,
            "content": {
              "application/json": {
                "schema": {
                  "type": "integer",
                  "examples": [2014]
                }
              }
            }
          },
          {
            "name": "filter.location",
            "in": "query",
            "description": "A location to base searches on. Accepts a lat/lon coordinate pair or a WKT geometry string. Also accepts a Qloo entity UUID.\n\n- **Lat/lon coordinate pair**: `latitude,longitude` (e.g. `40.742306,-74.003494`)\n- **WKT geometry string**: a Well-Known Text geometry such as `POINT(-73.99823 40.722668)`\n- **Qloo entity UUID**: a Qloo entity ID\n",
            "style": "form",
            "explode": false,
            "examples": {
              "latLonExample": {
                "summary": "Latitude/longitude coordinate pair",
                "value": "40.742306,-74.003494"
              },
              "wktExample": {
                "summary": "WKT geometry string",
                "value": "POINT(-73.99823 40.722668)"
              }
            },
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "filter.exclude.location",
            "in": "query",
            "description": "Exclude results that fall within a specific location, defined by either a WKT `POINT`, `POLYGON`, `MULTIPOLYGON`, or a Qloo ID for a named `urn:entity:locality`.   WKT is formatted with longitude first (e.g., `POINT(-73.99823 40.722668)`).   When using a locality ID or a WKT `POLYGON`, setting `filter.location.radius` to a value > 0 creates a fuzzy exclusion boundary.\n",
            "required": false,
            "schema": {
              "type": "string",
              "examples": ["POINT(-73.99823 40.722668)"]
            }
          },
          {
            "name": "filter.location.query",
            "in": "query",
            "description": "A text-based name lookup used to search for one or more named `urn:entity:locality` Qloo IDs for filtering requests. This parameter performs fuzzy text matching only — it will not work with a UUID or Qloo entity ID. To pass a locality ID directly, use `filter.location` instead.\n  - For **GET requests**: Provide a single locality query as a string.\n  - For **POST requests**:\n    - You can still send a single locality as a string.\n    - Or you can send an array of locality names to query multiple localities\nat once. When multiple localities are provided, their geographic shapes are merged, and the system returns results with the highest affinities across the combined area.\nLocality queries are fuzzy-matched and case-insensitive. Examples include `New York City`, `Garden City`, `New York`, `Los Angeles`, `Lower East Side`, and AKAs like `The Big Apple`. When a single locality is supplied, the response JSON includes `query.locality.signal` with the matched Qloo entity. If multiple are supplied, this field is omitted. By default, the API includes a tuning that also captures nearby entities just outside the official boundaries of the locality. To turn this off and limit results strictly to within the locality, set `filter.location.radius=0`. If no localities are found, the API returns a 400 error.\n",
            "required": false,
            "schema": {
              "oneOf": [
                {
                  "type": "string"
                },
                {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              ]
            },
            "examples": {
              "singleLocality": {
                "summary": "A single locality string",
                "value": "New York City"
              },
              "multipleLocalities": {
                "summary": "An array of locality strings (POST only)",
                "value": ["Miami", "Miami Beach"]
              }
            }
          },
          {
            "name": "filter.exclude.location.query",
            "in": "query",
            "description": "A query used to exclude results based on one or more named `urn:entity:locality` Qloo IDs, resolved from fuzzy-matched locality names.   This is equivalent to passing the resolved Locality Qloo ID(s) into `filter.exclude.location`.\n- For **GET requests**: Provide a single locality query as a string. - For **POST requests**:\n  - You can still send a single locality as a string.\n  - Or send an array of locality names to exclude multiple areas at once. When\nmultiple localities are provided, their geographic shapes are merged, and the system excludes results from across the combined area.\nLocality queries are case-insensitive and support common AKAs (e.g., `The Big Apple` for New York).   When a single locality is supplied, the response includes `query.locality.exclude.signal` with the matched Qloo entity.   If multiple are supplied, this field is omitted. If no localities are matched, the API returns a 400 error.\n",
            "required": false,
            "schema": {
              "oneOf": [
                {
                  "type": "string"
                },
                {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              ]
            },
            "examples": {
              "singleLocality": {
                "summary": "A single locality to exclude",
                "value": "Williamsburg"
              },
              "multipleLocalities": {
                "summary": "Multiple localities to exclude (POST only)",
                "value": ["Chelsea", "SoHo"]
              }
            }
          },
          {
            "name": "filter.location.geohash",
            "in": "query",
            "description": "Filter by a geohash. Geohashes are generated using the Python package pygeohash with a precision of 12 characters. This parameter returns all POIs that start with the specified geohash. For example, supplying `dr5rs` would allow returning the geohash `dr5rsjk4sr2w`.",
            "required": false,
            "schema": {
              "type": "string",
              "examples": ["dr5rsjk4sr2w"]
            }
          },
          {
            "name": "filter.exclude.location.geohash",
            "in": "query",
            "description": "Exclude all entities whose geohash starts with the specified prefix.   Geohashes are generated using the Python package `pygeohash` with a precision of 12 characters.   For example, supplying `dr5rs` would exclude any result whose geohash begins with `dr5rs`, such as `dr5rsjk4sr2w`.\n",
            "required": false,
            "schema": {
              "type": "string",
              "examples": ["dr5rs"]
            }
          },
          {
            "name": "filter.location.radius",
            "in": "query",
            "description": "Filter by the radius (in meters) when also supplying `filter.location` or `filter.location.query`.\nWhen a locality is passed via `filter.location` or `filter.location.query` and this parameter is **not provided**, the API expands the locality boundary by the lesser of 10% of the locality's diameter or 2,414 meters (~1.5 miles).\nSetting this parameter to **0** disables this padding and restricts results strictly to within the locality boundary.\nA larger value pads the boundary by that radius in meters.\n",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 15000,
              "maximum": 800000
            },
            "examples": {
              "defaultRadius": {
                "summary": "Custom radius in meters",
                "value": 10000
              },
              "disableTuning": {
                "summary": "Turn off default tuning behavior",
                "value": 0
              }
            }
          },
          {
            "name": "filter.parents.types",
            "in": "query",
            "description": "Filter by a comma-separated list of parental entity types.",
            "required": false,
            "style": "form",
            "explode": false,
            "schema": {
              "type": "string",
              "enum": [
                "urn:audience:communities",
                "urn:audience:global_issues",
                "urn:audience:hobbies_and_interests",
                "urn:audience:investing_interests",
                "urn:audience:leisure",
                "urn:audience:life_stage",
                "urn:audience:lifestyle_preferences_beliefs",
                "urn:audience:political_preferences",
                "urn:audience:professional_area",
                "urn:audience:spending_habits"
              ],
              "examples": ["urn:audience:communities", "urn:audience:global_issues"]
            }
          },
          {
            "name": "filter.popularity.max",
            "in": "query",
            "description": "Filter by the maximum popularity percentile a Point of Interest must have (float, between 0 and 1; closer to 1 indicates higher popularity, e.g., 0.98 for the 98th percentile).",
            "required": false,
            "schema": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "examples": [0.98]
            }
          },
          {
            "name": "filter.popularity.min",
            "in": "query",
            "description": "Filter by the minimum popularity percentile required for a Point of Interest (float, between 0 and 1; closer to 1 indicates higher popularity, e.g., 0.98 for the 98th percentile).",
            "required": false,
            "schema": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "examples": [0.5]
            }
          },
          {
            "name": "filter.price_level.max",
            "in": "query",
            "description": "Filter by the maximum price level a restaurant can have. Accepts values 1–4, where higher numbers indicate more expensive restaurants (similar to dollar signs). Applies only to Places entities.",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 4,
              "examples": [3]
            }
          },
          {
            "name": "filter.price_level.min",
            "in": "query",
            "description": "Filter by the minimum price level a restaurant can have. Accepts values 1–4, where higher numbers indicate more expensive restaurants (similar to dollar signs). Applies only to Places entities.",
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 4,
              "examples": [1]
            }
          },
          {
            "name": "filter.dimensions.price_level",
            "in": "query",
            "description": "Restricts the `price_level` heatmap dimension to specified price tiers. When set, the dimension score reflects the proportion of places at the selected price levels. Without this parameter, the score is based on the average price level across each geohash. Also adds `price_level_count_affinity_rank` and `price_level_count_affinity` to the response.\nRequires `price_level` in `heatmap.dimensions`.\n",
            "required": false,
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "integer",
                "minimum": 1,
                "maximum": 4
              },
              "examples": [1, 2]
            }
          },
          {
            "name": "filter.price_range.from",
            "in": "query",
            "description": "Filter by the minimum price in the desired hotel price range. Accepts an integer between 0 and 1,000,000. Applies only to Places entities.",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 0,
              "maximum": 1000000,
              "examples": [200]
            }
          },
          {
            "name": "filter.price_range.to",
            "in": "query",
            "description": "Filter by the maximum price in the desired hotel price range. Accepts an integer between 0 and 1,000,000. Applies only to Places entities.",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 0,
              "maximum": 1000000,
              "examples": [200]
            }
          },
          {
            "name": "filter.properties.business_rating.max",
            "in": "query",
            "description": "Filter by the highest desired business rating.",
            "required": false,
            "schema": {
              "type": "number",
              "format": "float",
              "enum": [1, 2, 3, 4, 5],
              "examples": [3]
            }
          },
          {
            "name": "filter.properties.business_rating.min",
            "in": "query",
            "description": "Filter by the lowest desired business rating.",
            "required": false,
            "schema": {
              "type": "number",
              "format": "float",
              "enum": [1, 2, 3, 4, 5],
              "examples": [3]
            }
          },
          {
            "name": "filter.publication_year.max",
            "in": "query",
            "description": "Filter by the latest desired year of initial publication for the work.",
            "required": false,
            "schema": {
              "type": "number",
              "examples": [2021]
            }
          },
          {
            "name": "filter.publication_year.min",
            "in": "query",
            "description": "Filter by the earliest desired year of initial publication for the work.",
            "required": false,
            "schema": {
              "type": "number",
              "examples": [1985]
            }
          },
          {
            "name": "filter.rating.max",
            "in": "query",
            "description": "Filter by the maximum Qloo rating a Point of Interest must have (float, between 0 and 5).",
            "required": false,
            "schema": {
              "type": "number",
              "minimum": 0,
              "maximum": 5,
              "examples": [4.5]
            }
          },
          {
            "name": "filter.rating.min",
            "in": "query",
            "description": "Filter by the minimum Qloo rating a Point of Interest must have (float, between 0 and 5).",
            "required": false,
            "schema": {
              "type": "number",
              "minimum": 0,
              "maximum": 5,
              "examples": [3.5]
            }
          },
          {
            "name": "filter.references_brand",
            "in": "query",
            "description": "Filter by a comma-separated list of brand entity IDs. Use this to narrow down place recommendations to specific brands. For example, to include only Walmart stores, pass the Walmart brand ID. Each ID must match exactly. Applies only to PLACE insights.",
            "required": false,
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "examples": ["636E1B95-6232-43E1-BDFE-37CD209C2CE3,7D2B1DFF-9D5D-44DE-970E-46B80C76CFA6"]
            }
          },
          {
            "name": "operator.filter.references_brand",
            "in": "query",
            "description": "Specifies how multiple `filter.references_brand` values are combined in the query. Use \"union\" (equivalent to a logical \"or\") to return results that match at least one of the specified brand IDs, or \"intersection\" (equivalent to a logical \"and\") to return only results that match all specified brand IDs. The default is \"union\". Applies only to PLACE insights.",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["union", "intersection"],
              "examples": ["union"]
            }
          },
          {
            "name": "filter.release_country",
            "in": "query",
            "description": "Filter by a list of countries where a movie or TV show was originally released.",
            "required": false,
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "examples": ["United States", "France"]
            }
          },
          {
            "name": "operator.filter.release_country",
            "in": "query",
            "description": "Specifies how multiple `filter.release_country`` values are combined in the query. Use \"union\" (equivalent to a logical \"or\") to return results that match at least one of the specified countries, or \"intersection\" (equivalent to a logical \"and\") to return only results that match all specified countries. The default is \"union\".",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["intersection", "union"],
              "examples": ["union"]
            }
          },
          {
            "name": "filter.release_date.max",
            "in": "query",
            "description": "Filter by the latest desired release date.",
            "required": false,
            "schema": {
              "type": "string",
              "format": "date",
              "examples": ["2024-01-01"]
            }
          },
          {
            "name": "filter.release_date.min",
            "in": "query",
            "description": "Filter by the earliest desired release date.",
            "required": false,
            "schema": {
              "type": "string",
              "format": "date",
              "examples": ["2021-01-01"]
            }
          },
          {
            "name": "filter.release_year.max",
            "in": "query",
            "description": "Filter by the latest desired release year.",
            "required": false,
            "schema": {
              "type": "integer",
              "examples": [2024]
            }
          },
          {
            "name": "filter.release_year.min",
            "in": "query",
            "description": "Filter by the earliest desired release year.",
            "required": false,
            "schema": {
              "type": "integer",
              "examples": [1996]
            }
          },
          {
            "name": "filter.results.entities",
            "in": "query",
            "description": "Filter by a comma-separated list of entity IDs. Often used to assess the affinity of an entity towards input.",
            "required": false,
            "schema": {
              "type": "string",
              "examples": ["636E1B95-6232-43E1-BDFE-37CD209C2CE3,7D2B1DFF-9D5D-44DE-970E-46B80C76CFA6"]
            }
          },
          {
            "name": "filter.results.entities.query",
            "in": "query",
            "description": "Search for one or more entities by name to use as filters.   - For **GET requests**: Provide a single entity name as a string. - For **POST requests**: You can provide a single name or an array of names.\n",
            "required": false,
            "schema": {
              "oneOf": [
                {
                  "type": "string"
                },
                {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              ]
            },
            "examples": {
              "singleEntity": {
                "summary": "A single entity query",
                "value": "Balthazar"
              },
              "multipleEntities": {
                "summary": "Multiple entity queries (POST only)",
                "value": ["Balthazar", "Via Carota"]
              }
            }
          },
          {
            "name": "filter.exclude.entities",
            "in": "query",
            "description": "A comma-separated list of entity IDs to remove from the results.",
            "required": false,
            "schema": {
              "type": "string",
              "examples": ["39458DC0-F91D-4591-80A8-E254E66F84A2,B315A4B4-6756-4CF3-8297-75FD94CC8CF2"]
            }
          },
          {
            "name": "filter.exclude.entities.query",
            "in": "query",
            "description": "This parameter can only be supplied when using POST HTTP method, since it requires JSON encoded body.\nThe value for `filter.exclude.entities.query` is a JSON array with objects containing the `name` and `address` properties.\nFor a fuzzier search, just include an array of strings.\nWhen supplied, it overwrites the `filter.exclude.entities` object with resolved entity IDs.\nThe response will contain a path `query.entities.exclude`, with partial Qloo entities that were matched by the query.\nIf no entities are found, the API will throw a `400` error.\n",
            "required": false,
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {
                      "name": {
                        "type": "string"
                      },
                      "address": {
                        "type": "string"
                      }
                    }
                  },
                  {
                    "type": "string"
                  }
                ]
              },
              "examples": [
                {
                  "name": "Balthazar",
                  "address": "80 Spring St, New York"
                },
                "Balthazar"
              ]
            }
          },
          {
            "name": "filter.results.tags",
            "in": "query",
            "description": "Filter by a comma-separated list of tag IDs. Often used to assess the affinity of a tag towards input.",
            "required": false,
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "examples": ["urn:tag:genre:place:restaurant:japanese", "urn:tag:style:qloo:indie"]
            }
          },
          {
            "name": "filter.tags",
            "in": "query",
            "description": "Filter results by a tag",
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "examples": {
              "default": {
                "value": ["urn:tag:genre:action", "urn:tag:genre:place:tourist_attraction"]
              }
            }
          },
          {
            "name": "operator.filter.tags",
            "in": "query",
            "description": "The operator.filter.tags parameter controls whether the API returns results matching all (\"intersection\") or any (\"union\") of the input tags.",
            "schema": {
              "type": "string",
              "enum": ["intersection", "union"],
              "default": "union"
            },
            "examples": {
              "default": {
                "value": "intersection"
              }
            }
          },
          {
            "name": "offset",
            "in": "query",
            "description": "The number of results to skip, starting from 0. Allows arbitrary offsets but is less commonly used than `page`.",
            "schema": {
              "type": "integer",
              "examples": [5]
            }
          },
          {
            "name": "output.heatmap.boundary",
            "in": "query",
            "description": "Indicates the type of heatmap output desired: The default is geohashes. The other options are a city or a neighborhood.",
            "required": false,
            "schema": {
              "type": "string",
              "examples": ["urn:entity:locality"]
            }
          },
          {
            "name": "heatmap.dimensions",
            "in": "query",
            "description": "Adds per-geohash place attributes as additional heatmap response columns. Each requested dimension adds `<dim>_affinity_rank` (normalized 0–1) and `<dim>_affinity` (percent rank) values. Dimensions also influence the overall `query.affinity` ranking.\nOnly applies when `filter.type=urn:entity:heatmap` and `output.heatmap.boundary=urn:geohash`.\n",
            "required": false,
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string",
                "enum": ["quality", "popularity", "hotel_class", "price_level"]
              },
              "examples": ["quality", "price_level"]
            }
          },
          {
            "name": "page",
            "in": "query",
            "description": "The page number",
            "schema": {
              "type": "integer",
              "format": "int32",
              "minimum": 1,
              "maximum": 100,
              "default": 1
            },
            "examples": {
              "default": {
                "value": 1
              }
            }
          },
          {
            "name": "signal.demographics.age",
            "in": "query",
            "description": "A comma-separated list of age ranges that influence the affinity score.(35_and_younger\\|36_to_55\\|55_and_older).",
            "required": false,
            "schema": {
              "type": "string",
              "enum": [
                "35_and_younger",
                "36_to_55",
                "24_and_younger",
                "25_to_29",
                "30_to_34",
                "35_to_44",
                "45_to_54",
                "55_and_older"
              ],
              "examples": ["36_to_55"]
            }
          },
          {
            "name": "signal.demographics.age.weight",
            "in": "query",
            "description": "Specifies the extent to which results should be influenced by age-based demographic signals. Higher values increase the influence of age data; lower values reduce its impact.",
            "required": false,
            "schema": {
              "oneOf": [
                {
                  "type": "number",
                  "minimum": 0
                },
                {
                  "type": "string",
                  "enum": ["very_low", "low", "mid", "medium", "high", "very_high"]
                }
              ],
              "examples": ["medium"]
            }
          },
          {
            "name": "signal.demographics.audiences.weight",
            "in": "query",
            "description": "Specifies the extent to which results should be influenced by the preferences of the selected audience. Higher values increase the influence of audience preferences; lower values reduce their impact.",
            "required": false,
            "schema": {
              "oneOf": [
                {
                  "type": "number",
                  "minimum": 0
                },
                {
                  "type": "string",
                  "enum": ["very_low", "low", "mid", "medium", "high", "very_high"]
                }
              ],
              "examples": ["medium"]
            }
          },
          {
            "name": "signal.demographics.audiences",
            "in": "query",
            "description": "A comma-separated list of audiences that influence the affinity score. Audience IDs can be retrieved via the v2/audiences search route.",
            "required": false,
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "examples": ["urn:audience:communities", "urn:audience:spending_habits"]
            }
          },
          {
            "name": "signal.demographics.gender",
            "in": "query",
            "description": "Influence the affinity score based on gender (male\\|female).",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["male", "female"],
              "examples": ["male"]
            }
          },
          {
            "name": "signal.demographics.gender.weight",
            "in": "query",
            "description": "Specifies the extent to which results should be influenced by gender-based demographic signals. Higher values increase the influence of gender data; lower values reduce its impact.",
            "required": false,
            "schema": {
              "oneOf": [
                {
                  "type": "number",
                  "minimum": 0
                },
                {
                  "type": "string",
                  "enum": ["very_low", "low", "mid", "medium", "high", "very_high"]
                }
              ],
              "examples": ["medium"]
            }
          },
          {
            "name": "signal.interests.entities",
            "in": "query",
            "description": "A comma-separated list of entity IDs that influence the affinity score.",
            "required": false,
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "examples": ["636E1B95-6232-43E1-BDFE-37CD209C2CE3,7D2B1DFF-9D5D-44DE-970E-46B80C76CFA6"]
            }
          },
          {
            "name": "signal.interests.entities.query",
            "in": "query",
            "description": "This parameter can only be supplied when using POST HTTP method, which requires a JSON-encoded body.\nThe value should be a JSON array of objects with `name` and `address` properties;\nsupports `resolve_to` for specifying resolution to place, brand, or both.\n",
            "required": false,
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {
                      "name": {
                        "type": "string"
                      },
                      "address": {
                        "type": "string"
                      },
                      "resolve_to": {
                        "type": "string",
                        "enum": ["place", "brand", "both"]
                      }
                    }
                  },
                  {
                    "type": "string"
                  }
                ]
              },
              "examples": [
                {
                  "name": "Balthazar",
                  "address": "80 Spring St, New York"
                },
                "Balthazar",
                {
                  "name": "Naya",
                  "address": "ny",
                  "resolve_to": "both"
                }
              ]
            }
          },
          {
            "name": "signal.interests.entities.weight",
            "in": "query",
            "description": "Specifies the extent to which results should be influenced by the relevance of entities (in-domain or cross-domain). Higher values increase the influence of entities; lower values reduce their impact.",
            "required": false,
            "schema": {
              "oneOf": [
                {
                  "type": "number",
                  "minimum": 0
                },
                {
                  "type": "string",
                  "enum": ["very_low", "low", "mid", "medium", "high", "very_high"]
                }
              ],
              "examples": ["medium"]
            }
          },
          {
            "name": "signal.interests.tags",
            "in": "query",
            "description": "Allows you to supply a list of tags to influence affinity scores. You can also include a `weight` property that will indicate the strength of influence for each tag in your list.\n  - For GET requests: Provide a comma-separated list of tag IDs. \n  - For POST requests, you can either:\n    - Send the same string of comma-separated values.\n    - Send an array of objects with \"tag\" and \"weight\" properties, such as:\n      [\n        { \"tag\": \"urn:tag:genre:media:horror\", \"weight\": 7 },\n        { \"tag\": \"urn:tag:genre:media:thriller\", \"weight\": 20 }\n      ]\nWeights must be greater than 0 and are relative. So, a weight of 20 means that tag will more heavily influence affinity scores than a weight of 7.\n",
            "required": false,
            "schema": {
              "oneOf": [
                {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "tag": {
                        "type": "string"
                      },
                      "weight": {
                        "type": "integer"
                      }
                    }
                  }
                }
              ]
            },
            "examples": {
              "listOfTags": {
                "summary": "A comma-separated list of tag IDs",
                "value": ["urn:tag:genre:restaurant:Italian", "urn:tag:genre:restaurant:Mexican"]
              },
              "listOfTagsWeights": {
                "summary": "An array of tag-weight pairs",
                "value": [
                  {
                    "tag": "urn:tag:genre:media:horror",
                    "weight": 7
                  },
                  {
                    "tag": "urn:tag:genre:media:thriller",
                    "weight": 20
                  }
                ]
              }
            }
          },
          {
            "name": "operator.signal.interests.tags",
            "in": "query",
            "description": "Specifies how multiple `signal.interests.tags` values are combined in the query. Use \"union\" (equivalent to a logical \"or\") to return results that contain at least one of the specified tags. In this mode, the tag with the highest affinity is used for scoring. Use \"intersection\" (equivalent to a logical \"and\") or leave this field empty to return results that contain all specified tags, with affinity scores merged across them.",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["union", "intersection"],
              "examples": ["union"]
            }
          },
          {
            "name": "signal.interests.tags.weight",
            "in": "query",
            "description": "Specifies the extent to which results should be influenced by the presence of tags (taste analysis). Higher values increase the influence of tags; lower values reduce their impact.",
            "required": false,
            "schema": {
              "oneOf": [
                {
                  "type": "number",
                  "minimum": 0
                },
                {
                  "type": "string",
                  "enum": ["very_low", "low", "mid", "medium", "high", "very_high"]
                }
              ],
              "examples": ["medium"]
            }
          },
          {
            "name": "signal.location",
            "in": "query",
            "description": "The geolocation to use for geospatial results. The value will be a WKT POINT, POLYGON or a single Qloo ID for a named urn:entity:locality to filter by. WKT is formatted as X then Y, therefore longitude is first (POINT(-73.99823 40.722668)). Unlike filter.location.radius, signal.location.radius is ignored if a Qloo ID or WKT POLYGON is passed.",
            "required": false,
            "schema": {
              "type": "string",
              "examples": ["POINT(-73.99823 40.722668)"]
            }
          },
          {
            "name": "signal.location.radius",
            "in": "query",
            "description": "The optional radius (in meters), used when providing a WKT POINT. We generally recommend avoiding this parameter, as it overrides dynamic density discovery.\nThis parameter also applies when a locality is given via `signal.location` or `signal.location.query` and adjusts the effective area around that locality.",
            "required": false,
            "schema": {
              "type": "integer",
              "maximum": 800000,
              "examples": [5000]
            }
          },
          {
            "name": "signal.location.query",
            "in": "query",
            "description": "A string query used to search for a named urn:entity:locality Qloo ID for geospatial results, effectively equivalent to passing the same Locality Qloo ID into signal.location. You can also supply a locality directly using the companion parameter `signal.location.id`.\nExamples of locality queries include New York City, Garden City, New York, Los Angeles, Lower East Side, and AKAs like The Big Apple. These queries are fuzzy-matched and case-insensitive. When filter.location.query is supplied, the response JSON will include query.locality.signal, which contains the partially matched Qloo entity. If no locality is found, the API will return a 400 error.",
            "required": false,
            "schema": {
              "type": "string",
              "examples": ["New York City"]
            }
          },
          {
            "name": "signal.location.weight",
            "in": "query",
            "description": "Specifies the extent to which results should be influenced by location-based signals (geospatial). Higher values increase the influence of location; lower values reduce its impact.",
            "required": false,
            "schema": {
              "oneOf": [
                {
                  "type": "number",
                  "minimum": 0
                },
                {
                  "type": "string",
                  "enum": ["very_low", "low", "mid", "medium", "high", "very_high"]
                }
              ],
              "examples": ["medium"]
            }
          },
          {
            "name": "signal.interests.entities.include",
            "in": "query",
            "description": "A comma-separated list of additional entity IDs to explicitly include when\ncomputing interest signals. This parameter is useful when you want to force\ncertain entities to contribute to affinity calculations even if they would\nnot normally be inferred by the core signal logic.\n",
            "required": false,
            "style": "form",
            "explode": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "examples": ["E12345,E67890"]
            }
          },
          {
            "name": "filter.entities.query",
            "in": "query",
            "description": "A query string used to search for entity IDs to filter results. This allows\nyou to supply a human-readable term which the system resolves to one or more\nmatching entity identifiers.\n",
            "required": false,
            "schema": {
              "type": "string",
              "examples": ["restaurant"]
            }
          },
          {
            "name": "filter.exclude.location.radius",
            "in": "query",
            "description": "Radius (in meters) to apply when excluding a location defined by\n`filter.exclude.location.id` or `filter.exclude.location.query`. A value of\n`0` restricts exclusion strictly to the boundary; a positive value expands the\nexclusion zone.\n",
            "required": false,
            "schema": {
              "type": "integer",
              "examples": [10000]
            }
          },
          {
            "name": "sort_by",
            "in": "query",
            "description": "Modifies the results sorting algorithm. `distance` requires `filter.location`. `quality` orders place results by quality score (highest first); only places with a quality score are returned. Applies to `filter.type=urn:entity:place` only.\n",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["affinity", "distance", "rating", "quality"],
              "examples": ["affinity"]
            }
          },
          {
            "name": "take",
            "in": "query",
            "required": false,
            "description": "The number of results to return. Default is `20`. The maximum allowed is `50`.\nTo retrieve additional results, use the `page` parameter to access the next page of results. This is the recommended approach for pagination.\nFor specific cases, the `offset` parameter can be used with `take` to skip a set number of results.\n",
            "schema": {
              "type": "integer",
              "default": 20,
              "minimum": 1,
              "maximum": 50,
              "examples": [10]
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Successful Operation",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": {
                      "type": "boolean"
                    },
                    "results": {
                      "type": "object",
                      "properties": {
                        "entities": {
                          "type": "array",
                          "items": {}
                        },
                        "duration": {
                          "type": "number"
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Bad Request"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "ApiKey": {
        "type": "apiKey",
        "in": "header",
        "name": "X-Api-Key"
      }
    }
  }
}
```
