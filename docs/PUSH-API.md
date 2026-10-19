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
  "notificationsEnabled": true
}
```

- `services` gebruikt de dienstnamen van de app. Indeling op de `category` uit de feed: `fire` en `planned` → Fire, `ambulance` → Ambulance, `rescue` → Rescue, `storm` → Storm, `hazmat` → Hazmat, de rest → Other.
- `radiusPerService` overschrijft `radiusKm` per dienst. Een waarde van 5000 of meer betekent "heel Australië".
- `warningsOnly`: alleen pushen als het incident een waarschuwingsniveau heeft (Advice, Watch and Act, Emergency Warning).
- `emergencyWarningsAnywhere`: push bij elke Emergency Warning in Australië, los van straal en diensten, en ook als `notificationsEnabled` uit staat.
- Ontbreken `lat`/`lon`, dan de opgeslagen plek houden.
- `401` bij een verkeerde of ontbrekende `x-install-token`.

## 3. Pushen

- Bij elk incident dat de collector voor het eerst ziet en dat een coördinaat heeft: push naar elk toestel met `notificationsEnabled`, de dienst aan, en een afstand binnen de straal van die dienst.
- Een verhoging van het waarschuwingsniveau (bijvoorbeeld Advice → Watch and Act) is ook een push waard. Een gewone statuswijziging niet.
- Verzenden via de Expo Push API (`https://exp.host/--/api/v2/push/send`), in batches van maximaal 100.
- Inhoud: `title` "Grass fire in Kilmore", `body` "Lancefield Rd · Watch and Act · 4.2 km", `data: { "incidentId": "<id uit de feed>" }`. Tikken opent dan het juiste incident.
- Android: `channelId` "dispatch_snd_<sound>" (zie `mobile/src/geluiden.ts`, `kanaalVoor`). iOS: `sound` "<sound>.wav".
- Ontdubbelen per (toestel, incident, niveau), zodat een herstart van de collector geen tweede golf geeft.
- Receipts verwerken en ongeldige tokens (`DeviceNotRegistered`) verwijderen.

## Nog te regelen buiten de code

- Een EAS-project voor de app: de app heeft een `projectId` nodig om een Expo-pushtoken op te halen. Dat zet je in `mobile/app.config.ts` onder `extra.eas.projectId`.
- APNs-sleutel (iOS) en FCM (Android) koppelen aan dat EAS-project.
