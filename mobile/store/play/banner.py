# Google Play feature graphic (1024x500) for Emergencies Near Me: the light
# store style with the red wave, icon, headline and the Nearby screen.
# Run: python3 banner.py  (needs Google Chrome)
import os, subprocess
S = os.path.dirname(os.path.abspath(__file__))
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
W, H = 1024, 500
shot = f'file://{S}/../screenshots/raw/02-nearby.png'
icon = f'file://{S}/../../assets/icon.png'
html = f"""<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;800;900&display=block" rel="stylesheet">
<style>*{{margin:0;box-sizing:border-box}}body{{width:{W}px;height:{H}px;overflow:hidden;font-family:Inter,sans-serif;
background:linear-gradient(180deg,#f7f7f8,#e9e9eb);position:relative;color:#141414}}
svg{{position:absolute;inset:0}}
.icon{{position:absolute;left:64px;top:78px;width:84px;height:84px;border-radius:20px;background:url({icon}) center/cover;box-shadow:0 8px 20px #c8231a40}}
h1{{position:absolute;left:62px;top:190px;font-weight:900;font-size:62px;line-height:1.02;letter-spacing:-2.4px}}h1 span{{color:#e5372c}}
p{{position:absolute;left:64px;top:340px;width:470px;font-weight:500;font-size:22px;line-height:1.35;color:#55575d}}
.phone{{position:absolute;right:70px;top:46px;width:300px;height:620px;border-radius:44px;background:#101114;padding:10px;box-shadow:0 0 0 3px #3a3b40,0 30px 60px #00000040}}
.screen{{position:relative;width:100%;height:100%;border-radius:36px;overflow:hidden;background:#f2f2f7}}
.app{{position:absolute;left:0;right:0;top:30px;bottom:0;background:url({shot}) 0 -38px/100% auto no-repeat}}
.sb{{position:absolute;left:0;right:0;top:0;height:30px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;font:500 13px Roboto,Inter,sans-serif;color:#1c1c1e}}
.sb i{{display:inline-block;width:11px;height:11px;margin-left:5px;background:#1c1c1e}}
.cam{{position:absolute;left:50%;top:21px;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:#000}}
</style>
<svg width="{W}" height="{H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ef6b57"/><stop offset="1" stop-color="#d9392c"/></linearGradient></defs>
<path d="M560 {H} C 700 380, 820 300, {W} 120 L{W} {H} Z" fill="url(#g)"/></svg>
<div class="icon"></div><h1>Every emergency<br><span>near you</span>, live.</h1>
<p>Bushfire, flood and crash alerts across Australia.</p>
<div class="phone"><div class="screen"><div class="sb"><span>16:40</span><span><i style="clip-path:polygon(50% 100%,0 20%,100% 20%)"></i><i style="clip-path:polygon(100% 0,100% 100%,0 100%)"></i><i style="width:7px;border-radius:2px"></i></span></div><div class="app"></div></div><div class="cam"></div></div>"""
open(f'{S}/banner.html', 'w').write(html)
subprocess.run([CHROME, '--headless=new', '--hide-scrollbars', '--allow-file-access-from-files', f'--window-size={W},{H}',
                '--force-device-scale-factor=1', '--virtual-time-budget=4000', f'--screenshot={S}/feature-graphic-1024x500.png',
                f'file://{S}/banner.html'], check=True, capture_output=True)
os.remove(f'{S}/banner.html')
print('ok')
