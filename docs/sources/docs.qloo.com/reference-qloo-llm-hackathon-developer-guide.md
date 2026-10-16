---
updatedAt: 2026-10-07T15:04:50.000Z
---

# Qloo Agentic Hackathon Developer Guide

This page is a reference guide for hackathon participants. Resolve common questions and pitfalls quickly.

<Callout icon="👍" theme="okay">
  ### **Not signed up yet?**

Join the hackathon <Anchor target="_blank" href="https://qloo.devpost.com/">here</Anchor>.
</Callout>

# Getting Your API Key

Submit the <Anchor target="_blank" href="https://forms.gle/zz12orkLHTAneLGz6">API key request form</Anchor> to register for hackathon access. Once approved, you'll receive a personal API key by email. Keys are typically issued within a few business days.

**If you haven't received your key, check your spam or junk folder; keys often end up there.**

Your key is valid only against the hackathon base URL:

```
https://hackathon.api.qloo.com
```

Hackathon API keys **do not work** against:

- Staging: `https://staging.api.qloo.com`
- Production: `https://api.qloo.com`

If you copied a curl example from the docs, replace the base URL before running it. Using the wrong base URL is the most common cause of 401 errors.

---

# API Basics & Supported Features

## Available Endpoints

During the hackathon, all [Qloo API endpoints](https://docs.qloo.com/reference/api-overview) are available. The Insights API is the primary way to generate recommendations and insights. Always use the documented Qloo [endpoints](https://docs.qloo.com/reference/api-overview) and [parameters](https://docs.qloo.com/reference/parameters). Unsupported endpoints or parameters will not work.

- [Insights API Deep Dive](https://docs.qloo.com/reference/insights-api-deep-dive): Main endpoint for insights and recommendations.
- [Supporting APIs](https://docs.qloo.com/reference/api-overview#supporting-apis): Lookup and analysis endpoints to validate parameters and explore tags.
- [Entity Data APIs](https://docs.qloo.com/reference/api-overview#entity-data-apis): Search and retrieve detailed entity-level data to use as inputs or for analysis.

<Callout icon="⚠️" theme="warn">
  ### Do not use `/recommendations` or `/recs`. These are legacy endpoints and are not supported for the hackathon.
</Callout>

## Supported Parameters

The parameters you can include in an [Insights](https://docs.qloo.com/reference/insights-api-deep-dive) request depend on the selected `filter.type` value. Each supported entity category has its own applicable signals and filters.

To get started, use the [Parameter Overview](https://docs.qloo.com/reference/parameter-overview) to understand how to choose and structure parameters effectively. This guide also explains how to use the two reference resources below together:

- [Parameter Reference](https://docs.qloo.com/reference/parameters): Full descriptions and formats for every available parameter.
- [Entity Type Parameter Guide](https://docs.qloo.com/reference/available-parameters-by-entity-type): Lists which parameters are supported for each `filter.type`.

Use only documented Qloo parameters. Custom, unsupported, or deprecated parameters will not work, and invalid parameters are silently ignored rather than returning an error. If you are getting empty results with no error, verify your parameters against the [Entity Type Parameter Guide](https://docs.qloo.com/reference/available-parameters-by-entity-type) before assuming a data issue.

## Supported Entity Types

### Insights API

Every request to the [Insights API](https://docs.qloo.com/reference/insights-api-deep-dive) must include `filter.type` to specify the entity category. Supported values are:

- `urn:entity:artist`
- `urn:entity:book`
- `urn:entity:brand`
- `urn:entity:destination`
- `urn:entity:movie`
- `urn:entity:person`
- `urn:entity:place`
- `urn:entity:podcast`
- `urn:entity:tv_show`
- `urn:entity:video_game`

If you receive a 403 error for an entity type, that type is not supported. Common mistakes:

- Music: use `urn:entity:artist`, not `urn:entity:music`
- Food and beverage places: use `urn:entity:place` or `urn:entity:brand`, not `urn:entity:food_and_drink`

### Entity Search API

The supported types for `/search` are not the same as `filter.type` in `/v2/insights`. Check the [`/search` documentation](https://docs.qloo.com/reference/get-search) and its `types` parameter for the full list of accepted values.

---

# Insights & Recommendations Quick Start

To use the Insights API effectively, you need valid signals and filters, which usually come from other supporting endpoints. Here is the recommended flow:

1. Use [`/search`](https://docs.qloo.com/reference/get-search) to look up Qloo entity IDs by name (e.g., for a movie, artist, or restaurant). Or use [`/v2/tags`](https://docs.qloo.com/reference/get-tags-1) to find valid tag IDs for interests, cuisines, or genres.

2. Once you have IDs, pass them as signal or filter [parameters](https://docs.qloo.com/reference/parameters) (e.g., `signal.interests.entities`, `signal.interests.tags`, `signal.demographics.audiences`, `filter.tags`) in your `/v2/insights` request. Confirm the parameters you include are valid for your selected `filter.type` using the [Entity Type Parameter Guide](https://docs.qloo.com/reference/available-parameters-by-entity-type).

> **Note:** `/search` and `/v2/insights` are separate endpoints with different purposes. Do not combine them into a single path (e.g., `/v2/insights/search` is not a valid endpoint).

---

# Common Issues and How to Fix Them

## Wrong Base URL

**Error:** _401 Unauthorized_

Hackathon API keys only work against `https://hackathon.api.qloo.com`. Using the staging or production URL with a hackathon key will always return 401, even if the key itself is valid.

```
# Correct
https://hackathon.api.qloo.com/v2/insights?…

# Incorrect
https://staging.api.qloo.com/v2/insights?…
https://api.qloo.com/v2/insights?…
```

## Missing Endpoint Path

**Error:** _404 or no response_

The base URL alone is not a valid endpoint. Always append a path.

```
# Correct
https://hackathon.api.qloo.com/v2/insights?…

# Incorrect
https://hackathon.api.qloo.com?…
```

## Wrong HTTP Method

**Error:** _"No path matching request parameters"_ or unexpected 404

`/v2/insights` is a GET request. Parameters go in the query string, not a JSON body. Sending a POST request with a JSON body will fail even if your parameters are otherwise correct.

```
# Correct
GET https://hackathon.api.qloo.com/v2/insights?filter.type=urn:entity:movie&signal.interests.entities=<entity_id>

# Incorrect
POST https://hackathon.api.qloo.com/v2/insights
{ "filter": { "type": "urn:entity:movie" } }
```

## Wrong API Key Header

**Error:** _401 "No API key found in request"_

Pass your API key in the `X-Api-Key` request header. Do not pass it as a query parameter or as a Bearer token.

```bash
# Correct
curl -H "X-Api-Key: YOUR_API_KEY" \
  "https://hackathon.api.qloo.com/v2/insights?filter.type=urn:entity:movie"

# Incorrect
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://hackathon.api.qloo.com/v2/insights?filter.type=urn:entity:movie"
```

In Python:

```python
import requests

headers = {"X-Api-Key": "YOUR_API_KEY"}
params = {"filter.type": "urn:entity:movie"}

response = requests.get(
    "https://hackathon.api.qloo.com/v2/insights",
    headers=headers,
    params=params
)
print(response.json())
```

## Invalid or Unsupported Entity Type

**Error:** _403 "You do not have permission to access urn:entity:..."_

The entity type you are using is not supported. Check the list of supported entity types above and use the closest supported alternative.

## Invalid Tags or Audiences

**Error:** _"at least one valid signal or filter is required"_

Parameters like `filter.tags` and `signal.interests.tags` require valid tag IDs from Qloo's system, not freeform strings. Use the [`/v2/tags`](https://docs.qloo.com/reference/get-tags-1) endpoint to search for tags and retrieve their IDs before using them in an Insights request.

The same applies to `signal.demographics.audiences`, which requires valid audience URN values. See the FAQ below for the list of valid values.

## Empty Results (200 OK, No Entities)

**Error:** _200 response with an empty&#x20;_`entities`_&#x20;array_

This has two common causes:

1. **Invalid parameters for the selected&#x20;**`filter.type`**.** The API silently ignores parameters that are not valid for your entity type rather than returning an error. Check the [Entity Type Parameter Guide](https://docs.qloo.com/reference/available-parameters-by-entity-type) to confirm every parameter in your request is supported for your `filter.type`.

2. **No data for the queried entity or location.** The hackathon environment may not have data for every entity or region. Try a broader query or a different entity to confirm the API is responding correctly.

## Wrong Environment

**Error:** _401 Unauthorized_

Ensure you are using `hackathon.api.qloo.com` with your hackathon API key. See [Wrong Base URL](#wrong-base-url) above.

---

# Resources

- <Anchor target="_blank" href="https://qloo.devpost.com/">Hackathon Sign-Up</Anchor>
- <Anchor target="_blank" href="https://forms.gle/zz12orkLHTAneLGz6">API Key Request Form</Anchor>
- [Qloo API Documentation](https://docs.qloo.com/reference/api-overview)
- [Entity Type Parameter Guide](https://docs.qloo.com/reference/available-parameters-by-entity-type)
- [Tags Search API](https://docs.qloo.com/reference/get-tags-1)
- For additional help, join the [Qloo Hackathon Discord](https://discord.gg/rF9PKsD5Q7) and post in #api-help. We monitor it throughout the event.

---

# Quotas, Limits & Key Expiration

Hackathon API keys have rate and monthly quota limits set high enough to support typical hackathon projects. If you hit the monthly limit or need more headroom, post in [#api-help on Discord](https://discord.gg/rF9PKsD5Q7) with details about your project — limits can be raised on a per-user basis. Keys remain active through the end of the judging period and are deactivated after the hackathon closes.

---

# FAQs

## API Keys

### How long does it take to receive my API key?

Keys are provisioned manually, so please allow a few business days after submitting the form. If you haven't received one, check your spam or junk folder first. If it's been longer and there's nothing in spam, resubmit the form.

### Can I fill out the API key request form before I have a project idea?

Yes. You do not need a finalized idea to request a key. Leave the project idea field blank or describe a general direction.

## Data & Endpoints

### Do I need my own dataset?

No. Qloo provides all the data you need through the API.

### What endpoints are available for the hackathon?

All documented Qloo endpoints are available. For recommendations and insights, use `/v2/insights`. For entity lookup, use `/search`. Do not use `/recs` or `/recommendations` — these are legacy endpoints and are not supported.

### How do I know which parameters to use for a given `filter.type`?

Check the [Entity Type Parameter Guide](https://docs.qloo.com/reference/available-parameters-by-entity-type) to see which signals and filters are valid for your chosen entity type.

### Is there a full list of tags?

No static list is available. Use the [Tags Search API](https://docs.qloo.com/reference/get-tags-1) to find relevant tags by keyword.

## Using the API

### Can I filter the fields returned in a response?

No. The API returns the full response. Extract the fields you need on your side. Note that some responses include verbose fields like `akas` — there is no supported way to suppress specific fields via the API.

### Can I cache Qloo API responses in my app?

Private server-side caching is fine and there is no time limit on how long you can keep cached responses. Do not store Qloo response data in a public repository — that makes the data publicly accessible outside the terms of your API key.

### What is the difference between Insights API and Taste Analysis?

Taste Analysis is a specific way of using the Insights API — for example, [retrieving tag metadata](https://docs.qloo.com/reference/taste-analysis). The Insights API is the underlying endpoint. "Taste AI" is an older name for what is now called Taste Analysis.
