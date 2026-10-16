# Personalize by age, gender, and location (no behavioral data needed)

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Pass demographic signal](#pass-demographic-signal)
    1.  [Add a location to pull regional signal](#add-a-location-to-pull-regional-signal)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:artist \
  &signal.demographics.gender=male \
  &signal.demographics.age=25_to_29 \
  &signal.location.query=New York City \
  &take=10' \
  --header 'X-Api-Key: <<apiKey>>'
```

## Response example

```json
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

## Steps

### Pass demographic signal

`signal.demographics.age` takes an age range string such as 25_to_29. `signal.demographics.gender` accepts male or female. These pull regional popularity data for that demographic rather than individual behavioral data.

### Add a location to pull regional signal

`signal.location.query` ties the demographic signal to a geography. A 25 to 29 year old male in Manhattan produces different results than the same demographic in Austin. Qloo uses local cultural context to weight results.

### Handle the response

Once behavioral data becomes available, add `signal.interests.entities` alongside the demographic signal to blend individual and population-level preferences.

## See also

- [Personalize by age, gender, and location (no behavioral data needed) on docs.qloo.com](https://docs.qloo.com/recipes/personalize-by-age-gender-and-location-no-behavioral-data-needed), fetched 2026-10-16, page updated 2026-05-14
- [Insights API deep dive](insights-api-deep-dive.md)
