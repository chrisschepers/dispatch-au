# App Review: Emergencies Near Me

20 oktober 2026. Wat er bij de eerdere apps misging, en hoe we het hier voorkomen. Afvinken vóór elke inzending.

## Lessen uit eerdere afwijzingen

| App, datum | Richtlijn | Wat er misging | Hier geregeld |
|---|---|---|---|
| 112 Meldingen, 22-08 | 5.1.2(i) | Privacylabel zei "tracking", maar de app vroeg geen ATT-toestemming | Geen advertenties en geen tracking. Privacylabel: **Data Not Used to Track You** |
| 112 Meldingen, 24-08; P2000, 15-07 | 2.1(b) | Abonnement niet meegestuurd met de build | Abonnement `premium_year` mét review-screenshot in **dezelfde** inzending als de versie |
| 112 Meldingen, 25-08; P2000, 21-07 | Automatisch (EULA) | Geen link naar de Terms of Use in de App Store-beschrijving | Link staat onderaan de beschrijving hieronder |
| P2000, 25-07 | 3.1.2(c) | In de app geen titel, looptijd, prijs en links naar voorwaarden en privacy | Betaalmuur toont prijs, "Emergencies Near Me Premium · yearly subscription", Terms of Use en Privacy |
| UV Sun Index, 02-07 | 5.1.1(iv) | Scherm vóór de toestemmingsvraag had "Not now" | Locatie- en meldingsstap: alleen "Continue", geen terugknop; de knop leidt altijd naar de systeemvraag |
| UV Sun Index, 03-07 | 1.4.1 | Medische info zonder bronnen | Elk incident noemt de bron (agency) en linkt naar het officiële advies |
| P2000, 01-10 | Leeftijd (automatisch) | Advertenties in de app, maar Advertising = No | Geen advertentie-SDK in deze app: Advertising = **No** |
| P2000, 02-10 | 2.3.10 | Android genoemd in "Wat is er nieuw" | iOS-teksten noemen nooit Android of Google Play |

Verder: Apple test op een **iPad**. De app is iPhone-only (`supportsTablet: false`) en draait daar in compatibiliteitsmodus. Een reviewer zit **niet in Australië**: buiten Australië toont de app Melbourne, met de kop "Outside Australia, showing Melbourne".

## Vóór het indienen

- [ ] Abonnement `premium_year` (A$9,99 per jaar, 3 dagen gratis) staat op *Ready to Submit*, met review-screenshot (de betaalmuur), en zit in dezelfde inzending als de build
- [ ] RevenueCat: entitlement `premium`, offering `default` met het jaarpakket; publieke `appl_`-sleutel in `mobile/src/aankopen.ts`
- [ ] RevenueCat-paywall (als die er is): links naar Terms of Use en Privacy aan in de footer
- [ ] Privacy Policy URL: `https://emergenciesnearme.online/privacy`
- [ ] Support URL: `https://emergenciesnearme.online/support`
- [ ] Marketing URL: `https://emergenciesnearme.online`
- [ ] Leeftijdsclassificatie: alles No/None, Advertising No → 4+
- [ ] Privacylabel (zie hieronder)
- [ ] Review-notes (zie hieronder), sandbox-account niet nodig: geen login
- [ ] Screenshots 6,9" (1290×2796): `mobile/store/screenshots/out`
- [ ] Geen Android of Google Play in beschrijving, "Wat is er nieuw" of screenshots

## Privacylabel (App Privacy)

Tracking: **No**. Verzameld, niet gekoppeld aan identiteit, niet voor tracking:

- **Location → Precise Location**: App Functionality (meldingen binnen je straal)
- **Identifiers → Device ID**: App Functionality (een willekeurige installatie-ID voor de meldingsinstellingen)
- **Purchases → Purchase History**: App Functionality (RevenueCat controleert het abonnement)
- **Diagnostics**: niet verzameld

## Beschrijving (en-AU)

> Know what is happening near you, live. Emergencies Near Me shows bushfires, floods, road crashes, storms, hazmat incidents and ambulance calls published by Australian emergency services, on one map and in one list, with an alert when something happens within your radius.
>
> • Live map of current incidents, updated every minute
> • Nearby list with distance, status and warning level
> • Alerts for your area, with a radius per service: for example bushfires 100 km and road crashes 10 km
> • Advice, Watch and Act and Emergency Warning levels, as issued by the agencies
> • Victoria, New South Wales, Queensland, South Australia and the ACT in one app
> • Incident details: agency, status, resources, directions and a link to the official advice
>
> Emergencies Near Me is independent and not affiliated with any government or emergency service. In an emergency, call 000. Always follow the advice of official emergency services.
>
> Subscription: Emergencies Near Me Premium is a yearly auto-renewable subscription with a free trial for eligible new subscribers. Payment is charged to your Apple Account at the end of the trial. The subscription renews automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel it in your Apple Account settings.
>
> Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
> Privacy Policy: https://emergenciesnearme.online/privacy

## Review-notes

> Emergencies Near Me shows public incident data from Australian state emergency services (VicEmergency, NSW Rural Fire Service, Queensland Fire Department, SA Country Fire Service, ACT Emergency Services Agency). These are open data feeds published for public use; each incident shows its source and links to the official advice. The app is independent and states this in the app and on the website.
>
> Testing outside Australia: when the device location is outside Australia, the app shows incidents around Melbourne and says "Outside Australia, showing Melbourne" at the top of the Nearby list. You can also choose any Australian suburb in Settings > Location.
>
> Subscription: after the intro, the app shows the paywall with a 3-day free trial of the yearly subscription "Emergencies Near Me Premium". Restore purchase, Terms of Use and Privacy are on that screen.
>
> Alerts: allow notifications in the intro. Alerts are sent for new incidents within your radius, so outside Australia you may not receive one during review. No login is required.
