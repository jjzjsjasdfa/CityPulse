# Activity links

The address in the detail sheet opens a Google Maps HTTPS URL using the event's
coordinates. Google Maps handles opening its installed app, with a browser fallback.

Share activity sends the activity title, time, venue, and a link such as
`citypulse://event/demo-market`. The existing `scheme` in app.json registers this
scheme in native builds. App.tsx handles both cold-start and already-running links.
Local demo IDs work without the API; other IDs require the configured API.

Verify on an installed development or release build, not Expo Go:

1. Open an activity, tap its address, and confirm the map location.
2. Share the activity through the system share sheet.
3. Open the shared link with CityPulse closed, then repeat while it is running.
4. Confirm both cases open the matching activity detail.

Custom schemes are not made clickable by every messaging app, and require CityPulse
to be installed. Public HTTPS Universal Links / Android App Links require a hosted
domain and platform association files; these are not configured in this project.
Browsers without Web Share show a selectable link for manual copying.
