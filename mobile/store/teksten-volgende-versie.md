# Winkelteksten voor de versie met gebieden, plekken en Premium

Concept van 19-11-2026, **nog nergens geplaatst**. Hoort bij de eerste build
waarin de app gratis is en Premium de extra's ontgrendelt. Plaatsen pas met
die build en na akkoord van Chris.

Uitgangspunten (audit 19-11):
- Het gezicht van de app: blusvliegtuigen en reddingsboten, dat heeft geen
  officiële app.
- Rust: zelf kiezen hoe ver je per dienst kijkt, in plaats van een stroom
  meldingen.
- Aansluiten op AusAlert: dat bericht zegt dat er iets is, de app laat zien
  wat en waar. Nooit de indruk wekken dat de app bij AusAlert of een overheid
  hoort; de regel "Not a government app" blijft bovenaan staan.
- Geen namen van andere apps in tekst of trefwoorden.

## App Store (en-AU)

**Subtitle** (30): `Warnings, fires, floods, live`

**Promotional text** (170):
`Now free. See the warning area on the map and whether your place is inside it. Premium adds alerts for every incident, 5 extra places and the aircraft at a fire.`

**Keywords** (100):
`bushfire,flood,warning,alert,emergency,fire,storm,cyclone,cfa,rfs,ses,vic,nsw,qld,map,tanker,rescue`

**Description:**

Is my place inside the warning area? Emergencies Near Me shows every official warning as an area on the map, in the yellow, orange and red of the Australian Warning System, and tells you when your place is inside one.

Got an emergency alert on your phone? Open the app to see what is happening, where it is and how far from you.

FREE
• Warning areas on the map: Advice, Watch and Act and Emergency Warning
• "You are inside this warning area" for where you are or a place you pick
• Alerts for official warnings at your place
• Every incident the agencies publish, in a list and on the map: bushfires, floods, storms, road crashes and hazmat
• Water bombers, rescue helicopters and rescue boats on the map
• Victoria, New South Wales, Queensland, South Australia and the ACT in one app

PREMIUM
• An alert for every incident near you, often before there is an official warning
• Watch 5 extra places in any state: home, the beach house, your parents
• Follow the aircraft: which water bombers work a fire, their flights of the past week, and an alert when a large air tanker takes off
• Your own distance per service: bushfires from 100 km, road crashes only within 10. Fewer alerts, and none you did not want
• Emergency Warnings anywhere in Australia

Premium is a yearly subscription with a free trial. Payment goes through your Apple Account, and the subscription renews every year unless you cancel at least 24 hours before the end of the period. Manage or cancel it in your Apple Account settings.

Not a government app: Emergencies Near Me is an independent app. It does not represent any government, government agency or emergency service, and is not affiliated with or endorsed by them. Incident information can be delayed or incomplete. In an emergency, call 000. Always follow the advice of official emergency services.

Coverage depends on what each state publishes. Ambulance calls are only published in the ACT, and police incidents are not published.

Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://emergenciesnearme.online/privacy

**Abonnement in App Store Connect** (`premium_year`)
- Display name: `Emergencies Near Me Premium`
- Description (55): `Every incident, 5 extra places, aircraft and boats`

**Notitie voor App Review** (aanvullen bij indienen):
`The app is now free to use. The subscription unlocks optional features (Settings > Emergencies Near Me Premium). The Premium screen opens once after the introduction and can be closed with "Not now".`

## Google Play (en-AU)

**Short description** (80): `See the warning area on the map, and whether your place is inside it.`

**Full description:** dezelfde tekst als de App Store hierboven, met deze verschillen:
- het blok PREMIUM en de alinea over betalen weglaten zolang Android geen aankopen heeft (nu is daar alles ontgrendeld);
- de regel over meldingen alleen opnemen als de build push heeft (vanaf build 12);
- het blok "Sources" met de vijf .gov.au-links uit `play/beschrijving-en-AU-productie.txt` onderaan laten staan: dat eiste Google op 26-10.

## Screenshots (volgorde)
1. Warning area op de kaart, met "You are inside this Watch and Act area"
2. Aircraft at the fire
3. Rescue boats on the water
4. Places you watch (Premium)
5. Your own distance per service
