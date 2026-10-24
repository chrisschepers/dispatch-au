# Push-API voor de Dispatch-app (afspraak app ↔ backend)

19 oktober 2026. De app in `mobile/` is omgebouwd naar de opzet van 112 Meldingen: een lijst "Nearby" met straal per dienst, een kaart, een detailscherm en pushmeldingen. De lijst en de kaart werken nu al op `GET /v1/feed?region=au&hours=24|72|168`. Voor pushmeldingen heeft de backend de onderstaande endpoints nodig. Tot ze er zijn, zet de app push niet aan en meldt hij "Alerts are coming soon".

De app staat in `mobile/src/api.ts` (`registreerGebruiker`, `zetPushFilter`) en `mobile/src/push.ts`.

## 1. Toestel aanmelden

`POST /v1/devices/register`

```json
{ "deviceId": "dispatch-…", "pushToken": "ExponentPushToken[…]", "lat": -37.81, "lon": 144.96, "appVersion": "0.2.0", "appBuild": 7 }
```

- `pushToken` mag leeg zijn: de app meldt zich ook aan zonder push, om installaties te tellen.
- `lat`/`lon` ontbreken als de app de plek niet weet. Dan de bestaande plek laten staan.
- Idempotent op `deviceId`: hetzelfde toestel krijgt dezelfde gebruiker terug.

Antwoord `200`:

```json
{ "data": { "id": "uuid", "installationToken": "geheim, alleen bij de eerste aanmelding" } }
```

## 2. Filter bijwerken

`PATCH /v1/devices/:id/filter`, header `x-install-token: <installationToken>`.

```json
{
  "lat": -37.81, "lon": 144.96,
  "radiusKm": 20,
  "radiusPerService": { "Fire": 100, "Rescue": 10 },
  "services": ["Fire", "Ambulance", "Rescue", "Storm", "Hazmat", "Other"],
  "warningsOnly": false,
  "emergencyWarningsAnywhere": false,
  "sound": "zacht",
  "notificationsEnabled": true,
  "critical": false
}
```

- `services` gebruikt de dienstnamen van de app. Indeling op de `category` uit de feed: `fire` en `planned` → Fire, `ambulance` → Ambulance, `rescue` → Rescue, `storm` → Storm, `hazmat` → Hazmat, de rest → Other.
- `radiusPerService` overschrijft `radiusKm` per dienst. Een waarde van 5000 of meer betekent "heel Australië".
- `warningsOnly`: alleen pushen als het incident een waarschuwingsniveau heeft (Advice, Watch and Act, Emergency Warning).
- `emergencyWarningsAnywhere`: push bij elke Emergency Warning in Australië, los van straal en diensten, en ook als `notificationsEnabled` uit staat.
- `critical` (24-10-2026): een Emergency Warning voor de eigen plek (in het gebied of binnen de straal) gaat als kritieke melding, die door stil en Focus heen breekt. Nooit voor de meldingen van `emergencyWarningsAnywhere` en nooit voor lagere niveaus. iOS: `sound: { critical: 1 }` en `interruption-level: critical`. Dat werkt pas met Apple's Critical Alerts-entitlement in de app en toestemming van de gebruiker; anders komt hij binnen als gewone melding. Android: kanaal `dispatch_kritiek`, dat de app aanmaakt voordat hij `critical` aanzet.
- Ontbreken `lat`/`lon`, dan de opgeslagen plek houden.
- `401` bij een verkeerde of ontbrekende `x-install-token`.

## 3. Pushen

- Bij elk incident dat de collector voor het eerst ziet en dat een coördinaat heeft: push naar elk toestel met `notificationsEnabled`, de dienst aan, en een afstand binnen de straal van die dienst.
- Een verhoging van het waarschuwingsniveau (bijvoorbeeld Advice → Watch and Act) is ook een push waard. Een gewone statuswijziging niet.
- Een waarschuwing gaat over een gebied (24-10-2026). Ligt de plek van het toestel in dat gebied, dan krijgt het de push, hoe ver de pin ook is en ook als er geen pin is. Queensland- en SA-waarschuwingen hebben vaak alleen het gebied; die werden voorheen nooit gepusht. Een incidentgebied zonder waarschuwingsniveau (zoals een uitgebrand gebied) telt niet.
- Eén gebeurtenis, één push: NSW zet een Watch and Act zowel bij het incident (met pin) als in een losse waarschuwingsrij zonder plek. Per bron-id gaat alleen de rij met het hoogste niveau door, bij gelijk niveau die met een plek.
- Verzenden via de Expo Push API (`https://exp.host/--/api/v2/push/send`), in batches van maximaal 100.
- Inhoud: `title` "Grass fire in Kilmore", `body` "Lancefield Rd · Watch and Act · 4.2 km", `data: { "incidentId": "<id uit de feed>" }`. Tikken opent dan het juiste incident.
- Android: `channelId` "dispatch_snd_<sound>" (zie `mobile/src/geluiden.ts`, `kanaalVoor`). iOS: `sound` "<sound>.wav".
- Ontdubbelen per (toestel, incident, niveau), zodat een herstart van de collector geen tweede golf geeft.
- Receipts verwerken en ongeldige tokens (`DeviceNotRegistered`) verwijderen.

## Versturen: zo werkt het nu (gebouwd 19-10)

- `backend/push.mjs`, aangeroepen na elke geslaagde `ingest` in `server.mjs`.
- iOS: de app stuurt het eigen APNs-toestelnummer (64 hex-tekens). De server verstuurt rechtstreeks naar Apple met token-authenticatie. Railway-variabelen: `APNS_KEY` (inhoud van de .p8, of base64 daarvan), `APNS_KEY_ID`, `APNS_TEAM_ID` (HZN6L3J556), optioneel `APNS_TOPIC` (standaard `com.chrisschepers.dispatchau`) en `APNS_ENV=sandbox` voor ontwikkelbuilds. TestFlight en App Store gebruiken de productieserver.
- Expo-tokens (`ExponentPushToken[…]`) gaan via de Expo-pushdienst; dat pad bestaat voor later (Android).
- Zonder `APNS_KEY` slaat de server iOS over en logt dat.
- De eerste ronde per staat leert alleen wat er al staat; er komt dus geen golf meldingen na een deploy.

## Nog te regelen buiten de code

- iOS: een APNs-sleutel (.p8) in de Railway-variabelen hierboven, en de Push Notifications-capability op de App ID.
- Android: een Firebase-project met FCM, of een EAS-project voor Expo-tokens. Nog niet ingericht.
