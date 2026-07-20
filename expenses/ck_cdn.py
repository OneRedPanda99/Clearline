import csv, urllib.request, io, time
# fetch with aggressive cache-bust; raw CDN sometimes ignores ?ts, so try
# a couple times with different query strings
for attempt in range(3):
    url = "https://raw.githubusercontent.com/OneRedPanda99/Clearline/main/expenses/expenses.csv?x=" + str(time.time()) + "&a=" + str(attempt)
    req = urllib.request.Request(url, headers={"Cache-Control":"no-cache","Pragma":"no-cache"})
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        text = io.TextIOWrapper(resp, encoding="utf-8")
        rows = list(csv.DictReader(text))
        totals = [r["total"] for r in sorted(rows, key=lambda x: x["id"])]
        r2 = [r["r2_key"] for r in rows]
        print("attempt", attempt, "rows:", len(rows), "totals:", totals,
              "unique_r2:", len(r2)==len(set(r2)),
              "ok:", totals==["93.87","43.64","32.88","43.42"])
        if totals == ["93.87","43.64","32.88","43.42"]:
            print("LIVE CSV IS CORRECT"); break
    except Exception as e:
        print("attempt", attempt, "err:", e)
