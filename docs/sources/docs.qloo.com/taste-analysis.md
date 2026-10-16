# Taste analysis

Retrieve tag-level insights for audience, entity, or location signals.

This guide shows you how to set up an Insights request to analyze **tags** associated with specific audiences, entities, or locations. The process of understanding the tags that best describe or align with a given signal is referred to as **taste analysis**.

Contents:

1.  [Parameters](#parameters)
    1.  [Required parameters](#required-parameters)
    1.  [Optional parameters](#optional-parameters)
1.  [Request example](#request-example)
1.  [Response example](#response-example)
1.  [See also](#see-also)

## Parameters

### Required parameters

- `filter.type`: Must be set to `urn:tag` to return tag-based insights.
- At least one of the following signal or filter parameters is required:
  - `signal.interests.entities`: Anchor analysis to a specific entity UUID (for example, a brand, restaurant, or actor).
  - `signal.interests.tags`: Use a tag to define the starting context (for example, a cuisine type or media genre).
  - `signal.demographics.audiences`: Focus results on a known audience segment.
  - `signal.location` or `signal.location.query`: Include a location or region to localize tag results.
  - `filter.tag.types`: Specify the tag namespace to limit results (for example, `urn:tag:keyword:media`).
  - `filter.parents.types`: Restrict results to tags associated with specific entity types (for example, `urn:entity:movie`, `urn:entity:tv_show`).

### Optional parameters

You can include additional filters or signals to refine your results:

- Combine `filter.tag.types` with `signal.interests.entities` for targeted analysis.
- Include multiple `signal` parameters to explore intersections (for example, location + audience).
- Use demographic parameters to weight tag affinities by audience composition.

For full parameter definitions and accepted values, visit the [Parameters reference page](parameter-reference.md).

## Request example

The following example retrieves **media-related tag metadata** connected to movies and TV shows. This kind of query can be used to explore the keywords and content associations that define a particular taste profile.

- `filter.type` is set to `urn:tag`
- `filter.tag.types` is set to `urn:tag:keyword:media`
- `filter.parents.types` is set to `urn:entity:movie, urn:entity:tv_show`

**Tag insights request example**

```shell
curl --location 'https://api.qloo.com/v2/insights?filter.type=urn%3Atag&filter.tag.types=urn%3Atag%3Akeyword%3Amedia&filter.parents.types=urn%3Aentity%3Amovie%2C%20urn%3Aentity%3Atv_show' \
--header 'x-api-key: x-api-key'
```

## Response example

The response returns an array of tag objects under `results.tags`. Each object represents a distinct tag associated with the input signals, along with metadata describing where that tag applies.

**Tag insights response example**

```json
{
  "success": true,
  "results": {
    "tags": [
      {
        "tag_id": "urn:tag:keyword:media:brady_bunch",
        "name": "Brady Bunch",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:brady_bunch",
        "query": {}
      },
      {
        "tag_id": "urn:tag:keyword:media:mining_accident",
        "name": "Mining Accident",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:mining_accident",
        "query": {}
      },
      {
        "tag_id": "urn:tag:keyword:media:complex",
        "name": "Complex",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:complex",
        "query": {}
      },
      {
        "tag_id": "urn:tag:keyword:media:hostile_environment",
        "name": "Hostile Environment",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:hostile_environment",
        "query": {}
      },
      {
        "tag_id": "urn:tag:keyword:media:jewish_tradition",
        "name": "Jewish Tradition",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:jewish_tradition",
        "query": {}
      },
      {
        "tag_id": "urn:tag:keyword:media:anthropomorphic_elephant",
        "name": "Anthropomorphic Elephant",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:anthropomorphic_elephant",
        "query": {}
      },
      {
        "tag_id": "urn:tag:keyword:media:max_goof_character",
        "name": "Max Goof Character",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:max_goof_character",
        "query": {}
      },
      {
        "tag_id": "urn:tag:keyword:media:gasoline_fire",
        "name": "Gasoline Fire",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:gasoline_fire",
        "query": {}
      },
      {
        "tag_id": "urn:tag:keyword:media:british_museum",
        "name": "British Museum",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:british_museum",
        "query": {}
      },
      {
        "tag_id": "urn:tag:keyword:media:math_class",
        "name": "Math Class",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:math_class",
        "query": {}
      },
      {
        "tag_id": "urn:tag:keyword:media:tinted_film",
        "name": "Tinted Film",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:tinted_film",
        "query": {}
      },
      {
        "tag_id": "urn:tag:keyword:media:chicago_police_department",
        "name": "Chicago Police Department",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:chicago_police_department",
        "query": {}
      },
      {
        "tag_id": "urn:tag:keyword:media:search_meaning_life",
        "name": "Search For The Meaning Of Life",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:search_meaning_life",
        "query": {}
      },
      {
        "tag_id": "urn:tag:keyword:media:woman_farting",
        "name": "Woman Farting",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:woman_farting",
        "query": {}
      },
      {
        "tag_id": "urn:tag:keyword:media:cultural_clash",
        "name": "Cultural Clash",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:cultural_clash",
        "query": {}
      },
      {
        "tag_id": "urn:tag:keyword:media:disappearance_father",
        "name": "Disappearance Of Father",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:disappearance_father",
        "query": {}
      },
      {
        "tag_id": "urn:tag:keyword:media:city_in_panic",
        "name": "City In Panic",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:city_in_panic",
        "query": {}
      },
      {
        "tag_id": "urn:tag:keyword:media:citroen_d_s",
        "name": "Citroen D S",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:citroen_d_s",
        "query": {}
      },
      {
        "tag_id": "urn:tag:keyword:media:artful_dodger_character",
        "name": "Artful Dodger Character",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:artful_dodger_character",
        "query": {}
      },
      {
        "tag_id": "urn:tag:keyword:media:eiffel_tower_destroyed",
        "name": "Eiffel Tower Destroyed",
        "types": [
          "urn:entity:tv_show",
          "urn:entity:writer",
          "urn:entity:director",
          "urn:entity:tv_episode",
          "urn:entity:actor",
          "urn:entity:movie"
        ],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:eiffel_tower_destroyed",
        "query": {}
      }
    ]
  },
  "duration": 25
}
```

## See also

- [Taste analysis on docs.qloo.com](https://docs.qloo.com/reference/taste-analysis), fetched 2026-10-16, page updated 2025-11-12
- [Analysis compare](analysis-compare.md)
- [Parameter reference](parameter-reference.md)
