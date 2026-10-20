# App Store screenshots for Emergencies Near Me (20-10), in the style of the
# light Alarmeringen P2000 set: app icon, big headline with one red word, a
# subline and the simulator screen in an iPhone frame over a red wave.
# Input: raw simulator screens in raw/ (iPhone 17 Pro, 1206x2622, location
# Richmond VIC, TZ=Australia/Melbourne). Output: 1290x2796 PNGs in out/.
# Run: python3 maak.py  (needs Google Chrome)
import os, subprocess
S = os.path.dirname(os.path.abspath(__file__))
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
W, H = 1290, 2796

slides = [
  # file, line 1, (red part, rest), subline, notification banner (title, body) or None
  ('01-map', 'Every emergency', ('live', ' on the map'), 'Fires, crashes, storms and hazmat across Australia', None),
  ('02-nearby', 'What happens', ('near you', ''), 'Fire, ambulance, rescue and SES within your radius', None),
  ('03-detail', 'Know what is', ('going on', ''), 'Agency, status, resources and directions in one place', None),
  ('04-settings', 'Alerts for', ('your area', ''), 'Choose your radius and the services you care about', None),
  ('05-alert', 'Warnings the', ('moment', ' they land'), 'From Advice to Emergency Warning, straight to your phone',
   ('Grass fire in Kilmore', 'Lancefield Rd · Watch and Act · 4.2 km')),
]

pw, bez = 860, 18
sw = pw - 2 * bez
sh = sw * 2622 / 1206
ph = sh + 2 * bez
px = (W - pw) / 2
py = H - ph - 120
wy = 1.0
wave = f"M0 {H-900*wy} C 420 {H-900*wy}, 820 {H-1300*wy}, {W} {H-2050*wy} L{W} {H} L0 {H} Z"

os.makedirs(f'{S}/out', exist_ok=True)
for sid, l1, l2, sub, banner in slides:
  raw = sid
  img = f'file://{S}/raw/{raw}.png'
  melding = ''
  if banner:
    melding = f"""<div class="ban"><div class="bi"></div><div class="bt"><div class="br"><b>Emergencies</b><span>now</span></div>
<div class="bh">{banner[0]}</div><div class="bb">{banner[1]}</div></div></div>"""
  html = f"""<!doctype html><html lang="en"><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800;900&display=block" rel="stylesheet">
<style>*{{box-sizing:border-box;margin:0}}html,body{{width:{W}px;height:{H}px;overflow:hidden}}
.art{{position:relative;width:{W}px;height:{H}px;overflow:hidden;background:linear-gradient(180deg,#f7f7f8 0%,#ececee 55%,#e6e6e8 100%);font-family:Inter,sans-serif;color:#141414}}
svg.wave{{position:absolute;inset:0}}
.icon{{position:absolute;left:{(W-132)/2}px;top:120px;width:132px;height:132px;border-radius:30px;box-shadow:0 12px 30px #c8231a40;background:url(file://{S}/../../assets/icon.png) center/cover}}
h1{{position:absolute;top:300px;left:40px;right:40px;text-align:center;font-weight:900;font-size:124px;line-height:1.02;letter-spacing:-4.4px}}h1 .r{{color:#e5372c}}
.sub{{position:absolute;top:600px;left:70px;right:70px;text-align:center;font-weight:500;font-size:44px;line-height:1.25;color:#55575d;letter-spacing:-.4px}}
.phone{{position:absolute;left:{px}px;top:{py}px;width:{pw}px;height:{ph}px;border-radius:118px;background:#101114;padding:{bez}px;box-shadow:0 0 0 4px #3a3b40,0 0 0 7px #8a8d94,0 60px 110px #00000045}}
.screen{{position:relative;width:{sw}px;height:{sh}px;border-radius:100px;overflow:hidden;background:url({img}) 0 0/{sw}px {sh}px no-repeat}}
.island{{position:absolute;left:50%;top:{sh*0.0125}px;width:{sw*0.31}px;height:{sh*0.0215}px;margin-left:-{sw*0.155}px;border-radius:40px;background:#000}}
.ban{{position:absolute;left:28px;right:28px;top:{sh*0.065}px;border-radius:44px;padding:28px 30px;display:flex;gap:24px;align-items:flex-start;
background:rgba(250,250,252,.82);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);box-shadow:0 18px 50px #00000040;font-family:-apple-system,'SF Pro Text',Inter,sans-serif}}
.bi{{flex:none;width:76px;height:76px;border-radius:18px;background:url(file://{S}/../../assets/icon.png) center/cover}}
.bt{{flex:1;min-width:0}}.br{{display:flex;justify-content:space-between;font-size:26px;color:#6b6d73;margin-bottom:4px}}.br b{{font-weight:600;color:#6b6d73;text-transform:uppercase;letter-spacing:.5px;font-size:24px}}
.bh{{font-size:33px;font-weight:700;color:#111}}.bb{{font-size:31px;color:#222;margin-top:2px}}
</style><main class="art">
<svg class="wave" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ef6b57"/><stop offset="1" stop-color="#d9392c"/></linearGradient></defs><path d="{wave}" fill="url(#g)"/></svg>
<div class="icon"></div>
<h1>{l1}<br><span class="r">{l2[0]}</span>{l2[1]}</h1><p class="sub">{sub}</p>
<div class="phone"><div class="screen"><div class="island"></div>{melding}</div></div></main></html>"""
  pad = f'{S}/out/{sid}.html'
  open(pad, 'w').write(html)
  subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
                  f'--window-size={W},{H}', '--force-device-scale-factor=1', '--virtual-time-budget=4000',
                  f'--screenshot={S}/out/{sid}.png', f'file://{pad}'], check=True, capture_output=True)
  os.remove(pad)
  print(sid)
