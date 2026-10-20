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
<p class="d">Emergencies Near Me · last updated 20 October 2026</p>

<p>Emergencies Near Me shows emergency incidents published by Australian
emergency services and can alert you about incidents near you. We collect as
little as possible: no account, no name, no email address, no advertising and
no tracking across apps.</p>

<h2>What we store</h2>
<ul>
<li><b>A random device ID and an installation token</b>, created by the app, so
your alert settings belong to your device.</li>
<li><b>Your push token</b> (from Apple), only when you turn on alerts, so we can
send them.</li>
<li><b>Your alert location</b>: the place you chose, or your current location
while the app is open. We use it only to decide which incidents are within
your radius. The app never tracks your location in the background.</li>
<li><b>Your alert settings</b>: radius, services, warning levels and sound.</li>
<li><b>App version and platform</b>, to fix problems.</li>
</ul>

<h2>What we do not do</h2>
<p>We do not sell or share your data, do not build a location history and do
not use it for advertising. Location is stored as a single point that is
overwritten when it changes.</p>

<h2>Subscriptions</h2>
<p>Payments are handled by Apple. We use RevenueCat to check whether your
subscription is active; it receives an anonymous app user ID and your
purchase receipts, not your name or payment details. See
<a href="https://www.revenuecat.com/privacy">RevenueCat's privacy policy</a>.</p>

<h2>Incident data</h2>
<p>Incidents come from public feeds of Australian state emergency services.
Always follow the advice of official emergency services and call 000 in an
emergency.</p>

<h2>Deleting your data</h2>
<p>Turning off alerts and Emergency Warnings anywhere stops all pushes; deleting the app removes the device
ID from your phone, and its push token is removed from our server once Apple
reports it invalid. To have everything removed right away, email us.</p>

<h2>Contact</h2>
<p>Chris Schepers · <a href="mailto:chrisschepers22@gmail.com">chrisschepers22@gmail.com</a></p>
</body></html>`;
