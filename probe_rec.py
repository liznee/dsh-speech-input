import asyncio, json
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True,
            args=["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"])
        page = await browser.new_page()
        console = []
        net = []
        page.on("console", lambda m: console.append(f"{m.type}: {m.text[:200]}"))
        page.on("pageerror", lambda e: console.append(f"PAGEERROR: {str(e)[:300]}"))
        async def on_resp(r):
            try:
                ct = r.headers.get("content-type","")
                body = ""
                if "json" in ct:
                    try: body = await r.text()
                    except: pass
                net.append({"s": r.status, "m": r.request.method, "u": r.url, "body": body[:300]})
            except Exception as e:
                net.append({"s":"?","m":"?","u": r.url, "err": str(e)[:80]})
        page.on("response", on_resp)
        await page.goto("http://127.0.0.1:3080", wait_until="domcontentloaded", timeout=25000)
        await page.wait_for_timeout(3200)
        btn = page.locator("button.dsh-speech-input-button").first
        await btn.wait_for(timeout=8000)
        await btn.click()
        # Wait plenty of time for the recognition round-trip
        await page.wait_for_timeout(14000)
        st = await page.evaluate("""() => {
          const b = document.querySelector('.dsh-speech-input-button');
          const statusEl = document.querySelector('.dsh-speech-input-status');
          const ta = document.querySelector('[data-composer-card] textarea, textarea[placeholder]');
          return { active: b?b.dataset.active:null, label: b?(b.getAttribute('aria-label')||''):'',
                   statusText: statusEl?statusEl.textContent:null,
                   draft: ta?ta.value:null,
                   dataError: b?b.dataset.error:null, title: b?b.title:null };
        }""")
        print("STATE:", json.dumps(st, ensure_ascii=False))
        br = [x for x in net if any(k in x["u"] for k in ["recognize","bridge","8765"])]
        print("BRIDGE_NET:", json.dumps(br[-30:], ensure_ascii=False))
        print("CONSOLE:", json.dumps(console[-25:], ensure_ascii=False))
        await browser.close()

asyncio.run(main())
