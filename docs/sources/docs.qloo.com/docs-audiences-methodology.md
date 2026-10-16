---
updatedAt: 2025-05-14T18:48:41.000Z
---

# Audiences Methodology

Audiences are collections of valid <Glossary>signals</Glossary> accumulated through client interactions with our API. An example of an audience type is "LGBTQ". They represent the <Glossary>signal arrays</Glossary> that Qloo ingests for a specific <Glossary>entity</Glossary>.

To define an audience, we collect and analyze valid positive signals relevant to the entity. These signals may include actions like following an Instagram account, liking a related post, or sharing a tweet.

# Methodology

We start by extracting all signal arrays (Signal Array 1, Signal Array 2, Signal Array x in the figure below) that include the entity. These arrays are translated into vectors representing different taste signals (Taste Signal 1, Taste Signal 2, Taste Signal x). These taste signals go through our taste analysis process to determine the total audience.

## Signal Analysis

Analyzing these signals helps identify common themes and patterns, defining the audience. Audiences can also be categorized by metadata, such as genre <Glossary>tags</Glossary> (e.g., Jazz), or by <Glossary>geohash</Glossary> to understand regional tastes. By examining these audiences, we can compare the signal arrays of different <Glossary>entities</Glossary>, metadata, or regions. Additionally, tracking the velocity of signal accumulation helps us understand audience trends over time, allowing us to adjust recommendations based on these trends.

<Image alt="Diagram conveying how Audience Taste is determined" align="center" src="https://files.readme.io/24487ed-image.png">
  Diagram conveying how Audience Taste is determined
</Image>
