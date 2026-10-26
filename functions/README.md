# Strautomator Functions

These are Strautomator's functions that should be set to run on a scheduled basis, and depend on the [Strautomator Core](https://github.com/strautomator/core) to work. Some of these functions are required for core features to work (ie. GearWear mileage tracking, FTP auto-updating, etc), while others are optional (Strava cache cleanup, User subscription checks, etc).

They run in production via Google Cloud Functions + Cloud Scheduler, but should work just fine with other setups and environments as well.

The index.js file contain a sample of routines that should be executed on a daily, weekly and monthly basis.

## Local testing

Before you try to testing these functions locally, make sure you have followed the [Getting started](https://github.com/strautomator/core#getting-started) instructions to have all the required 3rd party dependencies ready.

## Deploying to production

The recommended setup is deploying these functions privately to Google Cloud Functions, and using Google Cloud Scheduler to trigger them on the desired schedule. You can use the [cloudbuild.yaml](https://github.com/strautomator/functions/blob/master/cloudbuild.yaml.sample) sample file as a reference.
