# Recommend places using an audience segment as signal

A Qloo API example from the docs.qloo.com recipes: a request, a sample response, and notes on each part of the request.

Contents:

1.  [Request](#request)
1.  [Response example](#response-example)
1.  [Steps](#steps)
    1.  [Pass an audience URN as signal](#pass-an-audience-urn-as-signal)
    1.  [Combine with tag and location filters](#combine-with-tag-and-location-filters)
    1.  [Handle the response](#handle-the-response)
1.  [See also](#see-also)

## Request

```shell
curl --request GET \
  --url 'https://api.qloo.com/v2/insights/?filter.type=urn:entity:place \
  &signal.demographics.audiences=urn:audience:hobbies_and_interests:outdoors \
  &filter.tags=urn:tag:genre:place:hotel \
  &filter.location.query=Denver \
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
        "name": "Gaylord Rockies Resort",
        "entity_id": "...",
        "type": "urn:entity",
        "subtype": "urn:entity:place",
        "query": {
          "affinity": 0.93
        }
      }
    ]
  }
}
```

## Steps

### Pass an audience URN as signal

`signal.demographics.audiences` accepts the URN form, not the UUID. Find audience URNs by searching `/v2/audiences` first.

### Combine with tag and location filters

Audience signal works alongside any other filter. This example surfaces hotels in Denver that match the outdoor enthusiast audience.

### Handle the response

Standard insights response with entities ranked by affinity to the audience profile.

## See also

- [Recommend places using an audience segment as signal on docs.qloo.com](https://docs.qloo.com/recipes/recommend-places-using-an-audience-segment-as-signal), fetched 2026-10-16, page updated 2026-05-14
- [Insights API deep dive](insights-api-deep-dive.md)
