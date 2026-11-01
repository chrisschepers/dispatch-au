// Privacy policy for the Emergencies Near Me app, served at /privacy. Apple
// requires a public policy for an app with a subscription; the paywall and
// App Store Connect link here.
export const PRIVACY_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy · Emergencies Near Me</title>
<style>
body{font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:680px;margin:0 auto;padding:32px 20px 64px;color:#1c1c1e;background:#fff}
h1{font-size:28px;margin:0 0 4px}h2{font-size:19px;margin:28px 0 6px}p,li{color:#3a3a3c}.d{color:#8e8e93;font-size:14px}
@media (prefers-color-scheme:dark){body{background:#000;color:#f2f2f7}p,li{color:#c7c7cc}}
</style></head><body>
<h1>Privacy policy</h1>
<p class="d">Emergencies Near Me · last updated 1 November 2026</p>

<p>Emergencies Near Me shows emergency incidents published by Australian
emergency services and can alert you about incidents near you. We collect as
little as possible: no account, no name, no email address, no advertising and
no tracking across apps.</p>

<h2>What we store</h2>
<ul>
<li><b>A random device ID</b>, created by the app, and <b>an installation
token</b> that our server gives your device (we keep only a scrambled hash of
it), so your settings belong to your device.</li>
<li><b>Your push token</b> (from Apple or Google), only when you turn on
alerts, so we can send them.</li>
<li><b>Your alert location</b>: the place you chose, or your current location
while the app is open. The app sends it when you open the app or change a
setting, also while alerts are off, so alerts work as soon as you turn them
on. We use it only to decide which incidents are within your radius. The app
never tracks your location in the background.</li>
<li><b>Your alert settings</b>: radius, services, warning levels and sound.</li>
<li><b>App version and platform</b>, to fix problems.</li>
</ul>

<h2>What we do not do</h2>
<p>We do not sell your data or share it for advertising, and we do not build
a location history. Location is stored as a single point that is
overwritten when it changes.</p>

<h2>Subscriptions</h2>
<p>Payments are handled by Apple or Google. We use RevenueCat to check whether your
subscription is active; it receives an anonymous app user ID and your
purchase receipts, not your name or payment details. See
<a href="https://www.revenuecat.com/privacy">RevenueCat's privacy policy</a>.</p>

<h2>Other services</h2>
<p>The app talks to our own server and, for a few features, to these
services. Each has its own privacy policy.</p>
<ul>
<li><b>Our server</b> is hosted by Railway, which stores the data listed
above for us. See <a href="https://railway.com/legal/privacy">Railway's privacy policy</a>.</li>
<li><b>Maps</b>: on iPhone the map and Look Around images come from Apple
Maps, on Android the map comes from Google Maps. They receive the map area you
look at. See <a href="https://www.apple.com/legal/privacy/">Apple's</a> and
<a href="https://policies.google.com/privacy">Google's</a> privacy policies.</li>
<li><b>Place search</b>: when you type a place name, the text you type is sent
to OpenStreetMap Nominatim to find matching places. Your location is not sent
with it.
See the <a href="https://osmfoundation.org/wiki/Privacy_Policy">OpenStreetMap
Foundation's privacy policy</a>.</li>
<li><b>Alerts</b> are delivered by Apple on iPhone and by Google Firebase
Cloud Messaging on Android, once alerts are available there; some early test
versions used Expo's push service. They receive your push token and the alert
itself: the incident, its place and how far it is from your alert
location.</li>
<li><b>Links</b> to directions, Street View or an emergency service's website
open in your maps app or browser, only when you tap them.</li>
</ul>
<p>The app has no analytics or crash-reporting tools. Apple and Google may
share anonymous crash reports with us if you allowed that in your phone's
settings. Our website loads its font from Google Fonts.</p>
<p>As with any internet service, our host and the services above see your IP
address when your device connects. Our own server does not store it; our host
may keep it briefly in its technical logs.</p>

<h2>Incident data</h2>
<p>Incidents come from public feeds of Australian state emergency services.
Our server fetches them; the app gets them only from our server.
Always follow the advice of official emergency services and call 000 in an
emergency.</p>

<h2>How long we keep it</h2>
<p>Your device record (device ID, alert location, settings, app version and
platform) is created when you first open the app and kept until you ask us to
delete it; there is no automatic expiry. Your push
token is removed once Apple or Google reports it invalid, for example after
you delete the app. The list of alerts sent to your device, used to avoid sending the same
alert twice, is deleted after 7 days.</p>

<h2>Deleting your data</h2>
<p>Turning off alerts and Emergency Warnings anywhere stops all pushes; deleting the app removes the device
ID from your phone, and its push token is removed from our server once Apple
or Google reports it invalid. To have everything removed right away, email us.</p>

<h2>Contact</h2>
<p>Chris Schepers · <a href="mailto:chrisschepers22@gmail.com">chrisschepers22@gmail.com</a></p>
</body></html>`;
