# Audiences methodology

Audiences are collections of valid signals accumulated through client interactions with our API. An example of an audience type is "LGBTQ". They represent the signal arrays that Qloo ingests for a specific entity.

Contents:

1.  [Defining an audience](#defining-an-audience)
1.  [Methodology](#methodology)
    1.  [Signal analysis](#signal-analysis)
1.  [See also](#see-also)

## Defining an audience

To define an audience, we collect and analyze valid positive signals relevant to the entity. These signals may include actions like following an Instagram account, liking a related post, or sharing a tweet.

## Methodology

We start by extracting all signal arrays (Signal Array 1, Signal Array 2, Signal Array x in the figure below) that include the entity. These arrays are translated into vectors representing different taste signals (Taste Signal 1, Taste Signal 2, Taste Signal x). These taste signals go through our taste analysis process to determine the total audience.

### Signal analysis

Analyzing these signals helps identify common themes and patterns, defining the audience. Audiences can also be categorized by metadata, such as genre tags (e.g., Jazz), or by geohash to understand regional tastes. By examining these audiences, we can compare the signal arrays of different entities, metadata, or regions. Additionally, tracking the velocity of signal accumulation helps us understand audience trends over time, allowing us to adjust recommendations based on these trends.

## See also

- [Audiences methodology on docs.qloo.com](https://docs.qloo.com/docs/audiences-methodology), fetched 2026-10-16, page updated 2025-05-14
- [Audiences](audiences.md)
- [Signal](signal.md)
