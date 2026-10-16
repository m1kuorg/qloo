---
updatedAt: 2025-05-14T18:49:05.000Z
---

# API Onboarding and Authentication

Welcome to the [Insights API](https://docs.qloo.com/docs/insights-api)! With our powerful API, you can take advantage of advanced AI-driven recommendations and insights. This guide will help you get up and running quickly by walking you through authentication, making your first API call, and exploring key features.

# Accessing the API

## Get an API Key

To get started, you'll need an API key. Simply [contact us](support@qloo.com), and we'll generate one for you.

## Authentication

Once you have your API key, authenticate your requests by including it in the request headers.

```curl
curl --location --request GET 'https://staging.api.qloo.com/v2/insights?query=audi' \
--header 'Content-Type: application/json' \
--header 'X-Api-Key: <your-api-key>'
```

```javascript
const fetch = require('node-fetch')

const config = {
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': process.env.API_KEY
  }
}

fetch('https://staging.api.qloo.com/v2/insights?query=audi', config)
  .then((r) => r.json())
  .then(console.log)
```

```python
import os
import requests

url = 'https://staging.api.qloo.com/v2/insights?query=audi'
headers = {'X-Api-Key': os.environ['API_KEY']}
r = requests.get(url, headers=headers)
print(r.json())
```

# Making Your First API Call

Now that you're set up, you can make your first request. Here’s a request example that returns a list of movies tagged as comedies. It includes:

- The API request URL
- An entity type filter indicating the results should only include movies
- A filter narrowing results to entities tagged with "comedy"
- Your API key for authentication

```curl Basic Insights Request Example
curl --location 'https://staging.api.qloo.com/v2/insights/?filter.type=urn:entity:movie&filter.tags=urn:tag:genre:media:comedy' \
--header 'x-api-key: x-api-key'
```

To dig deeper into a basic Insights request, explore our basic request [use case](https://docs.qloo.com/reference/basic-insights-use-case).

## Handling Responses

After making a request, you’ll receive a response like this:

```json Basic Insights Response Example
{
    "success": true,
    "results": {
        "entities": [
            {
                "name": "Django Unchained",
                "entity_id": "369D1544-628B-4C21-95A0-1488117A308A",
                "type": "urn:entity",
                "subtype": "urn:entity:movie",
                "properties": {
                    "release_year": 2012,
                    "release_date": "2012-12-25",
                    "description": "With the help of a German bounty-hunter, a freed slave sets out to rescue his wife from a brutal plantation owner in Mississippi.",
                    "content_rating": "R",
                    "duration": 165,
                    "image": {
                        "url": "https://staging.images.qloo.com/i/369D1544-628B-4C21-95A0-1488117A308A-420x-outside.jpg"
                    },
                    "akas": [
                        {
                            "value": "Django Unchained",
                            "languages": [
                                "fy"
                            ]
                        },
                        {
                            "value": "被解放的姜戈",
                            "languages": [
                                "zh"
                            ]
                        },
                        {
                            "value": "Джанго освобождённый",
                            "languages": [
                                "ru"
                            ]
                        },
. . .
 ],
                    "filming_location": "Evergreen Plantation - 4677 Highway 18, Edgard, Louisiana, USA",
                    "production_companies": [
                        "The Weinstein Company",
                        "Columbia Pictures"
                    ],
                    "release_country": [
                        "United States"
                    ],
                    "short_descriptions": [
                        {
                            "value": "filme de 2012 realizado por Quentin Tarantino",
                            "languages": [
                                "pt"
                            ]
                        },
                        {
                            "value": "அமெரிக்க மேற்கத்திய திரைப்படம்",
                            "languages": [
                                "ta"
                            ]
                        },
. . .
                    "popularity": 0.9998529346882951,
                    "tags": [
                    {
                        "id": "urn:tag:keyword:media:ex_slave",
                        "name": "Ex Slave",
                        "type": "urn:tag:keyword:media"
                    },
                    {
                        "id": "urn:tag:streaming_service:media:universcine",
                        "name": "Universcine",
                        "type": "urn:tag:streaming_service:media"
                    },
                    {
                        "id": "urn:tag:keyword:media:historical_fiction",
                        "name": "Historical Fiction",
                        "type": "urn:tag:keyword:media"
                    },
                    {
                        "id": "urn:tag:streaming_service:media:paramount_roku_premium_channel",
                        "name": "Paramount+ Roku Premium Channel",
                        "type": "urn:tag:streaming_service:media"
                    },
                    {
                        "id": "urn:tag:streaming_service:media:apple_tv",
                        "name": "Apple Tv",
                        "type": "urn:tag:streaming_service:media"
                    },
                    {
                        "id": "urn:tag:streaming_service:media:magentatv",
                        "name": "Magentatv",
                        "type": "urn:tag:streaming_service:media"
                    },
                    {
                        "id": "urn:tag:keyword:media:pre_civil_war",
                        "name": "Pre Civil War",
                        "type": "urn:tag:keyword:media"
                    },
                    {
                        "id": "urn:tag:streaming_service:media:movistar_plus",
                        "name": "Movistar Plus",
                        "type": "urn:tag:streaming_service:media"
                    },
                    {
. . .
               {
                "name": "Guardians of the Galaxy",
                "entity_id": "02F3FF8C-74F3-4188-A39D-24B34BEF3401",
                "type": "urn:entity",
                "subtype": "urn:entity:movie",
                "properties": {
                    "release_year": 2014,
                    "release_date": "2014-08-01",
                    "description": "A group of intergalactic criminals must pull together to stop a fanatical warrior with plans to purge the universe.",
                    "content_rating": "PG-13",
                    "duration": 121,
                    "image": {
                        "url": "https://staging.images.qloo.com/i/02F3FF8C-74F3-4188-A39D-24B34BEF3401-420x-outside.jpg"
                    },
                    "akas": [
                        {
                            "value": "Пазители на Галактиката",
                            "languages": [
                                "bg"
                            ]
                        },
                        {
                            "value": "Галактика сақшылары",
                            "languages": [
                                "kk"
                            ]
                        },
                        {
                            "value": "Galaktikas sargi",
                            "languages": [
                                "lv"
                            ]
                        },
. . .
                    ],
                    "filming_location": "Longcross Studios, Chobham Lane, Longcross, Chertsey, Surrey, England, UK",
                    "production_companies": [
                        "Moving Pictures Company",
                        "Walt Disney Pictures",
                        "Marvel Studios"
                    ],
                    "release_country": [
                        "United States",
                        "United Kingdom"
                    ],
                    "short_descriptions": [
                        {
                            "value": "2014 елның фильмы",
                            "languages": [
                                "tt"
                            ]
                        },
                        {
                            "value": "סרט מדע בדיוני מבית מארוול",
                            "languages": [
                                "he"
                            ]
                        },
                     ],
                    "websites": [
                        "http://www.facebook.com/guardiansmovie",
                        "https://www.instagram.com/guardiansofthegalaxy/"
                    ]
                },
                "popularity": 0.9996176301895672,
                "tags": [
                    {
                        "id": "urn:tag:streaming_service:media:directv",
                        "name": "Directv",
                        "type": "urn:tag:streaming_service:media"
                    },
                    {
                        "id": "urn:tag:keyword:media:raccoon",
                        "name": "Raccoon",
                        "type": "urn:tag:keyword:media"
                    },
                    {
                        "id": "urn:tag:keyword:media:ronan_accuser_character",
                        "name": "Ronan The Accuser Character",
                        "type": "urn:tag:keyword:media"
                    },
                    {
                        "id": "urn:tag:streaming_service:media:mediaset_infinity",
                        "name": "Mediaset Infinity",
                        "type": "urn:tag:streaming_service:media"
                    },
. . .
        ]
    },
    "duration": 22
}
```

The response contains details about the entities that match your request.

# Key Features of the API

- **Flexible Input and Output**: Seamlessly processes a wide range of data types—entities, tags, demographics, audiences, and location—allowing you to input and receive highly relevant results across the same categories.
- **Extensive Filtering and Customization**: With a broad range of filters and signal parameters, you can fine-tune your queries to ensure the results are precisely tailored to your needs. Whether you're focusing on specific genres, demographics, or locations, the Insights API offers the flexibility you need.
- **Versatile Applications**: Suitable for live personalization, CRM optimization, product development, media buying, and more.

# Common Use Cases

The Insights API is versatile and can be applied across a wide range of [use cases](https://docs.qloo.com/reference/use-cases). It gives you the tools to unlock powerful insights into user preferences and behaviors.
